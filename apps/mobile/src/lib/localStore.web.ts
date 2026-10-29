// Web preview only (used for testing screens in a browser): keeps the phone data in memory.
import { MemoryStore, type LocalStore } from '@cydras/core';
export async function openLocalStore(): Promise<LocalStore & { clear(): Promise<void> }> {
  const m = new MemoryStore();
  return Object.assign(m, { async clear() { m.t.clear(); m.meta.clear(); m.box = []; } });
}
