import { useEffect } from 'react';
import pb from '../services/pocketbaseClient';

export function usePocketBase() {
  const isAuthenticated = pb.authStore.isValid;
  const user = pb.authStore.record;

  async function login(email: string, password: string) {
    return pb.collection('inventory_users').authWithPassword(email, password);
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
    pb.collection(collection).subscribe<T>('*', (e) => {
      callback({ action: e.action, record: e.record });
    });
    return () => {
      pb.collection(collection).unsubscribe('*');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection]);
}
