import { beforeEach, afterEach, expect, mock, test } from 'bun:test';
import { QueryObserver } from '@tanstack/react-query';
import type { User, UserRole } from '../src/types';
import type { OidcTokenSet } from '../src/services/oidcClient';
import { createInstance } from 'i18next';
import en from '../src/i18n/en';
import type { Translator } from '../src/utils/naming';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: Object.assign(new EventTarget(), { setInterval: () => 1, clearInterval: () => {} }),
  document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
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
mock.module('../src/config/runtimeConfig', () => ({ API_URL: 'http://localhost:8080', OIDC_CONFIG: null, DEV_LOGIN_AVAILABLE: true, AUTH_CONFIGURATION_ERROR: null }));
mock.module('../src/services/oidcClient', () => ({
  refreshOidcTokens: (token: string) => refresh(token),
  isOidcSessionRejected: () => false,
  beginOidcLogin: async () => {}, completeOidcLogin: async () => null, oidcLogoutUrl: async () => '', revokeOidcToken: async () => {},
}));
mock.module('../src/services/authStorage', () => ({
  loadStoredAuthSession: () => loadSession(), saveStoredAuthSession: async () => {}, clearStoredAuthSession: async () => {}, signedOutRevision: () => 0,
}));
mock.module('../src/store/uiStore', () => ({ useUIStore: { getState: () => ({
  resetTransactionFilters: () => {}, hideSnackbar: () => {}, showSnackbar: () => {},
}) } }));
const translations = createInstance();
void translations.init({
  resources: { en: { translation: en } }, lng: 'en', initAsync: false,
  interpolation: { escapeValue: false },
});
const translate: Translator = (key, options) => translations.t(key, options);
mock.module('../src/utils/naming', () => ({ translate }));

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
const privacy = await import('../src/services/privateInventoryCache');
const pagination = await import('../src/services/apiPagination');
const codes = await import('../src/utils/codeResolver');
const reports = await import('../src/services/reportService');
const { createCsvEventLogisticsImporter } = await import('../src/services/csvEventLogisticsImport');
const { importCsvFactions } = await import('../src/services/csvReferenceImport');
const { parseEventReportsFromCsv } = await import('../src/utils/csv/events');
import type { EventAttendee, EventPersonSummary, EventTimelineEntry } from '../src/types/eventLogistics';
const user = (id: string, role: UserRole = 'read_only'): User => ({ id, role, roles: [role], name: id, email: `${id}@example.test`, created: '', updated: '', faction: [] });
const tokens = (id: string): OidcTokenSet => ({ accessToken: id, refreshToken: `${id}-refresh`, idToken: id, expiresAt: Date.now() - 1000 });
const outcome = <T>(promise: Promise<T>) => promise.then((value) => ({ value, error: undefined }), (error: unknown) => ({ value: undefined, error }));
const signIn = (id: string) => auth.setDevelopmentSession(`dev:${id}`, user(id));

function logisticsRow() {
  return parseEventReportsFromCsv([{
    Typ: 'Event', Eventtyp: 'DE', Eventdatum: '2026-10-17',
    Teilnehmer: JSON.stringify(['alex', 'Mara'].map((personName) => ({ personName, roles: [{ role: 'event_crew' }] }))),
    Zeitplan: JSON.stringify([{ category: 'in_game', title: 'Briefing', startsAt: '2026-10-17T09:00' }]),
  }], [], { eventTypes: ['DE'], factions: [] })[0];
}

test('CSV imports create missing factions once and save attendee roles with database IDs', async () => {
  signIn('admin');
  connectivity.onLine = true;
  const factions = [{ id: 'existing', eventType: 'DE', name: 'KGG', slug: 'kgg' }];
  const planned = [{ id: 'csv-faction-1', eventType: 'DE', name: 'kgg', slug: '' },
    { id: 'csv-faction-2', eventType: 'LS', name: 'TERA', slug: '' }];
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  fetchRequest = (async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (!options?.method || options.method === 'GET') return Response.json(path === '/api/factions' ? factions : []);
    const body = JSON.parse(String(options.body));
    writes.push({ path, body });
    if (path === '/api/factions') {
      const saved = { ...body, id: 'created', slug: 'tera' };
      factions.push(saved);
      return Response.json(saved);
    }
    return Response.json({ ...body, id: 'attendee', person: { id: 'person', name: body.personName } });
  }) as typeof fetch;
  const ids = await importCsvFactions(planned);
  expect([...ids]).toEqual([['csv-faction-1', 'existing'], ['csv-faction-2', 'created']]);
  expect([...(await importCsvFactions(planned))]).toEqual([...ids]);
  expect(writes.filter((write) => write.path === '/api/factions')).toHaveLength(1);
  const row = parseEventReportsFromCsv([{
    Typ: 'Event', Eventtyp: 'LS', Eventdatum: '2026-10-17',
    Teilnehmer: JSON.stringify([{ personName: 'Alex', roles: [{ role: 'faction_leader', faction: 'TERA' }] }]),
  }], [], { eventTypes: ['LS'], factions: planned })[0];
  expect(row.status).toBe('valid');
  await createCsvEventLogisticsImporter(ids)('event', row);
  const attendee = writes.find((write) => write.path.endsWith('/attendees'));
  expect(attendee?.body.roles).toEqual([{ role: 'faction_leader', factionId: 'created', assignment: null }]);
  expect(row.attendees[0].roles[0].factionId).toBe('csv-faction-2');
});

test('CSV logistics retries reuse people, preserve linked accounts, and update existing records', async () => {
  signIn('planner');
  connectivity.onLine = true;
  const people: EventPersonSummary[] = [{ id: 'alex', name: 'Alex', userId: 'linked-account', userName: 'Account' }];
  const attendees = new Map<string, EventAttendee[]>();
  const timeline = new Map<string, EventTimelineEntry[]>();
  const writes: { path: string; method: string; body: Record<string, unknown> }[] = [];
  fetchRequest = (async (url, options) => {
    const path = new URL(String(url)).pathname;
    const method = options?.method ?? 'GET';
    if (path === '/api/event-people') return Response.json(people);
    const [, , , eventId, section, id] = path.split('/');
    if (!attendees.has(eventId)) attendees.set(eventId, []);
    if (!timeline.has(eventId)) timeline.set(eventId, []);
    const rows = section === 'attendees' ? attendees.get(eventId)! : timeline.get(eventId)!;
    if (method === 'GET') return Response.json(rows);
    const body = JSON.parse(String(options?.body));
    writes.push({ path, method, body });
    let saved;
    if (section === 'attendees') {
      let person = people.find((person) => person.id === body.personId);
      if (!person) { person = { id: `person-${people.length}`, name: body.personName, userId: null, userName: null }; people.push(person); }
      saved = { ...body, id: id ?? `attendee-${rows.length}`, eventId, person };
    } else {
      // ISO LocalDateTime may omit zero seconds; retry matching must treat them equally.
      saved = { ...body, id: id ?? `timeline-${rows.length}`, eventId, startsAt: body.startsAt.slice(0, 16) };
    }
    if (id) rows.splice(rows.findIndex((entry) => entry.id === id), 1, saved);
    else rows.push(saved);
    return Response.json(saved);
  }) as typeof fetch;
  const importer = createCsvEventLogisticsImporter();
  await importer('first', logisticsRow());
  await importer('second', logisticsRow());
  await createCsvEventLogisticsImporter()('first', logisticsRow());
  expect(people).toHaveLength(2);
  expect(attendees.get('first')).toHaveLength(2);
  expect(attendees.get('second')).toHaveLength(2);
  expect(timeline.get('first')).toHaveLength(1);
  expect(timeline.get('second')).toHaveLength(1);
  expect(writes.filter((write) => write.method === 'POST')).toHaveLength(6);
  expect(writes.filter((write) => write.method === 'PUT')).toHaveLength(3);
  const alex = writes.filter((write) => write.body.personId === 'alex');
  expect(alex).toHaveLength(3);
  expect(alex.every((write) => write.body.personUserId === 'linked-account' && write.body.personName === 'Alex')).toBe(true);
});

test('CSV logistics rejects ambiguous names before attendee writes', async () => {
  signIn('planner');
  connectivity.onLine = true;
  let writes = 0;
  fetchRequest = (async (url, options) => {
    if (options?.method && options.method !== 'GET') writes++;
    return Response.json(String(url).endsWith('/event-people')
      ? [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'alex' }] : []);
  }) as typeof fetch;
  await expect(createCsvEventLogisticsImporter()('event', logisticsRow())).rejects.toThrow('Multiple people are named alex');
  expect(writes).toBe(0);
});

test('CSV logistics writes no attendee when a later name is ambiguous', async () => {
  signIn('planner');
  connectivity.onLine = true;
  let writes = 0;
  fetchRequest = (async (url, options) => {
    if (options?.method && options.method !== 'GET') writes++;
    return Response.json(String(url).endsWith('/event-people')
      ? [{ id: 'a', name: 'Mara' }, { id: 'b', name: 'mara' }] : []);
  }) as typeof fetch;
  await expect(createCsvEventLogisticsImporter()('event', logisticsRow())).rejects.toThrow('Multiple people are named Mara');
  expect(writes).toBe(0);
});

test('CSV logistics stops when the signed-in account changes during lookup', async () => {
  signIn('first');
  connectivity.onLine = true;
  let writes = 0;
  fetchRequest = (async (url, options) => {
    if (options?.method && options.method !== 'GET') writes++;
    if (String(url).endsWith('/event-people')) {
      connectivity.onLine = false;
      signIn('second');
    }
    return Response.json([]);
  }) as typeof fetch;
  await expect(createCsvEventLogisticsImporter()('event', logisticsRow())).rejects.toBeInstanceOf(auth.SessionChangedError);
  expect(writes).toBe(0);
});

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

test('a server role-change event refreshes identity and clears organization views before token rotation', async () => {
  auth.setDevelopmentSession('dev:role-change', user('role-change', 'ash'));
  const oldClient = queries.getSessionQueryClient();
  oldClient.setQueryData(['event-logistics', 'attendees'], [{ name: 'Company participant' }]);
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  let accountReads = 0;
  fetchRequest = async (input) => {
    if (String(input).endsWith('/api/events/stream')) return new Response(new ReadableStream<Uint8Array>({
      start(controller) { streams.push(controller); },
    }));
    if (String(input).endsWith('/api/auth/me')) {
      accountReads++;
      return new Response(JSON.stringify(user('role-change', 'tenant')));
    }
    return new Response('[]');
  };
  connectivity.onLine = true;
  const connection = api.startRealtimeEvents();
  await new Promise(resolve => setTimeout(resolve, 0));
  streams[0].enqueue(new TextEncoder().encode('data: {"type":"user.changed"}\n\n'));
  await new Promise(resolve => setTimeout(resolve, 5));
  expect(accountReads).toBeGreaterThan(0);
  expect(auth.getAuthSnapshot().token).toBe('dev:role-change');
  expect(auth.getAuthSnapshot().user?.role).toBe('tenant');
  expect(queries.getSessionQueryClient()).not.toBe(oldClient);
  expect(oldClient.getQueryData(['event-logistics', 'attendees'])).toBeUndefined();
  api.stopRealtimeEvents();
  streams.forEach(controller => controller.close());
  await connection;
});

test('private catalog responses remove durable snapshots and private writes cannot enter the queue', async () => {
  signIn('privacy-owner');
  await offline.setOfflineCatalog('items', [{ id: 'public-item' }]);
  const rows = [{ id: 'secret-item', access: { privateResource: true } }];
  privacy.markPrivateInventoryResponse(rows);
  await offline.setOfflineCatalog('items', rows);
  expect(await offline.getOfflineCatalog('items')).toBeNull();
  await expect(offline.enqueueOfflineAction({ idempotencyKey: 'secret-write', type: 'checkout', payload: { itemId: 'secret-item' }, localTimestamp: '2026-10-01' })).rejects.toThrow('online connection');
  expect(await offline.getOfflineActions()).toEqual([]);
});

test('a mixed catalog produces a public-only snapshot that supports a new offline search', async () => {
  signIn('mixed-snapshot-owner');
  const inventory = await import('../src/services/inventoryService');
  const rows = [
    { id: 'mixed-public', name: 'Public radio', category: 'Comms', access: { privateResource: false } },
    { id: 'mixed-private', name: 'Private radio', category: 'Comms', access: { privateResource: true } },
  ];
  fetchRequest = async () => new Response(JSON.stringify(rows), { headers: { 'X-Private-Inventory': 'true', 'X-Has-More': 'false' } });
  await inventory.snapshotItemCatalog(auth.captureAuthSession());
  expect(await offline.getOfflineCatalog('items:offline-snapshot')).toEqual([rows[0]]);
  fetchRequest = async () => { throw new TypeError('Offline'); };
  expect((await inventory.searchItems('radio', 25)).rows).toEqual([rows[0]]);
});

test('an absent previous faction order is a null result from one targeted request', async () => {
  signIn('previous-order-reader');
  const { getPreviousFactionOrder } = await import('../src/services/factionOrderService');
  let calls = 0;
  fetchRequest = async input => {
    calls++;
    const url = new URL(String(input));
    expect(url.pathname).toBe('/api/orders/faction/previous');
    expect(url.searchParams.get('faction')).toBe('Search & Rescue');
    expect(url.searchParams.get('before')).toBe('2027-06-12');
    return new Response(null, { status: 204 });
  };
  expect(await getPreviousFactionOrder('LS', 'Search & Rescue', '2027-06-12')).toBeNull();
  expect(calls).toBe(1);
});

test('losing connectivity evicts private query data while retaining public snapshots', async () => {
  signIn('privacy-owner');
  const client = queries.getSessionQueryClient();
  const rows = [{ id: 'secret', access: { privateResource: true } }];
  privacy.markPrivateInventoryResponse(rows);
  client.setQueryData(['private-items'], rows);
  client.setQueryData(['public-items'], [{ id: 'public' }]);
  window.dispatchEvent(new Event('offline'));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(client.getQueryData(['private-items'])).toBeUndefined();
  expect(client.getQueryData(['public-items'])).toEqual([{ id: 'public' }]);
});

test('active private snapshots refresh without clearing stock or returning to a loading screen', async () => {
  signIn('privacy-owner');
  const client = queries.getSessionQueryClient();
  const original = [{ id: 'secret', quantity: 3, access: { privateResource: true } }];
  privacy.markPrivateInventoryResponse(original);
  client.setQueryData(['private-items'], original);
  const refreshed = deferred<typeof original>();
  const observer = new QueryObserver(client, { queryKey: ['private-items'], queryFn: () => refreshed.promise, staleTime: Infinity });
  const loadingStates: boolean[] = [];
  const unsubscribe = observer.subscribe(result => loadingStates.push(result.isLoading));
  connectivity.onLine = true;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(client.getQueryData(['private-items'])).toEqual(original);
  expect(observer.getCurrentResult().isLoading).toBe(false);
  const updated = [{ ...original[0], quantity: 4 }];
  privacy.markPrivateInventoryResponse(updated);
  refreshed.resolve(updated);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(client.getQueryData(['private-items'])).toEqual(updated);
  expect(loadingStates).not.toContain(true);
  unsubscribe();
});

test('inactive private snapshots are evicted during refresh', async () => {
  signIn('privacy-owner');
  const client = queries.getSessionQueryClient();
  const rows = [{ id: 'secret', access: { privateResource: true } }];
  privacy.markPrivateInventoryResponse(rows);
  client.setQueryData(['inactive-private-items'], rows);
  connectivity.onLine = true;
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(client.getQueryData(['inactive-private-items'])).toBeUndefined();
});

test('cancelling a private refresh does not erase the current snapshot', async () => {
  signIn('privacy-owner');
  const client = queries.getSessionQueryClient();
  const original = [{ id: 'secret', access: { privateResource: true } }];
  privacy.markPrivateInventoryResponse(original);
  client.setQueryData(['private-items'], original);
  const pending = deferred<typeof original>();
  const observer = new QueryObserver(client, { queryKey: ['private-items'], queryFn: () => pending.promise, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  connectivity.onLine = true;
  document.dispatchEvent(new Event('visibilitychange'));
  await client.cancelQueries({ queryKey: ['private-items'] });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(client.getQueryData(['private-items'])).toEqual(original);
  pending.resolve(original);
  unsubscribe();
});

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
  for (let i = 0; i < 10 && !calls.length; i++) await new Promise(resolve => setTimeout(resolve, 0));
  // The obsolete refresh is abandoned before it spends A's rotating token.
  expect(calls).toEqual(['B-refresh']);
  b.resolve(tokens('B-current'));
  expect(await current).toBe('B-current');
  expect(await shared).toBe('B-current');
});

test('a refresh adopts a token generation another tab already rotated', async () => {
  const calls: string[] = [];
  refresh = async (token) => { calls.push(token); return tokens('never'); };
  auth.setOidcSession({ ...tokens('A'), expiresAt: Date.now() - 1 });
  loadSession = async () => ({ ...tokens('A2'), expiresAt: Date.now() + 600_000, tokenRevision: Date.now() + 60_000, user: null });
  connectivity.onLine = true;
  try {
    expect(await auth.getValidAccessToken()).toBe('A2');
    expect(calls).toEqual([]);
  } finally {
    loadSession = async () => null;
  }
});

test('an older stored token generation is never adopted', async () => {
  const calls: string[] = [];
  refresh = async (token) => { calls.push(token); return { ...tokens('A3'), expiresAt: Date.now() + 600_000 }; };
  auth.setOidcSession({ ...tokens('A'), expiresAt: Date.now() - 1 });
  // A delayed write from another tab left an earlier generation behind.
  loadSession = async () => ({ ...tokens('A0'), expiresAt: Date.now() + 600_000, tokenRevision: 1, user: null });
  connectivity.onLine = true;
  try {
    expect(await auth.getValidAccessToken()).toBe('A3');
    expect(calls).toEqual(['A-refresh']);
  } finally {
    loadSession = async () => null;
  }
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

test('query retries stop on terminal HTTP errors and obsolete sessions', async () => {
  signIn('A');
  const client = queries.getSessionQueryClient();
  const options = { retryDelay: 0 };
  for (const error of [new api.ApiError(403, 'Forbidden'), new api.ApiError(409, 'Conflict'), new auth.SessionChangedError()]) {
    let calls = 0;
    await outcome(client.fetchQuery({ ...options, queryKey: ['retry', error.message], queryFn: async () => { calls++; throw error; } }));
    expect(calls).toBe(1);
  }
  let calls = 0;
  await outcome(client.fetchQuery({ ...options, queryKey: ['retry', 'transient'], queryFn: async () => { calls++; throw new api.ApiError(503, 'Unavailable'); } }));
  expect(calls).toBe(3);
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
  await Promise.resolve();
  await Promise.resolve();
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

test('pagination follows the server continuation, not the row count, and stops after an account switch', async () => {
  signIn('A');
  connectivity.onLine = true;
  const requested: string[] = [];
  fetchRequest = (async (url) => {
    requested.push(String(url));
    const page = new URL(String(url)).searchParams.get('page');
    // Page 0 lost a row to privacy filtering (1 of 2 rows) but the server still reports more rows.
    return page === '0'
      ? new Response(JSON.stringify([{ id: 'one' }]), { headers: { 'Content-Type': 'application/json', 'X-Has-More': 'true' } })
      : new Response(JSON.stringify([{ id: 'two' }, { id: 'three' }]), { headers: { 'Content-Type': 'application/json', 'X-Has-More': 'false' } });
  }) as typeof fetch;
  const first = await api.apiPage<{ id: string }>('/api/paged-test', 0, 2);
  expect(first).toEqual({ rows: [{ id: 'one' }], page: 0, size: 2, more: true });
  const rows = await pagination.loadAllPages((page, size) => api.apiPage<{ id: string }>('/api/paged-test', page, size), 2);
  expect(rows).toEqual([{ id: 'one' }, { id: 'two' }, { id: 'three' }]);
  expect(requested.map((url) => new URL(url).searchParams.get('page'))).toEqual(['0', '0', '1']);
  expect(pagination.mapPage(first, (row) => row.id)).toEqual({ rows: ['one'], page: 0, size: 2, more: true });
  await expect(pagination.loadAllPages(async () => { signIn('B'); return { rows: [{ id: 'one' }], page: 0, size: 2, more: true }; }, 2))
    .rejects.toBeInstanceOf(auth.SessionChangedError);
  connectivity.onLine = false;
});

test('QR links resolve exact assets and locations without making a request or changing stock', async () => {
  let sent = 0;
  fetchRequest = async () => { sent++; throw new Error('Unexpected scan request'); };
  expect(await codes.resolveScannedCode('  ')).toEqual({ found: false, code: '' });
  expect(await codes.resolveScannedCode('https://inventory.example/items/radio/assets/unit')).toMatchObject({ path: '/items/radio/assets/unit' });
  expect(await codes.resolveScannedCode('https://inventory.example/locations/shelf')).toMatchObject({ type: 'location', path: '/locations/shelf' });
  expect(await codes.resolveScannedCode('/orders/faction/order')).toMatchObject({ type: 'order', path: '/orders/faction/order' });
  expect(await codes.resolveScannedCode('/assemblies/kit')).toMatchObject({ type: 'assembly', path: '/assemblies/kit' });
  expect(sent).toBe(0);
});

test('SKU and order fallback searches are targeted, exact and read-only', async () => {
  signIn('A'); connectivity.onLine = true;
  const calls: URL[] = [];
  fetchRequest = async (input, options) => {
    expect(options?.method ?? 'GET').toBe('GET');
    const url = new URL(String(input)); calls.push(url);
    if (url.pathname === '/api/items/by-sku/sku') return Response.json({ id: 'item', sku: 'SKU', name: 'Exact item' });
    return Response.json({ error: 'Missing' }, { status: 404 });
  };
  expect(await codes.resolveScannedCode('sku')).toMatchObject({ found: true, path: '/items/item?transaction=1' });
  expect(calls.some(url => url.pathname === '/api/items')).toBe(false);
  calls.length = 0;
  fetchRequest = async input => {
    const url = new URL(String(input)); calls.push(url);
    if (url.pathname === '/api/items') return Response.json([]);
    if (url.pathname === '/api/orders/faction') return Response.json([{ id: 'order', orderCode: 'DE26-KGG-01' }]);
    return Response.json({ error: 'Missing' }, { status: 404 });
  };
  expect(await codes.resolveScannedCode('DE26-KGG-01')).toMatchObject({ found: true, path: '/orders/faction/order' });
  expect(calls.find(url => url.pathname === '/api/orders/faction')?.searchParams.get('orderCode')).toBe('DE26-KGG-01');
});

test('report exports retain the initial generation and filters across the export request', async () => {
  signIn('A');
  const calls: URL[] = [];
  fetchRequest = async input => {
    const url = new URL(String(input)); calls.push(url);
    return Response.json({ generatedAt: 'snapshot', total: 2, rows: url.pathname.endsWith('/export') ? [{ id: 'one' }, { id: 'two' }] : [{ id: 'one' }] });
  };
  expect(await reports.reportApi.exportRows('movements', { itemId: 'item', from: '2026-01-01' }, 'Generation changed'))
    .toEqual({ generation: 'snapshot', rows: [{ id: 'one' }, { id: 'two' }] });
  expect(calls[1].searchParams.get('generation')).toBe('snapshot');
  expect(calls[1].searchParams.get('itemId')).toBe('item');
  expect(calls[1].searchParams.get('from')).toBe('2026-01-01');
  fetchRequest = async input => Response.json({ generatedAt: String(input).includes('/export') ? 'new-snapshot' : 'snapshot', total: 2, rows: [{ id: 'one' }] });
  await expect(reports.reportApi.exportRows('movements', {}, 'Generation changed')).rejects.toThrow('Generation changed');
});

test('offline replay archives each outcome without requeueing applied or conflicting commands', async () => {
  signIn('A');
  for (const key of ['applied', 'conflict', 'rejected']) await offline.enqueueOfflineAction({ idempotencyKey: key, type: 'transaction', payload: { itemId: 'public-item' }, localTimestamp: key });
  let sent = 0;
  fetchRequest = async (_input, options) => {
    sent++;
    const body = JSON.parse(String(options?.body));
    expect(body.actions).toHaveLength(3);
    return Response.json({ results: ['applied', 'conflict', 'rejected'].map(status => ({ idempotencyKey: status, status, error: status === 'applied' ? undefined : 'Review current stock' })) });
  };
  connectivity.onLine = true;
  await offline.flushOfflineQueue();
  expect(await offline.getOfflineActions()).toEqual([]);
  expect((await offline.getOfflineHistory()).map(row => row.status).sort()).toEqual(['applied', 'conflict', 'rejected']);
  expect((await offline.getSyncFailures()).map(row => row.status).sort()).toEqual(['conflict', 'rejected']);
  await offline.flushOfflineQueue();
  expect(sent).toBe(1);
});

test('offline replay pauses on terminal failures, honours Retry-After and resumes with the same command UUIDs', async () => {
  signIn('replay');
  await offline.enqueueOfflineAction({ idempotencyKey: 'cmd-1', type: 'transaction', payload: { itemId: 'public-item' }, localTimestamp: '1' });
  connectivity.onLine = true;
  const sentKeys: string[] = [];
  let respond: () => Response = () => new Response('', { status: 403 });
  fetchRequest = async (_input, options) => {
    sentKeys.push(...JSON.parse(String(options?.body)).actions.map((action: { idempotencyKey: string }) => action.idempotencyKey));
    return respond();
  };

  await offline.flushOfflineQueue();
  expect(offline.getSyncState()).toMatchObject({ kind: 'paused', reason: 'forbidden' });
  await offline.flushOfflineQueue();
  expect(sentKeys).toEqual(['cmd-1']);

  respond = () => new Response(JSON.stringify({ error: 'Slow down' }), { status: 429, headers: { 'Retry-After': '7' } });
  const before = Date.now();
  await offline.flushOfflineQueue({ resume: true });
  const state = offline.getSyncState();
  expect(state).toMatchObject({ kind: 'retrying', reason: 'rate_limited' });
  expect(Date.parse((state as { retryAt: string }).retryAt) - before).toBeGreaterThanOrEqual(7000);

  respond = () => new Response('<html>proxy</html>', { status: 200 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await offline.flushOfflineQueue({ resume: true });
  expect(offline.getSyncState()).toMatchObject({ kind: 'paused', reason: 'invalid_response' });

  respond = () => new Response('', { status: 503 });
  await offline.flushOfflineQueue({ resume: true });
  expect(offline.getSyncState()).toMatchObject({ kind: 'retrying', reason: 'server' });

  respond = () => Response.json({ results: [{ idempotencyKey: 'cmd-1', status: 'applied' }] });
  await offline.flushOfflineQueue({ resume: true });
  expect(offline.getSyncState()).toEqual({ kind: 'idle' });
  expect(new Set(sentKeys)).toEqual(new Set(['cmd-1']));
  expect(await offline.getOfflineActions()).toEqual([]);
});

test('saved public SKUs resolve offline without requests or writes', async () => {
  signIn('A'); connectivity.onLine = false;
  await offline.setOfflineCatalog('items:offline-snapshot', [{ id: 'saved', sku: 'SAVED-SKU', name: 'Saved item' }]);
  let requests = 0; fetchRequest = async () => { requests++; throw new TypeError('offline'); };
  expect(await codes.resolveScannedCode('saved-sku')).toMatchObject({ found: true, path: '/items/saved?transaction=1' });
  expect(await codes.resolveScannedCode('unseen-sku')).toMatchObject({ found: false });
  expect(requests).toBe(0);
});
