const DATABASE = 'ash-inventory-native-web';
const STORE = 'data';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getData(key: string): Promise<string | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    request.onsuccess = () => { resolve(request.result ?? null); db.close(); };
    request.onerror = () => { reject(request.error); db.close(); };
  });
}

async function write(key: string, value?: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    if (value === undefined) store.delete(key);
    else store.put(value, key);
    tx.oncomplete = () => { resolve(); db.close(); };
    tx.onerror = () => { reject(tx.error); db.close(); };
  });
}

export const setData = (key: string, value: string) => write(key, value);
export const removeData = (key: string) => write(key);
// Browser storage is origin scoped. There is no web equivalent of native SecureStore.
export const getSecret = getData;
export const setSecret = setData;
export const removeSecret = removeData;
