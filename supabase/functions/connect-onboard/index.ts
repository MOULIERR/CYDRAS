// Owner connects their bank so card payments get deposited to them (Stripe Connect Express).
import { serve, json, env, HttpError } from '../_shared/http.ts';
import { requireUser, requireMember, must } from '../_shared/db.ts';
import { stripe } from '../_shared/stripe.ts';

Deno.serve(serve(async (req) => {
  const { company_id } = await req.json();
  const { user, db } = await requireUser(req);
  await requireMember(db, user.id, company_id, (m) => m.role === 'owner');
  const { data: pa } = must(await db.from('payment_accounts').select('stripe_account_id').eq('company_id', company_id).maybeSingle());
  const { data: co } = must(await db.from('companies').select('name, email, phone').eq('id', company_id).maybeSingle());
  if (!co) throw new HttpError(404, 'Company not found');
  let acct = pa?.stripe_account_id as string | null;
  if (!acct) {
    const a = await stripe('accounts', {
      type: 'express', country: 'US', email: co.email ?? user.email,
      business_profile: { name: co.name, mcc: '1711', product_description: 'Heating and air conditioning service' },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { company_id },
    }, { idempotencyKey: `acct-${company_id}` });
    acct = a.id;
    must(await db.from('payment_accounts').update({ stripe_account_id: acct }).eq('company_id', company_id));
  }
  const link = await stripe('account_links', {
    account: acct, type: 'account_onboarding',
    refresh_url: `${env('APP_URL')}/settings/bank?retry=1`, return_url: `${env('APP_URL')}/settings/bank?done=1`,
  });
  return json({ url: link.url });
}));
