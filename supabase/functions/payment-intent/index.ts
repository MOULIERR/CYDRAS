// Starts a card payment for an invoice, on the shop's own Stripe account.
// method 'tap_to_pay': the tech's phone reads the card (Stripe Terminal).
// method 'card_link': we text the customer a secure pay link.
import { serve, json, env, HttpError, toCents } from '../_shared/http.ts';
import { requireUser, requireMember, can } from '../_shared/db.ts';
import { stripe } from '../_shared/stripe.ts';
import { balanceDue } from '../_shared/balance.ts';

Deno.serve(serve(async (req) => {
  const { invoice_id, method, amount } = await req.json();
  if (!['tap_to_pay', 'card_link'].includes(method)) throw new HttpError(400, 'Pick Tap to Pay or a pay link');
  const { user, db } = await requireUser(req);
  const { data: inv } = await db.from('invoices').select('id, company_id, customer_id, job_id, total, number').eq('id', invoice_id).single();
  if (!inv) throw new HttpError(404, 'Invoice not found');
  const m = await requireMember(db, user.id, inv.company_id, (x) => can(x, 'payments'));
  const { data: acct } = await db.from('payment_accounts').select('stripe_account_id, charges_enabled').eq('company_id', inv.company_id).single();
  if (!acct?.stripe_account_id || !acct.charges_enabled) throw new HttpError(400, 'The owner needs to connect the bank first (Settings, Bank & payouts)');
  const { data: pays } = await db.from('payments').select('amount, refunded_amount, voided_at, status').eq('invoice_id', inv.id);
  const due = balanceDue(inv.total, pays ?? []);
  const charge = amount ? Math.min(Number(amount), due) : due;
  if (charge <= 0) throw new HttpError(400, 'Nothing is owed on this invoice');

  const metadata = { company_id: inv.company_id, invoice_id: inv.id, job_id: inv.job_id ?? '', customer_id: inv.customer_id, taken_by: user.id, method };
  if (method === 'tap_to_pay') {
    const pi = await stripe('payment_intents', {
      amount: toCents(charge), currency: 'usd', payment_method_types: ['card_present'], capture_method: 'automatic', metadata,
      description: `Invoice ${inv.number}`,
    }, { account: acct.stripe_account_id, idempotencyKey: `pi-${inv.id}-${toCents(charge)}-${Date.now() / 60000 | 0}` });
    return json({ client_secret: pi.client_secret, amount: charge, taken_by: m.name });
  }
  const session = await stripe('checkout/sessions', {
    mode: 'payment',
    line_items: [{ price_data: { currency: 'usd', unit_amount: toCents(charge), product_data: { name: `Invoice ${inv.number}` } }, quantity: 1 }],
    payment_intent_data: { metadata, description: `Invoice ${inv.number}` },
    success_url: `${env('APP_URL')}/paid`, cancel_url: `${env('APP_URL')}/pay-cancelled`,
  }, { account: acct.stripe_account_id });
  return json({ url: session.url, amount: charge });
}));
