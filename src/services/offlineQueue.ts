import { API_URL } from '../config/runtimeConfig';
import { containsPrivateInventory, referencesPrivateInventory } from './privateInventoryCache';
import { assertAuthSession, captureAuthSession, getAuthSnapshot, getAuthorizationHeaders, type AuthSessionContext } from './authManager';

export type OfflineAction = {
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
  localTimestamp: string;
  ownerId?: string;
  supersedes?: string;
  resolutionNote?: string;
};

const DB_NAME = 'ash-inventory';
const DB_VERSION = 4;
const STORE = 'sync-queue';
const CATALOG_STORE = 'catalog-cache';
const FAILURES_STORE = 'sync-failures';
const HISTORY_STORE = 'sync-history';
const catalogFallbacks = new Map<string, string>();
export const getCatalogFallbacks = () => [...catalogFallbacks.entries()].filter(([key]) => key.startsWith(`${captureAuthSession().catalogScope}:`)).map(([key, cachedAt]) => ({ key, cachedAt }));

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE, { keyPath: 'idempotencyKey' });
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'idempotencyKey' });
      }
      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        db.createObjectStore(CATALOG_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(FAILURES_STORE)) {
        db.createObjectStore(FAILURES_STORE, { keyPath: 'idempotencyKey' });
      }
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close older inventory tabs and reload to upgrade offline storage.'));
  });
}

export async function setOfflineCatalog<T>(key: string, data: T, context = captureAuthSession()): Promise<void> {
  return setOfflineCatalogEntries([{ key, data }], context);
}

/** Save a query page and its exact resource entries with one download timestamp. */
export async function setOfflineCatalogEntries(entries: { key: string; data: unknown }[], context = captureAuthSession()): Promise<void> {
  assertAuthSession(context);
  const protectedEntries = entries.filter(entry => containsPrivateInventory(entry.data));
  await Promise.all(protectedEntries.map(entry => removeOfflineCatalog(entry.key, context)));
  entries = entries.filter(entry => !containsPrivateInventory(entry.data));
  if (!context.accountId || !entries.length) return;
  const cachedAt = new Date().toISOString();
  const rows = entries.map((entry) => ({ ...entry, key: `${context.catalogScope}:${entry.key}`, cachedAt }));
  try {
    const db = await openDatabase();
    assertAuthSession(context);
    await transactionPromise(db, CATALOG_STORE, 'readwrite', (store) => {
      rows.forEach((row) => store.put(row));
    });
    assertAuthSession(context);
    const cleared = rows.map((row) => catalogFallbacks.delete(row.key)).some(Boolean);
    if (cleared) window.dispatchEvent(new Event('ash-offline-cache'));
  } catch (err) {
    assertAuthSession(context);
    console.warn('Failed to cache catalog offline', err);
  }
}

export async function removeOfflineCatalog(key: string, context = captureAuthSession()): Promise<void> {
  assertAuthSession(context);
  if (!context.accountId) return;
  const catalogKey = `${context.catalogScope}:${key}`;
  try {
    const db = await openDatabase();
    assertAuthSession(context);
    await transactionPromise(db, CATALOG_STORE, 'readwrite', (store) => store.delete(catalogKey));
    assertAuthSession(context);
    if (catalogFallbacks.delete(catalogKey)) window.dispatchEvent(new Event('ash-offline-cache'));
  } catch (err) {
    assertAuthSession(context);
    console.warn('Failed to remove offline catalog entry', err);
  }
}

export async function getOfflineCatalog<T>(key: string, context = captureAuthSession()): Promise<T | null> {
  assertAuthSession(context);
  if (!context.accountId) return null;
  const catalogKey = `${context.catalogScope}:${key}`;
  try {
    const db = await openDatabase();
    assertAuthSession(context);
    return await new Promise<T | null>((resolve, reject) => {
      const request = db.transaction(CATALOG_STORE, 'readonly').objectStore(CATALOG_STORE).get(catalogKey);
      request.onsuccess = () => {
        try { assertAuthSession(context); } catch (error) { reject(error); return; }
        if (request.result) { catalogFallbacks.set(catalogKey, request.result.cachedAt); window.dispatchEvent(new Event('ash-offline-cache')); }
        resolve(request.result ? (request.result.data as T) : null);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    assertAuthSession(context);
    return null;
  }
}

export async function enqueueOfflineAction(action: OfflineAction, context: AuthSessionContext = captureAuthSession()): Promise<void> {
  if (referencesPrivateInventory(action.payload)) throw new Error('Private inventory actions require an online connection.');
  assertAuthSession(context);
  const actionOwner = context.accountId;
  const db = await openDatabase();
  assertAuthSession(context);
  if (!actionOwner) throw new Error('Sign in before saving an offline action');
  await transactionPromise(db, STORE, 'readwrite', (store) => store.put({ ...action, ownerId: actionOwner }));
  assertAuthSession(context);
  await notifyQueueChanged();
}

async function readStore<T>(store: string, context: AuthSessionContext): Promise<T[]> {
  const db = await openDatabase();
  assertAuthSession(context);
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => {
      try { assertAuthSession(context); resolve(request.result as T[]); } catch (error) { reject(error); }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineActions(): Promise<OfflineAction[]> {
  const context = captureAuthSession();
  const rows = await readStore<OfflineAction>(STORE, context);
  assertAuthSession(context);
  return rows.filter((action) => Boolean(context.accountId) && action.ownerId === context.accountId)
    .sort((a, b) => a.localTimestamp.localeCompare(b.localTimestamp));
}

export async function discardOfflineAction(idempotencyKey: string): Promise<void> {
  const context = captureAuthSession();
  if (flushInFlight) throw new Error('SYNC_IN_PROGRESS');
  const db = await openDatabase();
  const action = (await getOfflineActions()).find((entry) => entry.idempotencyKey === idempotencyKey);
  assertAuthSession(context);
  if (!action) throw new Error('Queued action not found');
  await archiveAndDelete(db, STORE, action, 'discarded');
  assertAuthSession(context);
  await notifyQueueChanged();
}

export async function getOfflineQueueCount(): Promise<number> {
  return (await getOfflineActions()).length;
}

export type SyncFailure = {
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
  ownerId?: string;
  localTimestamp?: string;
  status: 'conflict' | 'rejected';
  error: string;
  timestamp: string;
};

export async function getSyncFailures(): Promise<SyncFailure[]> {
  const context = captureAuthSession();
  const rows = await readStore<SyncFailure>(FAILURES_STORE, context);
  assertAuthSession(context);
  return rows.filter((failure) => Boolean(context.accountId) && failure.ownerId === context.accountId);
}

export async function getSyncFailureCount(): Promise<number> {
  return (await getSyncFailures()).length;
}

export async function discardSyncFailure(idempotencyKey: string): Promise<void> {
  const context = captureAuthSession();
  const db = await openDatabase();
  const failure = (await getSyncFailures()).find((entry) => entry.idempotencyKey === idempotencyKey);
  assertAuthSession(context);
  if (!failure) throw new Error('Sync failure not found');
  await archiveAndDelete(db, FAILURES_STORE, failure, 'archived');
  assertAuthSession(context);
  await notifyQueueChanged();
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight = false;
let flushAttempt = 0;

function scheduleFlush(delayMs: number): void {
  if (flushTimer || flushInFlight) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushOfflineQueue();
  }, delayMs);
}

export async function flushOfflineQueue(): Promise<void> {
  if (!navigator.onLine || flushInFlight) return;
  const context = captureAuthSession();
  flushInFlight = true;
  let actions: OfflineAction[];
  try {
    actions = (await getOfflineActions()).slice(0, 100);
  } catch {
    flushInFlight = false;
    scheduleFlush(10_000);
    return;
  }
  if (!actions.length) {
    flushAttempt = 0;
    flushInFlight = false;
    return;
  }
  let authorizationHeaders: Record<string, string>;
  try {
    authorizationHeaders = await getAuthorizationHeaders();
    assertAuthSession(context);
    if (!context.accountId || actions.some((action) => action.ownerId !== context.accountId)) throw new Error('Account changed during sync');
  } catch {
    flushInFlight = false;
    scheduleFlush(10_000);
    return;
  }
  let retryDelay: number | null = null;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authorizationHeaders,
    };
    const response = await fetch(`${API_URL}/api/sync`, { method: 'POST', headers, body: JSON.stringify({ actions }), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      flushAttempt += 1;
      retryDelay = Math.min(60_000, 2_000 * 2 ** flushAttempt);
    } else {
      flushAttempt = 0;
      const payload = await response.json() as { results: Array<{ idempotencyKey: string; status: string; error?: string }> };
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE, FAILURES_STORE, HISTORY_STORE], 'readwrite');
        const queueStore = tx.objectStore(STORE);
        const failuresStore = tx.objectStore(FAILURES_STORE);

        for (const result of payload.results) {
          const original = actions.find((action) => action.idempotencyKey === result.idempotencyKey);
          if (!original || !['applied', 'conflict', 'rejected'].includes(result.status)) continue;
          queueStore.delete(result.idempotencyKey);
          tx.objectStore(HISTORY_STORE).put({ ...original, status: result.status, error: result.error, timestamp: new Date().toISOString() });
          if (result.status === 'applied') {
            failuresStore.delete(result.idempotencyKey);
          } else {
            const action = actions.find((candidate) => candidate.idempotencyKey === result.idempotencyKey);
            if (action) {
              failuresStore.put({
                idempotencyKey: result.idempotencyKey,
                ownerId: action.ownerId,
                localTimestamp: action.localTimestamp,
                type: action.type,
                payload: action.payload,
                status: result.status === 'conflict' ? 'conflict' : 'rejected',
                error: result.error || result.status,
                timestamp: new Date().toISOString(),
              } satisfies SyncFailure);
            }
          }
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      if (context.generation === getAuthSnapshot().generation) {
        await notifyQueueChanged();
        window.dispatchEvent(new CustomEvent('ash-api-change', { detail: { type: 'sync.completed' } }));
      }
    }
  } catch {
    flushAttempt += 1;
    retryDelay = Math.min(60_000, 2_000 * 2 ** flushAttempt);
  } finally {
    flushInFlight = false;
  }
  if (retryDelay !== null) scheduleFlush(retryDelay);
  else if (await getOfflineQueueCount()) scheduleFlush(1000);
}

async function notifyQueueChanged() {
  const context = captureAuthSession();
  const [queued, failures] = await Promise.all([getOfflineQueueCount(), getSyncFailureCount()]);
  assertAuthSession(context);
  window.dispatchEvent(new CustomEvent('ash-offline-queue', { detail: { queued, failures } }));
}

function transactionPromise(db: IDBDatabase, storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    operation(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export type OfflineHistory = Omit<SyncFailure, 'status'> & { status: string; supersedes?: string; resolutionNote?: string };
export async function getOfflineHistory(): Promise<OfflineHistory[]> {
  const context = captureAuthSession();
  const rows = await readStore<OfflineHistory>(HISTORY_STORE, context);
  assertAuthSession(context);
  return rows.filter((entry) => Boolean(context.accountId) && entry.ownerId === context.accountId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
export async function getCacheFreshness(): Promise<{ key: string; cachedAt: string }[]> {
  const context = captureAuthSession();
  const prefix = `${context.catalogScope}:`;
  const rows = await readStore<{ key: string; cachedAt: string }>(CATALOG_STORE, context);
  assertAuthSession(context);
  return rows.filter((entry) => entry.key.startsWith(prefix))
    .map((entry) => ({ key: entry.key.slice(prefix.length), cachedAt: entry.cachedAt }));
}

async function archiveAndDelete(db: IDBDatabase, source: string, entry: OfflineAction | SyncFailure, status: string) {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([source, HISTORY_STORE], 'readwrite');
    tx.objectStore(HISTORY_STORE).put({ ...entry, status, timestamp: new Date().toISOString() });
    tx.objectStore(source).delete(entry.idempotencyKey);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function correctSyncFailure(failure: SyncFailure, payload: Record<string, unknown>, resolutionNote: string): Promise<void> {
  const context = captureAuthSession();
  if (!context.accountId || failure.ownerId !== context.accountId) throw new Error('Failure belongs to another account');
  if (!navigator.onLine) throw new Error('Reconnect and review current server state before correcting');
  if (!resolutionNote.trim()) throw new Error('Explain the correction');
  if (flushInFlight) throw new Error('Wait for synchronization to finish');
  const stored = (await getSyncFailures()).find((entry) => entry.idempotencyKey === failure.idempotencyKey);
  assertAuthSession(context);
  if (!stored) throw new Error('Failure has already been resolved');
  const db = await openDatabase();
  assertAuthSession(context);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, FAILURES_STORE, HISTORY_STORE], 'readwrite');
    tx.objectStore(STORE).put({ idempotencyKey: crypto.randomUUID(), ownerId: context.accountId, type: failure.type, payload, localTimestamp: new Date().toISOString(), supersedes: failure.idempotencyKey, resolutionNote });
    tx.objectStore(HISTORY_STORE).put({ ...failure, status: 'superseded', resolutionNote, timestamp: new Date().toISOString() });
    tx.objectStore(FAILURES_STORE).delete(failure.idempotencyKey);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
  assertAuthSession(context);
  await notifyQueueChanged(); void flushOfflineQueue();
}
