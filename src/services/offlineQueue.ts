import { API_URL } from '../config/runtimeConfig';
import { getAuthorizationHeaders } from './authManager';

export type OfflineAction = {
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
  localTimestamp: string;
};

const DB_NAME = 'ash-inventory';
const DB_VERSION = 2;
const STORE = 'sync-queue';
const CATALOG_STORE = 'catalog-cache';

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

export async function flushOfflineQueue(): Promise<void> {
  if (!navigator.onLine) return;
  const actions = await getOfflineActions();
  if (!actions.length) return;
  let authorizationHeaders: Record<string, string>;
  try {
    authorizationHeaders = await getAuthorizationHeaders();
  } catch {
    return;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...authorizationHeaders,
  };
  const response = await fetch(`${API_URL}/api/sync`, { method: 'POST', headers, body: JSON.stringify({ actions }) });
  if (!response.ok) return;
  const payload = await response.json() as { results: Array<{ idempotencyKey: string; status: string }> };
  const resolved = new Set(payload.results.filter((result) => result.status === 'applied').map((result) => result.idempotencyKey));
  const db = await openDatabase();
  for (const id of resolved) await transactionPromise(db, STORE, 'readwrite', (store) => store.delete(id));
  await notifyQueueChanged();
  window.dispatchEvent(new CustomEvent('ash-api-change'));
}

async function notifyQueueChanged() {
  window.dispatchEvent(new CustomEvent('ash-offline-queue', { detail: await getOfflineQueueCount() }));
}

function transactionPromise(db: IDBDatabase, storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    operation(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
