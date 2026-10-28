import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { DEF } from './perms';

export type Member = { id: string; company_id: string; name: string; role: 'owner' | 'supervisor' | 'tech' | 'apprentice'; perms: Record<string, boolean> };
type Ctx = { session: Session | null; member: Member | null; loading: boolean; reload: () => Promise<void> };
const C = createContext<Ctx>({ session: null, member: null, loading: true, reload: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  async function load(s: Session | null) {
    if (!s) { setMember(null); return; }
    const { data } = await supabase.from('members').select('id, company_id, name, role, perms').eq('user_id', s.user.id).eq('active', true).limit(1).maybeSingle();
    setMember(data ? ({ ...(data as Member), perms: { ...(DEF[(data as Member).role] ?? {}), ...((data as Member).perms ?? {}) } }) : null);
  }
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => { setSession(data.session); await load(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); void load(s); });
    return () => data.subscription.unsubscribe();
  }, []);
  return <C.Provider value={{ session, member, loading, reload: () => load(session) }}>{children}</C.Provider>;
}
export const useSession = () => useContext(C);
export const isManager = (m: Member | null) => m?.role === 'owner' || m?.role === 'supervisor';
