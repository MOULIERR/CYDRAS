import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');

export async function freshDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(readFileSync(join(__dirname, 'stub.sql'), 'utf8'));
  const dir = join(root, 'supabase', 'migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
  }
  return db;
}

export const ids = {
  angel: '00000000-0000-0000-0000-00000000000a',
  mike: '00000000-0000-0000-0000-00000000000b',
  carlos: '00000000-0000-0000-0000-00000000000c',
  other: '00000000-0000-0000-0000-00000000000d',
};

/** Run SQL as a signed-in person, the way the phone or office would through Supabase. */
export async function as<T = any>(db: PGlite, user: string, sql: string, params: any[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** Run SQL as the server (service role, skips security). */
export async function server<T = any>(db: PGlite, sql: string, params: any[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  return (await db.query<T>(sql, params)).rows;
}

export async function expectDenied(p: Promise<unknown>, re: RegExp = /.*/) {
  let err: any = null;
  try { await p; } catch (e) { err = e; }
  if (!err) throw new Error('Expected this to be blocked, but it was allowed');
  if (!re.test(String(err.message))) throw new Error(`Blocked with an unexpected error: ${err.message}`);
}
