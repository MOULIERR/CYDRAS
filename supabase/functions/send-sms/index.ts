// Sends a text to a customer from the shop's business number. Checks consent, STOP replies and quiet hours.
import { serve, json, env, HttpError } from '../_shared/http.ts';
import { requireUser, requireMember, can, must } from '../_shared/db.ts';
import { checkSms, toE164, withFooter, type SmsKind } from '../_shared/sms.ts';
import { sendTwilioSms } from '../_shared/twilio.ts';

const KINDS: SmsKind[] = ['manual', 'on_my_way', 'reminder', 'receipt', 'estimate', 'review', 'marketing', 'booking', 'system'];

Deno.serve(serve(async (req) => {
  const { company_id, customer_id, body, kind = 'manual' } = await req.json();
  if (!KINDS.includes(kind)) throw new HttpError(400, 'Unknown kind of text');
  if (!body || !String(body).trim()) throw new HttpError(400, 'Type a message');
  if (String(body).length > 1000) throw new HttpError(400, 'That message is too long');
  const { user, db } = await requireUser(req);
  await requireMember(db, user.id, company_id, kind === 'marketing' ? (m) => m.role === 'owner' || m.role === 'supervisor' : undefined);
  const { data: co } = must(await db.from('companies').select('name, sms_number, timezone').eq('id', company_id).maybeSingle());
  if (!co?.sms_number) throw new HttpError(400, 'Texting is not set up yet. The owner adds a business number in Settings.');
  const { data: phones } = must(await db.from('customer_contacts').select('value, sms_consent_at, opted_out_at, is_primary')
    .eq('company_id', company_id).eq('customer_id', customer_id).eq('kind', 'phone').is('deleted_at', null).order('is_primary', { ascending: false }));
  const contact = phones?.[0] ?? null;
  const check = checkSms(contact, kind, new Date(), co.timezone);
  const text = withFooter(String(body), kind, co.name);
  const to = contact ? toE164(contact.value) : null;
  if (!check.ok) {
    must(await db.from('messages').insert({ company_id, customer_id, direction: 'out', to_number: to, from_number: co.sms_number, body: text, kind, status: 'blocked', error: check.reason, sent_by: user.id }));
    throw new HttpError(422, check.reason);
  }
  const { data: msg } = must(await db.from('messages').insert({ company_id, customer_id, direction: 'out', to_number: to, from_number: co.sms_number, body: text, kind, status: 'queued', sent_by: user.id }).select('id').maybeSingle());
  try {
    const r = await sendTwilioSms(co.sms_number, to!, text, `${env('FUNCTIONS_URL')}/twilio-inbound?status=1`);
    must(await db.from('messages').update({ status: 'sent', provider_id: r.sid }).eq('id', msg!.id));
    return json({ ok: true, id: msg!.id });
  } catch (e) {
    must(await db.from('messages').update({ status: 'failed', error: String((e as Error).message) }).eq('id', msg!.id));
    throw e;
  }
}));
