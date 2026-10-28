// Refunds a card payment (all or part) back to the customer's card. Owner, or a supervisor with payments.
import { serve, json, HttpError, toCents } from '../_shared/http.ts';
import { requireUser, requireMember, canFixPayments, must } from '../_shared/db.ts';
import { stripe } from '../_shared/stripe.ts';
import { refundable } from '../_shared/balance.ts';

Deno.serve(serve(async (req) => {
  const { payment_id, amount, reason } = await req.json();
  if (!reason || !String(reason).trim()) throw new HttpError(400, 'Add a reason');
  const { user, db } = await requireUser(req);
  const { data: p } = must(await db.from('payments').select('*').eq('id', payment_id).maybeSingle());
  if (!p) throw new HttpError(404, 'Payment not found');
  await requireMember(db, user.id, p.company_id, canFixPayments);
  if (!p.stripe_payment_intent_id) throw new HttpError(400, 'This was not a card payment. Record the refund instead.');
  const left = refundable(p);
  const amt = amount == null ? left : Number(amount);
  if (!(amt > 0) || amt > left + 0.001) throw new HttpError(400, `You can refund up to $${left.toFixed(2)}`);
  const { data: acct } = must(await db.from('payment_accounts').select('stripe_account_id').eq('company_id', p.company_id).maybeSingle());
  if (!acct?.stripe_account_id) throw new HttpError(400, 'Payments account not connected');
  const r = await stripe('refunds', { payment_intent: p.stripe_payment_intent_id, amount: toCents(amt), metadata: { reason, by: user.id } },
    { account: acct.stripe_account_id, idempotencyKey: `refund-${p.id}-${toCents(Number(p.refunded_amount) + amt)}` });
  must(await db.from('payments').update({ refunded_amount: Math.round((Number(p.refunded_amount) + amt) * 100) / 100, refund_reason: reason }).eq('id', p.id));
  return json({ ok: true, status: r.status, refunded: amt });
}));
