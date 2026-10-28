// Database access for server functions.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { env, HttpError } from './http.ts';

export function admin(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

/** The signed-in person making the request. Throws if not signed in. */
export async function requireUser(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in first');
  const db = admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sign in again');
  return { user: data.user, db };
}

export type Member = { id: string; company_id: string; role: 'owner' | 'supervisor' | 'tech' | 'apprentice'; perms: Record<string, boolean>; name: string };

const DEFAULTS: Record<Member['role'], Record<string, boolean>> = {
  owner: {},
  supervisor: { payments: true, schedule: true, assign: true, allJobs: true, inventory: true, customers: true, estimates: true },
  tech: { payments: true, customers: true, estimates: true },
  apprentice: {},
};

export function can(m: Member, perm: string): boolean {
  if (m.role === 'owner') return true;
  return m.perms?.[perm] ?? DEFAULTS[m.role][perm] ?? false;
}

export async function requireMember(db: SupabaseClient, userId: string, companyId: string, check?: (m: Member) => boolean): Promise<Member> {
  const { data } = await db.from('members').select('id, company_id, role, perms, name').eq('company_id', companyId).eq('user_id', userId).eq('active', true).maybeSingle();
  if (!data) throw new HttpError(403, 'You are not part of this company');
  if (check && !check(data as Member)) throw new HttpError(403, 'You are not allowed to do this');
  return data as Member;
}

export const isManager = (m: Member) => m.role === 'owner' || m.role === 'supervisor';
export const canFixPayments = (m: Member) => m.role === 'owner' || (m.role === 'supervisor' && can(m, 'payments'));

/** Supabase doesn't throw on a failed write; this does, so money and opt-outs are never silently lost. */
export function must<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}
