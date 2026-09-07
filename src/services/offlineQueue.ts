import { API_URL } from '../config/runtimeConfig';
import { getAuthorizationHeaders } from './authManager';

export type OfflineAction = {
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
  localTimestamp: string;
};

const DB_NAME = 'ash-inventory';
const DB_VERSION = 3;
const STORE = 'sync-queue';
const CATALOG_STORE = 'catalog-cache';
const FAILURES_STORE = 'sync-failures';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
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
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function setOfflineCatalog<T>(key: string, data: T): Promise<void> {
  try {
    const db = await openDatabase();
    await transactionPromise(db, CATALOG_STORE, 'readwrite', (store) => store.put({ key, data, cachedAt: new Date().toISOString() }));
  } catch (err) {
    console.warn('Failed to cache catalog offline', key, err);
  }
}

export async function getOfflineCatalog<T>(key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const request = db.transaction(CATALOG_STORE, 'readonly').objectStore(CATALOG_STORE).get(key);
      request.onsuccess = () => resolve(request.result ? (request.result.data as T) : null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function enqueueOfflineAction(action: OfflineAction): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(STORE, 'readwrite');
  await new Promise<void>((resolve, reject) => {
    const req = tx.objectStore(STORE).put(action);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  await notifyQueueChanged();
}

export async function getOfflineActions(): Promise<OfflineAction[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as OfflineAction[]);
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineQueueCount(): Promise<number> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export type SyncFailure = {
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
  status: 'conflict' | 'rejected';
  error: string;
  timestamp: string;
};

export async function getSyncFailures(): Promise<SyncFailure[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(FAILURES_STORE, 'readonly').objectStore(FAILURES_STORE).getAll();
    request.onsuccess = () => resolve(request.result as SyncFailure[]);
    request.onerror = () => reject(request.error);
  });
}

export async function getSyncFailureCount(): Promise<number> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(FAILURES_STORE, 'readonly').objectStore(FAILURES_STORE).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function discardSyncFailure(idempotencyKey: string): Promise<void> {
  const db = await openDatabase();
  await transactionPromise(db, FAILURES_STORE, 'readwrite', (store) => store.delete(idempotencyKey));
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
  const actions = await getOfflineActions();
  if (!actions.length) {
    flushAttempt = 0;
    return;
  }
  let authorizationHeaders: Record<string, string>;
  try {
    authorizationHeaders = await getAuthorizationHeaders();
  } catch {
    scheduleFlush(10_000);
    return;
  }
  flushInFlight = true;
  let retryDelay: number | null = null;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authorizationHeaders,
    };
    const response = await fetch(`${API_URL}/api/sync`, { method: 'POST', headers, body: JSON.stringify({ actions }) });
    if (!response.ok) {
      flushAttempt += 1;
      retryDelay = Math.min(60_000, 2_000 * 2 ** flushAttempt);
    } else {
      flushAttempt = 0;
      const payload = await response.json() as { results: Array<{ idempotencyKey: string; status: string; error?: string }> };
      const db = await openDatabase();
      for (const result of payload.results) {
        if (result.status === 'applied') {
          await transactionPromise(db, STORE, 'readwrite', (store) => store.delete(result.idempotencyKey));
          await transactionPromise(db, FAILURES_STORE, 'readwrite', (store) => store.delete(result.idempotencyKey));
        } else {
          const action = actions.find((candidate) => candidate.idempotencyKey === result.idempotencyKey);
          await transactionPromise(db, STORE, 'readwrite', (store) => store.delete(result.idempotencyKey));
          if (action) {
            await transactionPromise(db, FAILURES_STORE, 'readwrite', (store) => store.put({
              idempotencyKey: result.idempotencyKey,
              type: action.type,
              payload: action.payload,
              status: result.status === 'conflict' ? 'conflict' : 'rejected',
              error: result.error || result.status,
              timestamp: new Date().toISOString(),
            } satisfies SyncFailure));
          }
        }
      }
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
  });
}
