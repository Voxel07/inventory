// Durable persistence for the OIDC session so a PWA cold start can restore
// authentication (and refresh the access token) even when the sessionStorage
// copy is gone. The access token remains in memory/sessionStorage for normal
// requests; only the refresh-capable session is mirrored to IndexedDB.
import { decodeAuthSession, type PersistedAuthSession } from './authSession';

const DB_NAME = 'ash-auth';
const DB_VERSION = 1;
const STORE = 'session';
const KEY = 'oidc-session';
/** Highest token revision ended by a sign-out; a cold start never restores a generation at or below it. */
const SIGNED_OUT_REVISION = 'ash.inventory.signedOutRevision';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the schema must not be blocked by this connection.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Opening the auth session store failed'));
    request.onblocked = () => reject(new Error('The auth session store is blocked by another tab'));
  });
}

/** Runs one request in its own transaction and closes the connection; aborts and errors reject. */
async function run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error('Auth session transaction failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Auth session transaction was aborted'));
    });
  } finally {
    db.close();
  }
}

export function signedOutRevision(): number {
  try {
    return Number(localStorage.getItem(SIGNED_OUT_REVISION)) || 0;
  } catch {
    return 0;
  }
}

export async function saveStoredAuthSession(session: PersistedAuthSession): Promise<void> {
  await run('readwrite', (store) => store.put(session, KEY));
}

export async function loadStoredAuthSession(): Promise<PersistedAuthSession | null> {
  let stored: PersistedAuthSession | null;
  try {
    stored = decodeAuthSession(await run('readonly', (store) => store.get(KEY)));
  } catch (error) {
    console.warn('Failed to read the persisted auth session', error);
    return null;
  }
  if (stored && stored.tokenRevision > signedOutRevision()) return stored;
  // Ended or malformed: retry the deletion an earlier sign-out may not have completed.
  await run('readwrite', (store) => store.delete(KEY)).catch(() => {});
  return null;
}

/**
 * Ends every stored generation up to {@code revision}. The synchronous sign-out marker is written first, so a
 * failed or aborted IndexedDB deletion can no longer restore the session on a cold start. Rejects only when
 * neither the marker nor the deletion could be stored.
 */
export async function clearStoredAuthSession(revision: number): Promise<void> {
  let marked = false;
  try {
    localStorage.setItem(SIGNED_OUT_REVISION, String(Math.max(revision, signedOutRevision())));
    marked = true;
  } catch (error) {
    console.warn('Failed to record the sign-out marker', error);
  }
  try {
    await run('readwrite', (store) => store.delete(KEY));
  } catch (error) {
    if (!marked) throw error;
    console.warn('Failed to delete the persisted auth session; the sign-out marker prevents its restoration', error);
  }
}
