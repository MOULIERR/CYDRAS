// Web preview only: same connection, using the browser's storage.
import { createClient } from '@supabase/supabase-js';
import { config } from './config';
export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { storage: window.localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } });
export async function callFunction<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) { let msg = error.message; try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* keep */ } throw new Error(msg); }
  return data as T;
}
