// Stripe tells us when things happen: a shop paid for Cydras, a card payment went through,
// a refund finished, or a shop finished setting up their payments account.
import { env } from '../_shared/http.ts';
import { admin, must } from '../_shared/db.ts';
import { verifyStripe } from '../_shared/crypto.ts';
import { mapStatus, planFromPrice, PLANS, type Plan } from '../_shared/billing.ts';

Deno.serve(async (req) => {
  const raw = await req.text();
  const okPlatform = await verifyStripe(raw, req.headers.get('stripe-signature'), env('STRIPE_WEBHOOK_SECRET'));
  const okConnect = !okPlatform && (await verifyStripe(raw, req.headers.get('stripe-signature'), env('STRIPE_CONNECT_WEBHOOK_SECRET')));
  if (!okPlatform && !okConnect) return new Response('bad signature', { status: 400 });

  const event = JSON.parse(raw);
  const db = admin();
  const { error: dup } = must(await db.from('processed_events').insert({ id: event.id, source: 'stripe' }));
  if (dup?.code === '23505') return new Response('already handled', { status: 200 });
  if (dup) return new Response('try again', { status: 500 });

  const o = event.data.object;
  try {
    switch (event.type) {
      // ---- Cydras subscriptions ----
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const company_id = o.metadata?.company_id;
        if (!company_id) break;
        const priceIds = Object.fromEntries((Object.keys(PLANS) as Plan[]).map((p) => [p, Deno.env.get(PLANS[p].priceEnv) ?? ''])) as Record<Plan, string>;
        const plan = planFromPrice(o.items?.data?.[0]?.price?.id ?? '', priceIds) ?? o.metadata?.plan ?? 'team';
        must(await db.from('subscriptions').update({
          status: event.type === 'customer.subscription.deleted' ? 'canceled' : mapStatus(o.status),
          plan,
          seats: PLANS[plan as Plan]?.seats ?? 5,
          stripe_subscription_id: o.id,
          current_period_end: o.current_period_end ? new Date(o.current_period_end * 1000).toISOString() : null,
          ...(o.trial_end ? { trial_ends_at: new Date(o.trial_end * 1000).toISOString() } : {}),
        }).eq('company_id', company_id));
        break;
      }
      case 'invoice.payment_failed': {
        if (o.subscription) must(await db.from('subscriptions').update({ status: 'past_due' }).eq('stripe_subscription_id', o.subscription));
        break;
      }
      // ---- A shop's payments account (Stripe Connect) ----
      case 'account.updated': {
        must(await db.from('payment_accounts').update({ charges_enabled: !!o.charges_enabled, payouts_enabled: !!o.payouts_enabled }).eq('stripe_account_id', o.id));
        break;
      }
      // ---- Customer card payments (on the shop's account) ----
      case 'payment_intent.succeeded': {
        const m = o.metadata ?? {};
        if (!m.company_id || !m.customer_id) break;
        must(await db.from('payments').upsert({
          company_id: m.company_id, invoice_id: m.invoice_id || null, job_id: m.job_id || null, customer_id: m.customer_id,
          method: m.method || 'card_link', amount: o.amount_received / 100, status: 'succeeded',
          stripe_payment_intent_id: o.id, taken_by: m.taken_by || null, reference: o.latest_charge ?? null,
        }, { onConflict: 'stripe_payment_intent_id' }));
        break;
      }
      case 'charge.refunded': {
        if (o.payment_intent) must(await db.from('payments').update({ refunded_amount: o.amount_refunded / 100 }).eq('stripe_payment_intent_id', o.payment_intent));
        break;
      }
    }
  } catch (e) {
    await db.from('processed_events').delete().eq('id', event.id); // let Stripe retry
    console.error(e);
    return new Response('error', { status: 500 });
  }
  return new Response('ok', { status: 200 });
});
