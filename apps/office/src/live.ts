// Live updates: re-load when anything in these tables changes for this company.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

export function useLive<T>(load: () => Promise<T>, tables: string[], companyId: string | undefined, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(() => { load().then(setData).catch((e) => setError(String(e.message ?? e))); }, deps); // eslint-disable-line
  useEffect(() => {
    if (!companyId) return;
    run();
    const ch = supabase.channel(`live-${tables.join('-')}-${Math.random().toString(36).slice(2)}`);
    tables.forEach((t) => ch.on('postgres_changes' as any, { event: '*', schema: 'public', table: t, filter: `company_id=eq.${companyId}` }, () => run()));
    ch.subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [companyId, run]); // eslint-disable-line
  return { data, error, reload: run };
}
