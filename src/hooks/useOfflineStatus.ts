import { useEffect, useState } from 'react';
import { flushOfflineQueue, getOfflineQueueCount } from '../services/offlineQueue';

export function useOfflineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queued, setQueued] = useState(0);
  useEffect(() => {
    const refresh = () => void getOfflineQueueCount().then(setQueued);
    const becameOnline = () => { setOnline(true); void flushOfflineQueue().finally(refresh); };
    const becameOffline = () => setOnline(false);
    const queueChanged = (event: Event) => setQueued((event as CustomEvent<number>).detail ?? 0);
    refresh();
    window.addEventListener('online', becameOnline);
    window.addEventListener('offline', becameOffline);
    window.addEventListener('ash-offline-queue', queueChanged);
    return () => {
      window.removeEventListener('online', becameOnline);
      window.removeEventListener('offline', becameOffline);
      window.removeEventListener('ash-offline-queue', queueChanged);
    };
  }, []);
  return { online, queued };
}
