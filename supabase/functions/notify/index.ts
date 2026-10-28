// Called by the database when a tech is put on a job (Database Webhook on job_assignments, INSERT).
// Sends a push notification: "New job: No cooling at Sunrise Plaza, Thu 7:30 AM".
import { env } from '../_shared/http.ts';
import { admin } from '../_shared/db.ts';
import { buildPush, sendPush } from '../_shared/push.ts';

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== env('DB_WEBHOOK_SECRET')) return new Response('no', { status: 401 });
  const { type, table, record } = await req.json();
  if (type !== 'INSERT' || table !== 'job_assignments' || record.deleted_at) return new Response('skip');
  const db = admin();
  const { data: m } = await db.from('members').select('user_id').eq('id', record.member_id).single();
  if (!m?.user_id) return new Response('no user');
  const { data: job } = await db.from('jobs').select('id, type, category, starts_at, customers(name), companies(timezone)').eq('id', record.job_id).single();
  const tz = (job as any)?.companies?.timezone ?? 'America/New_York';
  const when = new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(job!.starts_at));
  const { data: tokens } = await db.from('push_tokens').select('token').eq('user_id', m.user_id);
  const out = await sendPush(buildPush((tokens ?? []).map((t) => t.token), `New job: ${job!.category ?? job!.type}`, `${(job as any).customers?.name ?? ''} · ${when}`, { screen: 'job', job_id: job!.id }));
  if (out.badTokens.length) await db.from('push_tokens').delete().in('token', out.badTokens);
  return new Response('ok');
});
