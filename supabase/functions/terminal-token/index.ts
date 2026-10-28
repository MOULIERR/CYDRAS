// Lets the tech's phone act as a card reader (Tap to Pay on iPhone / Android), on the shop's account.
import { serve, json, HttpError } from '../_shared/http.ts';
import { requireUser, requireMember, can, must } from '../_shared/db.ts';
import { stripe } from '../_shared/stripe.ts';

Deno.serve(serve(async (req) => {
  const { company_id } = await req.json();
  const { user, db } = await requireUser(req);
  await requireMember(db, user.id, company_id, (m) => can(m, 'payments'));
  const { data: acct } = must(await db.from('payment_accounts').select('*').eq('company_id', company_id).maybeSingle());
  if (!acct?.stripe_account_id || !acct.charges_enabled) throw new HttpError(400, 'The owner needs to connect the bank first');
  let location = acct.terminal_location_id as string | null;
  if (!location) {
    const { data: co } = must(await db.from('companies').select('name, settings').eq('id', company_id).maybeSingle());
    if (!co) throw new HttpError(404, 'Company not found');
    const a = co.settings?.address ?? {};
    if (!a.line1 || !a.city || !a.state || !a.postal_code) throw new HttpError(400, 'Add your shop address in Account first');
    const loc = await stripe('terminal/locations', { display_name: co.name, address: { ...a, country: 'US' } }, { account: acct.stripe_account_id });
    location = loc.id;
    must(await db.from('payment_accounts').update({ terminal_location_id: location }).eq('company_id', company_id));
  }
  const t = await stripe('terminal/connection_tokens', { location }, { account: acct.stripe_account_id });
  return json({ secret: t.secret, location, account: acct.stripe_account_id });
}));
