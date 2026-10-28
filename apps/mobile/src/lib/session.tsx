// Who is signed in, and which company and role they have.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { startSync, stopSync, syncNow } from './sync';
import { stopShiftTracking } from './location';
import { registerForPush } from './push';

export type Member = { id: string; company_id: string; name: string; role: 'owner' | 'supervisor' | 'tech' | 'apprentice'; perms: Record<string, boolean> };
type Ctx = { session: Session | null; member: Member | null; loading: boolean; refresh: () => Promise<void>; signOut: () => Promise<void> };

const SessionCtx = createContext<Ctx>({ session: null, member: null, loading: true, refresh: async () => {}, signOut: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMember(s: Session | null) {
    if (!s) { setMember(null); return; }
    const { data } = await supabase.from('members').select('id, company_id, name, role, perms').eq('user_id', s.user.id).eq('active', true).limit(1).maybeSingle();
    setMember((data as Member) ?? null);
    if (data) { await startSync(); void registerForPush(s.user.id).catch(() => null); }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => { setSession(data.session); await loadMember(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); void loadMember(s); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: Ctx = {
    session, member, loading,
    refresh: () => loadMember(session),
    signOut: async () => { await syncNow().catch(() => {}); await stopShiftTracking().catch(() => {}); await stopSync(true); await supabase.auth.signOut(); setMember(null); },
  };
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);

const DEFAULTS: Record<Member['role'], Record<string, boolean>> = {
  owner: {},
  supervisor: { seePrices: true, schedule: true, assign: true, allJobs: true, customers: true, estimates: true, payments: true, prices: true, discounts: true, remove: true, inventory: true },
  tech: { seePrices: true, customers: true, estimates: true, payments: true, discounts: true },
  apprentice: {},
};
export function can(m: Member | null, perm: string): boolean {
  if (!m) return false;
  if (m.role === 'owner') return true;
  return m.perms?.[perm] ?? DEFAULTS[m.role][perm] ?? false;
}
export const isManager = (m: Member | null) => m?.role === 'owner' || m?.role === 'supervisor';
