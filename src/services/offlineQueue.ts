export type OfflineAction = {
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
  localTimestamp: string;
};

const DB_NAME = 'ash-inventory';
const STORE = 'sync-queue';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'idempotencyKey' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueOfflineAction(action: OfflineAction): Promise<void> {
  const db = await openDatabase();
  await transactionPromise(db, 'readwrite', (store) => store.put(action));
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
  const token = localStorage.getItem('ash.inventory.accessToken') || '';
  const user = JSON.parse(localStorage.getItem('ash.inventory.user') || 'null') as { name?: string; role?: string } | null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` };
  if (token.startsWith('dev:')) {
    headers['X-Actor-Id'] = token.slice(4);
    headers['X-Actor-Name'] = user?.name || 'Development Admin';
    headers['X-Actor-Role'] = String(user?.role || 'admin').trim().toLowerCase();
  }
  const baseUrl = (window.__ENV__?.API_URL || import.meta.env.VITE_API_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/sync`, { method: 'POST', headers, body: JSON.stringify({ actions }) });
  if (!response.ok) return;
  const payload = await response.json() as { results: Array<{ idempotencyKey: string; status: string }> };
  const resolved = new Set(payload.results.filter((result) => result.status === 'applied').map((result) => result.idempotencyKey));
  const db = await openDatabase();
  for (const id of resolved) await transactionPromise(db, 'readwrite', (store) => store.delete(id));
  await notifyQueueChanged();
  window.dispatchEvent(new CustomEvent('ash-api-change'));
}

async function notifyQueueChanged() {
  window.dispatchEvent(new CustomEvent('ash-offline-queue', { detail: await getOfflineQueueCount() }));
}

function transactionPromise(db: IDBDatabase, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    operation(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
