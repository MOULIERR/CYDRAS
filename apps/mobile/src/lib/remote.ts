// Sends phone changes to Supabase and fetches what changed. Security rules on the server decide
// what each person is allowed to read and change.
import { PermanentError, type Remote, type Row } from '@cydras/core';
import { supabase } from './supabase';

// Errors that retrying won't fix: not allowed, bad data, missing row.
const PERMANENT = /^(42501|23\d{3}|22\d{3}|P0001|PGRST116|PGRST204)$/;

function raise(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code && PERMANENT.test(error.code)) throw new PermanentError(error.message);
  if (/row-level security|not allowed|violates/i.test(error.message)) throw new PermanentError(error.message);
  throw new Error(error.message); // probably no signal; try again later
}

export const supabaseRemote: Remote = {
  async upsert(table, row, key, patch) {
    if (patch) {
      const { id, ...fields } = row;
      let q = supabase.from(table).update(fields);
      if (key?.length) for (const k of key) q = q.eq(k, row[k] as string);
      else q = q.eq('id', id);
      const { error } = await q;
      return raise(error);
    }
    const { error } = await supabase.from(table).upsert(row, key?.length ? { onConflict: key.join(',') } : undefined);
    raise(error);
  },
  async rpc(fn, args) {
    const { data, error } = await supabase.rpc(fn, args);
    raise(error);
    return data;
  },
  async changes(table, since, limit) {
    const { data, error } = await supabase.from(table).select('*').gte('updated_at', since).order('updated_at', { ascending: true }).limit(limit);
    raise(error);
    return (data ?? []) as Row[];
  },
};
