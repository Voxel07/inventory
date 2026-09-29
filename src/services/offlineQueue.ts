import { API_URL } from '../config/runtimeConfig';
import { getAuthSnapshot, getAuthorizationHeaders } from './authManager';

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
const ownerId = () => getAuthSnapshot().user?.id;
const scopedKey = (key: string) => `${ownerId() ?? 'signed-out'}:${key}`;
const catalogFallbacks = new Map<string, string>();
export const getCatalogFallbacks = () => [...catalogFallbacks.entries()].filter(([key]) => key.startsWith(`${ownerId()}:`)).map(([key, cachedAt]) => ({ key, cachedAt }));

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

export async function setOfflineCatalog<T>(key: string, data: T): Promise<void> {
  const catalogKey = scopedKey(key);
  try {
    const db = await openDatabase();
    await transactionPromise(db, CATALOG_STORE, 'readwrite', (store) => store.put({ key: catalogKey, data, cachedAt: new Date().toISOString() }));
    if (catalogFallbacks.delete(catalogKey)) window.dispatchEvent(new Event('ash-offline-cache'));
  } catch (err) {
    console.warn('Failed to cache catalog offline', key, err);
  }
}

export async function getOfflineCatalog<T>(key: string): Promise<T | null> {
  const catalogKey = scopedKey(key);
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const request = db.transaction(CATALOG_STORE, 'readonly').objectStore(CATALOG_STORE).get(catalogKey);
      request.onsuccess = () => {
        if (request.result) { catalogFallbacks.set(catalogKey, request.result.cachedAt); window.dispatchEvent(new Event('ash-offline-cache')); }
        resolve(request.result ? (request.result.data as T) : null);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function enqueueOfflineAction(action: OfflineAction): Promise<void> {
  const actionOwner = ownerId();
  const db = await openDatabase();
  if (!actionOwner || ownerId() !== actionOwner) throw new Error('Sign in with the same account before saving an offline action');
  await transactionPromise(db, STORE, 'readwrite', (store) => store.put({ ...action, ownerId: actionOwner }));
  await notifyQueueChanged();
}

export async function getOfflineActions(): Promise<OfflineAction[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as OfflineAction[]).filter((action) => Boolean(ownerId()) && action.ownerId === ownerId()).sort((a, b) => a.localTimestamp.localeCompare(b.localTimestamp)));
    request.onerror = () => reject(request.error);
  });
}

export async function discardOfflineAction(idempotencyKey: string): Promise<void> {
  if (flushInFlight) throw new Error('SYNC_IN_PROGRESS');
  const db = await openDatabase();
  const action = (await getOfflineActions()).find((entry) => entry.idempotencyKey === idempotencyKey);
  if (!action) throw new Error('Queued action not found');
  await archiveAndDelete(db, STORE, action, 'discarded');
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
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(FAILURES_STORE, 'readonly').objectStore(FAILURES_STORE).getAll();
    request.onsuccess = () => resolve((request.result as SyncFailure[]).filter((failure) => Boolean(ownerId()) && failure.ownerId === ownerId()));
    request.onerror = () => reject(request.error);
  });
}

export async function getSyncFailureCount(): Promise<number> {
  return (await getSyncFailures()).length;
}

export async function discardSyncFailure(idempotencyKey: string): Promise<void> {
  const db = await openDatabase();
  const failure = (await getSyncFailures()).find((entry) => entry.idempotencyKey === idempotencyKey);
  if (!failure) throw new Error('Sync failure not found');
  await archiveAndDelete(db, FAILURES_STORE, failure, 'archived');
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
    const actor = ownerId();
    authorizationHeaders = await getAuthorizationHeaders();
    if (!actor || ownerId() !== actor || actions.some((action) => action.ownerId !== actor)) throw new Error('Account changed during sync');
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
      await notifyQueueChanged();
      window.dispatchEvent(new CustomEvent('ash-api-change'));
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
  const [queued, failures] = await Promise.all([getOfflineQueueCount(), getSyncFailureCount()]);
  window.dispatchEvent(new CustomEvent('ash-offline-queue', { detail: { queued, failures } }));
}

function transactionPromise(db: IDBDatabase, storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<void> {
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
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(HISTORY_STORE).objectStore(HISTORY_STORE).getAll();
    request.onsuccess = () => resolve((request.result as OfflineHistory[]).filter((entry) => Boolean(ownerId()) && entry.ownerId === ownerId()).sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
    request.onerror = () => reject(request.error);
  });
}
export async function getCacheFreshness(): Promise<{ key: string; cachedAt: string }[]> {
  const db = await openDatabase(); const prefix = `${ownerId() ?? 'signed-out'}:`;
  return new Promise((resolve, reject) => {
    const request = db.transaction(CATALOG_STORE).objectStore(CATALOG_STORE).getAll();
    request.onsuccess = () => resolve((request.result as { key: string; cachedAt: string }[]).filter((entry) => entry.key.startsWith(prefix)).map((entry) => ({ key: entry.key.slice(prefix.length), cachedAt: entry.cachedAt })));
    request.onerror = () => reject(request.error);
  });
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
  if (!navigator.onLine) throw new Error('Reconnect and review current server state before correcting');
  if (!resolutionNote.trim()) throw new Error('Explain the correction');
  if (flushInFlight) throw new Error('Wait for synchronization to finish');
  const stored = (await getSyncFailures()).find((entry) => entry.idempotencyKey === failure.idempotencyKey);
  if (!stored) throw new Error('Failure has already been resolved');
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, FAILURES_STORE, HISTORY_STORE], 'readwrite');
    tx.objectStore(STORE).put({ idempotencyKey: crypto.randomUUID(), ownerId: ownerId(), type: failure.type, payload, localTimestamp: new Date().toISOString(), supersedes: failure.idempotencyKey, resolutionNote });
    tx.objectStore(HISTORY_STORE).put({ ...failure, status: 'superseded', resolutionNote, timestamp: new Date().toISOString() });
    tx.objectStore(FAILURES_STORE).delete(failure.idempotencyKey);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
  await notifyQueueChanged(); void flushOfflineQueue();
}

/** Unowned pre-v4 commands are retained for manual reconciliation, never replayed as a different user. */
export async function getLegacyOfflineEvidence(): Promise<unknown[]> {
  const db = await openDatabase();
  const read = (store: string) => new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result.filter((entry: Record<string, unknown>) => !entry.ownerId).map((entry: Record<string, unknown>) => ({ ...entry, source: store })));
    request.onerror = () => reject(request.error);
  });
  return (await Promise.all([read(STORE), read(FAILURES_STORE)])).flat();
}
