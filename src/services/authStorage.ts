// Durable persistence for the OIDC session so a PWA cold start can restore
// authentication (and refresh the access token) even when the sessionStorage
// copy is gone. The access token remains in memory/sessionStorage for normal
// requests; only the refresh-capable session is mirrored to IndexedDB.

export type StoredAuthSession = {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number | null;
  user: unknown;
};

const DB_NAME = 'ash-auth';
const DB_VERSION = 1;
const STORE = 'session';
const KEY = 'oidc-session';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveStoredAuthSession(session: StoredAuthSession): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(session, KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.warn('Failed to persist auth session for offline use', error);
  }
}

export async function loadStoredAuthSession(): Promise<StoredAuthSession | null> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result ? (request.result as StoredAuthSession) : null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearStoredAuthSession(): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).delete(KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.warn('Failed to clear persisted auth session', error);
  }
}
