import { beforeEach, afterEach, expect, mock, test } from 'bun:test';
import type { User, UserRole } from '../src/types';
import type { OidcTokenSet } from '../src/services/oidcClient';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: new EventTarget(),
  sessionStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});
const connectivity = { onLine: false };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: connectivity });

let refresh: (token: string) => Promise<OidcTokenSet>;
let loadSession: () => Promise<unknown> = async () => null;
let fetchRequest: typeof fetch = async () => new Response('[]');
globalThis.fetch = ((...args: Parameters<typeof fetch>) => fetchRequest(...args)) as typeof fetch;
mock.module('../src/config/runtimeConfig', () => ({ API_URL: 'http://localhost:8080', OIDC_CONFIG: null }));
mock.module('../src/services/oidcClient', () => ({
  refreshOidcTokens: (token: string) => refresh(token),
  isOidcSessionRejected: () => false,
  beginOidcLogin: async () => {}, completeOidcLogin: async () => null, oidcLogoutUrl: async () => '',
}));
mock.module('../src/services/authStorage', () => ({
  loadStoredAuthSession: () => loadSession(), saveStoredAuthSession: async () => {}, clearStoredAuthSession: async () => {},
}));
mock.module('../src/store/uiStore', () => ({ useUIStore: { getState: () => ({
  resetTransactionFilters: () => {}, hideSnackbar: () => {}, showSnackbar: () => {},
}) } }));
mock.module('../src/utils/naming', () => ({ translate: (_de: string, en: string) => en }));

// Controllable stores make IndexedDB completion races deterministic.
const catalogs = new Map<string, unknown>();
const stores = new Map<string, Map<string, unknown>>([['catalog-cache', catalogs]]);
let openDatabase: (request: Record<string, unknown>) => void;
let completeTransaction: (complete: () => void) => void = queueMicrotask;
const database = {
  transaction() {
    const transaction: { oncomplete?: () => void; objectStore?: (name: string) => unknown } = {};
    transaction.objectStore = (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const rows = stores.get(name)!;
      return {
        put(row: { key?: string; idempotencyKey?: string }) {
          rows.set((row.key ?? row.idempotencyKey)!, row);
          completeTransaction(() => transaction.oncomplete?.());
        },
        delete(key: string) { rows.delete(key); completeTransaction(() => transaction.oncomplete?.()); },
        get(key: string) {
          const request: { result: unknown; onsuccess?: () => void } = { result: rows.get(key) };
          queueMicrotask(() => request.onsuccess?.());
          return request;
        },
        getAll() {
          const request: { result: unknown[]; onsuccess?: () => void } = { result: [...rows.values()] };
          queueMicrotask(() => request.onsuccess?.());
          return request;
        },
      };
    };
    return transaction;
  },
};
Object.assign(globalThis, { indexedDB: { open() {
  const request: Record<string, unknown> = {};
  openDatabase(request);
  return request;
} } });

const auth = await import('../src/services/authManager');
const api = await import('../src/services/apiClient');
const offline = await import('../src/services/offlineQueue');
const resources = await import('../src/services/resourceFactory');
const queries = await import('../src/services/sessionQueryClient');
const user = (id: string, role: UserRole = 'read_only'): User => ({ id, role, name: id, email: `${id}@example.test`, created: '', updated: '', faction: [] });
const tokens = (id: string): OidcTokenSet => ({ accessToken: id, refreshToken: `${id}-refresh`, idToken: id, expiresAt: Date.now() - 1000 });
const outcome = <T>(promise: Promise<T>) => promise.then((value) => ({ value, error: undefined }), (error: unknown) => ({ value: undefined, error }));
const signIn = (id: string) => auth.setDevelopmentSession(`dev:${id}`, user(id));

beforeEach(async () => {
  connectivity.onLine = false;
  await auth.clearAuth();
  stores.forEach((rows) => rows.clear());
  completeTransaction = queueMicrotask;
  loadSession = async () => null;
  refresh = async () => { throw new Error('Unexpected token refresh'); };
  fetchRequest = async () => new Response('[]');
  openDatabase = (request) => queueMicrotask(() => {
    request.result = database;
    (request.onsuccess as () => void)();
  });
});
afterEach(async () => { connectivity.onLine = false; await auth.clearAuth(); api.stopRealtimeEvents(); });

test('a late refresh cannot replace the next account tokens', async () => {
  const response = deferred<OidcTokenSet>();
  refresh = () => response.promise;
  auth.setOidcSession(tokens('A'));
  connectivity.onLine = true;
  const pending = outcome(auth.getValidAccessToken(true));
  connectivity.onLine = false;
  await auth.clearAuth();
  signIn('B');
  response.resolve(tokens('A-late'));
  expect((await pending).error).toBeInstanceOf(auth.SessionChangedError);
  expect(auth.getAuthSnapshot().token).toBe('dev:B');
});

test('an obsolete refresh completion does not clear the new refresh in flight', async () => {
  const a = deferred<OidcTokenSet>(), b = deferred<OidcTokenSet>();
  const calls: string[] = [];
  refresh = (token) => { calls.push(token); return token === 'A-refresh' ? a.promise : b.promise; };
  auth.setOidcSession(tokens('A')); connectivity.onLine = true;
  const old = outcome(auth.getValidAccessToken(true));
  auth.setOidcSession(tokens('B'));
  const current = auth.getValidAccessToken(true);
  a.resolve(tokens('A-late'));
  expect((await old).error).toBeInstanceOf(auth.SessionChangedError);
  const shared = auth.getValidAccessToken(true);
  expect(calls).toEqual(['A-refresh', 'B-refresh']);
  b.resolve(tokens('B-current'));
  expect(await current).toBe('B-current');
  expect(await shared).toBe('B-current');
});

test('late persisted-session restoration cannot overwrite a new login', async () => {
  const stored = deferred<unknown>(), started = deferred<void>();
  loadSession = () => { started.resolve(); return stored.promise; };
  const pending = outcome(auth.restorePersistedSession());
  await started.promise;
  signIn('B');
  stored.resolve({ accessToken: 'A', refreshToken: 'A-refresh', user: user('A') });
  expect((await pending).error).toBeInstanceOf(auth.SessionChangedError);
  expect(auth.getAuthSnapshot().user?.id).toBe('B');
});

test('each login and permission change replaces the complete QueryClient', async () => {
  signIn('A');
  const old = queries.getSessionQueryClient();
  old.setQueryData(['items'], [{ id: 'A-private' }]);
  signIn('B');
  const next = queries.getSessionQueryClient();
  expect(next).not.toBe(old);
  expect(next.getQueryData(['items'])).toBeUndefined();
  expect(old.getQueryData(['items'])).toBeUndefined();
  next.setQueryData(['orders'], [{ id: 'B-private' }]);
  auth.updateAuthUser(user('B', 'faction_leader'));
  expect(queries.getSessionQueryClient()).not.toBe(next);
  expect(queries.getSessionQueryClient().getQueryData(['orders'])).toBeUndefined();
});

test('an account switch while headers refresh prevents the request being sent', async () => {
  const refreshed = deferred<OidcTokenSet>(), started = deferred<void>();
  refresh = () => { started.resolve(); return refreshed.promise; };
  let sent = 0;
  fetchRequest = async () => { sent++; return new Response('[]'); };
  auth.setOidcSession(tokens('A')); connectivity.onLine = true;
  const pending = outcome(api.apiRequest('/api/items'));
  await started.promise;
  connectivity.onLine = false; signIn('B');
  refreshed.resolve(tokens('A-late'));
  expect((await pending).error).toBeInstanceOf(auth.SessionChangedError);
  expect(sent).toBe(0);
});

test('a delayed response body is never returned or cached in the next account', async () => {
  const body = deferred<unknown>(), parsing = deferred<void>();
  fetchRequest = async () => ({ status: 200, ok: true, headers: new Headers({ ETag: 'A-etag' }),
    json() { parsing.resolve(); return body.promise; },
  }) as Response;
  signIn('A');
  const items = resources.createCrudResourceApi<{ id: string }, { name: string }>('/api/items', 'items');
  const pending = outcome(items.getAll());
  await parsing.promise;
  signIn('B'); body.resolve([{ id: 'A-private' }]);
  expect((await pending).error).toBeInstanceOf(auth.SessionChangedError);
  expect(catalogs.size).toBe(0);
  let sentEtag: string | null = null;
  fetchRequest = async (_url, options) => { sentEtag = new Headers(options?.headers).get('If-None-Match'); return new Response('[]'); };
  await api.apiRequest('/api/items');
  expect(sentEtag).toBeNull();
});

test('an account switch while IndexedDB opens prevents an old catalog write', async () => {
  let opened!: Record<string, unknown>;
  openDatabase = (request) => { opened = request; };
  signIn('A');
  const pending = outcome(offline.setOfflineCatalog('items', [{ id: 'A-private' }], auth.captureAuthSession()));
  signIn('B'); opened.result = database; (opened.onsuccess as () => void)();
  expect((await pending).error).toBeInstanceOf(auth.SessionChangedError);
  expect(catalogs.size).toBe(0);
});

test('offline catalogs remain available only to their account and permission scope', async () => {
  signIn('A');
  await offline.setOfflineCatalog('items', [{ id: 'A-private' }]);
  signIn('B');
  expect(await offline.getOfflineCatalog('items')).toBeNull();
  signIn('A');
  expect(await offline.getOfflineCatalog('items')).toEqual([{ id: 'A-private' }]);
  auth.updateAuthUser(user('A', 'faction_leader'));
  expect(await offline.getOfflineCatalog('items')).toBeNull();
});

test('a queue write committed during account switching keeps its original owner and history', async () => {
  const written = deferred<void>();
  let finish!: () => void;
  completeTransaction = (complete) => { finish = complete; written.resolve(); };
  signIn('A');
  const pending = outcome(offline.enqueueOfflineAction({ idempotencyKey: 'A-command', type: 'checkout', payload: {}, localTimestamp: '2026-09-30' }));
  await written.promise;
  signIn('B'); finish();
  expect((await pending).error).toBeInstanceOf(auth.SessionChangedError);
  expect(await offline.getOfflineActions()).toEqual([]);
  completeTransaction = queueMicrotask;
  signIn('A');
  expect(await offline.getOfflineActions()).toMatchObject([{ idempotencyKey: 'A-command', ownerId: 'A' }]);
  await offline.discardOfflineAction('A-command');
  expect(await offline.getOfflineHistory()).toMatchObject([{ idempotencyKey: 'A-command', ownerId: 'A', status: 'discarded' }]);
  signIn('B');
  expect(await offline.getOfflineHistory()).toEqual([]);
});
