import { beforeEach, expect, test } from 'bun:test';
import type { PersistedAuthSession } from '../src/services/authSession';

// Minimal IndexedDB double: one store, with switchable abort of delete transactions.
const rows = new Map<string, unknown>();
let abortDeletes = false;
let closed = 0;
function transaction() {
  const tx: Record<string, unknown> & { oncomplete?: () => void; onabort?: () => void; error?: unknown } = {};
  tx.objectStore = () => ({
    put(value: unknown, key: string) { rows.set(key, structuredClone(value)); queueMicrotask(() => tx.oncomplete?.()); return {}; },
    get(key: string) { const request = { result: rows.get(key) }; queueMicrotask(() => tx.oncomplete?.()); return request; },
    delete(key: string) {
      queueMicrotask(() => {
        if (abortDeletes) { tx.error = new DOMException('Quota', 'AbortError'); tx.onabort?.(); return; }
        rows.delete(key); tx.oncomplete?.();
      });
      return {};
    },
  });
  return tx;
}
const local = new Map<string, string>();
let localStorageFails = false;
Object.assign(globalThis, {
  indexedDB: { open() {
    const request: Record<string, unknown> & { onsuccess?: () => void } = {};
    request.result = { objectStoreNames: { contains: () => true }, transaction, close: () => { closed++; } };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  } },
  localStorage: {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => { if (localStorageFails) throw new Error('denied'); local.set(key, value); },
  },
});

// Imported by query so another test file's process-wide mock.module of authStorage does not apply.
const storage = await import('../src/services/authStorage.ts?real') as typeof import('../src/services/authStorage');
const { decodeAuthSession } = await import('../src/services/authSession');

const session = (revision: number): PersistedAuthSession => ({
  accessToken: 'access', refreshToken: 'refresh', idToken: 'id', expiresAt: null, tokenRevision: revision,
  user: { active: true, id: 'u1', name: 'User', email: 'u@example.test', role: 'ash', roles: ['ash'], faction: [], created: 0, updated: 0 },
});

beforeEach(() => { rows.clear(); local.clear(); abortDeletes = false; localStorageFails = false; closed = 0; });

test('a sign-out whose IndexedDB deletion aborts is still never restored on a cold start', async () => {
  await storage.saveStoredAuthSession(session(10));
  expect(await storage.loadStoredAuthSession()).toEqual(session(10));
  abortDeletes = true;
  await storage.clearStoredAuthSession(11);
  expect(rows.size).toBe(1);
  expect(await storage.loadStoredAuthSession()).toBeNull();
  // A later login writes a newer generation, which is restorable again.
  await storage.saveStoredAuthSession(session(12));
  expect((await storage.loadStoredAuthSession())?.tokenRevision).toBe(12);
  expect(closed).toBeGreaterThan(0);
});

test('a sign-out that can neither be marked nor deleted rejects instead of reporting success', async () => {
  await storage.saveStoredAuthSession(session(10));
  abortDeletes = true;
  localStorageFails = true;
  await expect(storage.clearStoredAuthSession(11)).rejects.toBeDefined();
});

test('stored sessions of an older or malformed shape are discarded, not repaired', async () => {
  const withoutRevision: Partial<ReturnType<typeof session>> = session(5);
  delete withoutRevision.tokenRevision;
  expect(decodeAuthSession(withoutRevision)).toBeNull();
  expect(decodeAuthSession({ ...session(5), user: { id: 'u1' } })).toBeNull();
  expect(decodeAuthSession({ ...session(5), user: null })?.user).toBeNull();
  rows.set('oidc-session', withoutRevision);
  expect(await storage.loadStoredAuthSession()).toBeNull();
  expect(rows.size).toBe(0);
});
