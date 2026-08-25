import { useEffect, useSyncExternalStore } from 'react';
import pb from '../services/pocketbaseClient';

type AuthSnapshot = {
  token: string;
  record: typeof pb.authStore.record;
};

let authSnapshot: AuthSnapshot = {
  token: pb.authStore.token,
  record: pb.authStore.record,
};
const authListeners = new Set<() => void>();

pb.authStore.onChange((token, record) => {
  authSnapshot = { token, record };
  authListeners.forEach((listener) => listener());
}, false);

function subscribeToAuth(listener: () => void) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

function getAuthSnapshot() {
  return authSnapshot;
}

export function usePocketBase() {
  const auth = useSyncExternalStore(subscribeToAuth, getAuthSnapshot, getAuthSnapshot);
  const isAuthenticated = pb.authStore.isValid && !!auth.record;
  const user = auth.record;

  async function login(email: string, password: string) {
    return pb.collection('users').authWithPassword(email, password);
  }

  function logout() {
    pb.authStore.clear();
  }

  return { pb, isAuthenticated, user, login, logout };
}

export function useRealtimeSubscription<T>(
  collection: string,
  callback: (data: { action: string; record: T }) => void,
) {
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => Promise<void>) | undefined;
    pb.collection(collection).subscribe<T>('*', (e) => {
      callback({ action: e.action, record: e.record });
    }).then((cleanup) => {
      if (disposed) void cleanup().catch((err) => console.warn(`Failed to clean up ${collection} subscription:`, err));
      else unsubscribe = cleanup;
    }).catch((err) => {
      console.warn(`Failed to subscribe to realtime updates for ${collection}:`, err);
    });
    return () => {
      disposed = true;
      void unsubscribe?.().catch((err) => console.warn(`Failed to clean up ${collection} subscription:`, err));
    };
  }, [collection, callback]);
}
