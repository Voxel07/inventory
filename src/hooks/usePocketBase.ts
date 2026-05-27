import { useEffect } from 'react';
import pb from '../services/pocketbaseClient';

export function usePocketBase() {
  const isAuthenticated = pb.authStore.isValid;
  const user = pb.authStore.record;

  async function login(email: string, password: string) {
    return pb.collection('users').authWithPassword(email, password);
  }

  function logout() {
    pb.authStore.clear();
    // Delete the pb_auth cookie by setting its expiration to the past
    document.cookie = 'pb_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
  }

  return { pb, isAuthenticated, user, login, logout };
}

export function useRealtimeSubscription<T>(
  collection: string,
  callback: (data: { action: string; record: T }) => void,
) {
  useEffect(() => {
    pb.collection(collection).subscribe<T>('*', (e) => {
      callback({ action: e.action, record: e.record });
    }).catch((err) => {
      console.warn(`Failed to subscribe to realtime updates for ${collection}:`, err);
    });
    return () => {
      pb.collection(collection).unsubscribe('*');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection]);
}
