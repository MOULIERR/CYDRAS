// Connection to the Cydras database. The login stays saved on the phone between app opens.
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { config } from './config';

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { storage: globalThis.localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Keep the login fresh only while the app is open.
AppState.addEventListener('change', (s) => {
  if (s === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Calls a Cydras server function and returns its answer, or throws with the plain-English error. */
export async function callFunction<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return data as T;
}
