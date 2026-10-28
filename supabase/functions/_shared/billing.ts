// Cydras plans and how Stripe subscription states map to what the app allows.

export const PLANS = {
  solo: { name: 'Solo', monthly: 49, seats: 1, priceEnv: 'STRIPE_PRICE_SOLO' },
  team: { name: 'Team', monthly: 125, seats: 5, priceEnv: 'STRIPE_PRICE_TEAM' },
  pro: { name: 'Pro', monthly: 249, seats: 10, priceEnv: 'STRIPE_PRICE_PRO' },
} as const;
export type Plan = keyof typeof PLANS;

export function isPlan(p: unknown): p is Plan {
  return typeof p === 'string' && p in PLANS;
}

/** Stripe subscription status -> our status (trialing | active | past_due | canceled | paused). */
export function mapStatus(stripeStatus: string): 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused' {
  switch (stripeStatus) {
    case 'trialing': return 'trialing';
    case 'active': return 'active';
    case 'past_due':
    case 'unpaid':
    case 'incomplete': return 'past_due';
    case 'paused': return 'paused';
    default: return 'canceled'; // canceled, incomplete_expired
  }
}

/** Seconds until the trial ends, so paying early doesn't cut the free trial short. Null if it's over. */
export function remainingTrialEnd(trialEndsAt: string, now = new Date()): number | null {
  const t = Math.floor(new Date(trialEndsAt).getTime() / 1000);
  return t - Math.floor(now.getTime() / 1000) > 3600 * 48 ? t : null;
}

export function planFromPrice(priceId: string, priceIds: Record<Plan, string>): Plan | null {
  return (Object.keys(priceIds) as Plan[]).find((p) => priceIds[p] === priceId) ?? null;
}
