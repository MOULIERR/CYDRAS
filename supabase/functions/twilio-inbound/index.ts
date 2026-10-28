// Customer texts back (or Twilio reports a delivery). Handles STOP / START, saves the message,
// and pings the owner and supervisors.
import { env } from '../_shared/http.ts';
import { admin, must } from '../_shared/db.ts';
import { verifyTwilio } from '../_shared/crypto.ts';
import { inboundKeyword, toE164 } from '../_shared/sms.ts';
import { buildPush, sendPush } from '../_shared/push.ts';

const twiml = (msg?: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg}</Message>` : ''}</Response>`, { headers: { 'Content-Type': 'text/xml' } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const form = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
  const publicUrl = `${env('FUNCTIONS_URL')}/twilio-inbound${url.search}`;
  if (!(await verifyTwilio(publicUrl, form, req.headers.get('x-twilio-signature'), env('TWILIO_AUTH_TOKEN')))) return new Response('bad signature', { status: 403 });
  const db = admin();

  if (url.searchParams.get('status')) { // delivery report
    const map: Record<string, string> = { delivered: 'delivered', undelivered: 'failed', failed: 'failed', sent: 'sent' };
    if (map[form.MessageStatus]) must(await db.from('messages').update({ status: map[form.MessageStatus], error: form.ErrorCode ?? null }).eq('provider_id', form.MessageSid));
    return new Response('ok');
  }

  const to = toE164(form.To ?? ''), from = toE164(form.From ?? '');
  const { data: co } = must(await db.from('companies').select('id, name').eq('sms_number', to).maybeSingle());
  if (!co || !from) return twiml();
  const { data: contacts } = must(await db.from('customer_contacts').select('id, customer_id, value').eq('company_id', co.id).eq('kind', 'phone').is('deleted_at', null));
  const match = (contacts ?? []).filter((c) => toE164(c.value) === from);
  const kw = inboundKeyword(form.Body ?? '');
  if (kw === 'stop') must(await db.from('customer_contacts').update({ opted_out_at: new Date().toISOString() }).in('id', match.map((c) => c.id)));
  if (kw === 'start') must(await db.from('customer_contacts').update({ opted_out_at: null, sms_consent_at: new Date().toISOString(), sms_consent_source: 'texted START' }).in('id', match.map((c) => c.id)));
  must(await db.from('messages').insert({ company_id: co.id, customer_id: match[0]?.customer_id ?? null, direction: 'in', from_number: from, to_number: to, body: form.Body ?? '', status: 'received', provider_id: form.MessageSid, sent_by: null }));

  const { data: mgrs } = must(await db.from('members').select('user_id').eq('company_id', co.id).in('role', ['owner', 'supervisor']).eq('active', true));
  const { data: tokens } = must(await db.from('push_tokens').select('token').in('user_id', (mgrs ?? []).map((m) => m.user_id).filter(Boolean)));
  await sendPush(buildPush((tokens ?? []).map((t) => t.token), 'New text from a customer', (form.Body ?? '').slice(0, 120), { screen: 'inbox', customer_id: match[0]?.customer_id }));

  if (kw === 'stop') return twiml(`${co.name}: You won't get any more texts. Reply START to get them again.`);
  if (kw === 'help') return twiml(`${co.name}: Call us for help. Reply STOP to stop texts.`);
  return twiml();
});
