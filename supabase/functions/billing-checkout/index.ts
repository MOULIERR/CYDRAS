// Owner picks a plan and pays for Cydras. Opens Stripe Checkout. Any free-trial days left are kept.
import { serve, json, env, HttpError } from '../_shared/http.ts';
import { requireUser, requireMember, must } from '../_shared/db.ts';
import { stripe } from '../_shared/stripe.ts';
import { PLANS, isPlan, remainingTrialEnd } from '../_shared/billing.ts';

Deno.serve(serve(async (req) => {
  const { company_id, plan } = await req.json();
  if (!isPlan(plan)) throw new HttpError(400, 'Pick Solo, Team, or Pro');
  const { user, db } = await requireUser(req);
  await requireMember(db, user.id, company_id, (m) => m.role === 'owner');
  const { data: sub } = must(await db.from('subscriptions').select('*').eq('company_id', company_id).maybeSingle());
  const { data: co } = must(await db.from('companies').select('name, email').eq('id', company_id).maybeSingle());
  if (!co || !sub) throw new HttpError(404, 'Company not found');

  let customer = sub.stripe_customer_id as string | null;
  if (!customer) {
    const c = await stripe('customers', { name: co.name, email: co.email ?? user.email, metadata: { company_id } });
    customer = c.id;
    must(await db.from('subscriptions').update({ stripe_customer_id: customer }).eq('company_id', company_id));
  }
  const trialEnd = sub.status === 'trialing' ? remainingTrialEnd(sub.trial_ends_at) : null;
  const session = await stripe('checkout/sessions', {
    mode: 'subscription',
    customer,
    line_items: [{ price: env(PLANS[plan].priceEnv), quantity: 1 }],
    subscription_data: { metadata: { company_id, plan }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
    metadata: { company_id, plan },
    allow_promotion_codes: true,
    success_url: `${env('APP_URL')}/billing?paid=1`,
    cancel_url: `${env('APP_URL')}/billing`,
  }, { idempotencyKey: `checkout-${company_id}-${plan}-${new Date().toISOString().slice(0, 13)}` });
  return json({ url: session.url });
}));
