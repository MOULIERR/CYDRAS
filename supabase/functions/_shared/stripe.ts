// Tiny Stripe client (no extra packages). Card payments go to each shop's own Stripe account
// (Stripe Connect), so we pass `account` for anything that touches a shop's money.
import { env, HttpError } from './http.ts';
import { toForm } from './form.ts';

type Opts = { method?: 'GET' | 'POST' | 'DELETE'; account?: string | null; idempotencyKey?: string };

export async function stripe<T = any>(path: string, params: Record<string, unknown> = {}, opts: Opts = {}): Promise<T> {
  const method = opts.method ?? 'POST';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': '2024-06-20',
  };
  if (opts.account) headers['Stripe-Account'] = opts.account;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  const body = toForm(params);
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && body ? `?${body}` : ''}`;
  const res = await fetch(url, { method, headers, body: method === 'GET' ? undefined : body });
  const data = await res.json();
  if (!res.ok) throw new HttpError(402, data?.error?.message ?? 'The card company said no');
  return data as T;
}
