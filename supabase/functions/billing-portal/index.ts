// Owner manages their Cydras card, invoices, plan, or cancels. Opens the Stripe billing portal.
import { serve, json, env, HttpError } from '../_shared/http.ts';
import { requireUser, requireMember } from '../_shared/db.ts';
import { stripe } from '../_shared/stripe.ts';

Deno.serve(serve(async (req) => {
  const { company_id } = await req.json();
  const { user, db } = await requireUser(req);
  await requireMember(db, user.id, company_id, (m) => m.role === 'owner');
  const { data: sub } = await db.from('subscriptions').select('stripe_customer_id').eq('company_id', company_id).single();
  if (!sub?.stripe_customer_id) throw new HttpError(400, 'Pick a plan first');
  const s = await stripe('billing_portal/sessions', { customer: sub.stripe_customer_id, return_url: `${env('APP_URL')}/billing` });
  return json({ url: s.url });
}));
