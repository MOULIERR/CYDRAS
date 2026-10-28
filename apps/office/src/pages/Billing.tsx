// Owner only: your Cydras plan, and connecting your bank so card payments reach you.
import { useState } from 'react';
import { supabase, check, callFunction } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';

const PLANS = [
  { id: 'solo', name: 'Solo', price: 49, seats: '1 person' },
  { id: 'team', name: 'Team', price: 125, seats: 'Up to 5 people' },
  { id: 'pro', name: 'Pro', price: 249, seats: 'Up to 10 people' },
];

export function Billing() {
  const { member } = useSession();
  const c = member!.company_id;
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const { data } = useLive(async () => ({
    sub: check(await supabase.from('subscriptions').select('*').eq('company_id', c).maybeSingle()) as any,
    acct: check(await supabase.from('payment_accounts').select('*').eq('company_id', c).maybeSingle()) as any,
  }), ['subscriptions', 'payment_accounts'], c, [c]);
  async function go(fn: string, body: Record<string, unknown>) {
    setBusy(fn); setErr('');
    try { const { url } = await callFunction<{ url: string }>(fn, { company_id: c, ...body }); window.location.href = url; }
    catch (e) { setErr((e as Error).message); setBusy(''); }
  }
  if (!data) return <div className="muted">Loading…</div>;
  const s = data.sub;
  const days = s ? Math.max(0, Math.ceil((new Date(s.trial_ends_at).getTime() - Date.now()) / 86400000)) : 0;
  const label: Record<string, string> = { trialing: `Free trial · ${days} days left`, active: 'Active', past_due: 'Payment failed — update your card', canceled: 'Canceled', paused: 'Paused' };
  return (
    <>
      <h1>Billing</h1>
      {err && <div className="err">{err}</div>}
      <div className="card">
        <h2>Your Cydras plan</h2>
        <p><span className={`pill ${s?.status === 'active' ? 'ok' : s?.status === 'trialing' ? 'go' : 'bad'}`}>{label[s?.status] ?? 'No plan'}</span> {s && <>· {s.plan} plan · {s.seats} seats</>}</p>
        {s?.current_period_end && <p className="muted">Next charge {new Date(s.current_period_end).toLocaleDateString()}</p>}
        <div className="grid">
          {PLANS.map((p) => (
            <div className="card" key={p.id} style={{ border: s?.plan === p.id ? '2px solid var(--accent)' : undefined }}>
              <b>{p.name}</b><span style={{ fontSize: 24, fontWeight: 800 }}>${p.price}<span className="muted">/mo</span></span><span className="muted">{p.seats}</span>
              {!s?.stripe_subscription_id && <button className="pri" disabled={!!busy} onClick={() => go('billing-checkout', { plan: p.id })}>{busy === 'billing-checkout' ? 'Opening…' : 'Pick this plan'}</button>}
            </div>
          ))}
        </div>
        {s?.stripe_subscription_id && <button disabled={!!busy} onClick={() => go('billing-portal', {})}>Change plan, card, or cancel</button>}
        <p className="muted">Your trial days carry over — you're not charged until the trial ends.</p>
      </div>
      <div className="card">
        <h2>Get paid by card</h2>
        {data.acct?.charges_enabled
          ? <p><span className="pill ok">Connected</span> Card and Tap to Pay money goes to your bank{data.acct.payouts_enabled ? '' : ' (bank payouts still being checked)'}.</p>
          : <p>Connect your bank through Stripe so techs can take cards with Tap to Pay and send pay links. Takes about 10 minutes.</p>}
        <button className={data.acct?.charges_enabled ? '' : 'pri'} disabled={!!busy} onClick={() => go('connect-onboard', {})}>{data.acct?.stripe_account_id ? 'Finish or update bank setup' : 'Connect my bank'}</button>
      </div>
    </>
  );
}
