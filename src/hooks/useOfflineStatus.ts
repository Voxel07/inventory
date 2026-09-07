import { useEffect, useState } from 'react';
import { flushOfflineQueue, getOfflineQueueCount, getSyncFailureCount } from '../services/offlineQueue';

type OfflineQueueDetail = { queued?: number; failures?: number };

export function useOfflineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queued, setQueued] = useState(0);
  const [syncIssues, setSyncIssues] = useState(0);
  useEffect(() => {
    const refresh = () => void Promise.all([getOfflineQueueCount(), getSyncFailureCount()])
      .then(([queueCount, failureCount]) => {
        setQueued(queueCount);
        setSyncIssues(failureCount);
      });
    const becameOnline = () => { setOnline(true); void flushOfflineQueue().finally(refresh); };
    const becameOffline = () => setOnline(false);
    const queueChanged = (event: Event) => {
      const detail = (event as CustomEvent<OfflineQueueDetail>).detail ?? {};
      setQueued(detail.queued ?? 0);
      setSyncIssues(detail.failures ?? 0);
    };
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
  return { online, queued, syncIssues };
}
