import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321', import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'anon');

export async function callFunction<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* keep message */ }
    throw new Error(msg);
  }
  return data as T;
}

/** Throws a plain-English error if a database call failed. */
export function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message.includes('row-level security') ? "You're not allowed to do that." : r.error.message);
  return r.data;
}
