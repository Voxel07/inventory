import { useEffect, useState } from 'react';
import { flushOfflineQueue, getCatalogFallbacks, getOfflineQueueCount, getSyncFailureCount, getSyncState, type SyncState } from '../services/offlineQueue';
import { subscribeAuth } from '../services/authManager';

type OfflineQueueDetail = { queued?: number; failures?: number; sync?: SyncState };

export function useOfflineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queued, setQueued] = useState(0);
  const [syncIssues, setSyncIssues] = useState(0);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [sync, setSync] = useState<SyncState>(getSyncState);
  useEffect(() => {
    const refresh = () => void Promise.all([getOfflineQueueCount(), getSyncFailureCount()])
      .then(([queueCount, failureCount]) => {
        setQueued(queueCount);
        setSyncIssues(failureCount);
        setSync(getSyncState());
      });
    const becameOnline = () => { setOnline(true); void flushOfflineQueue().finally(refresh); };
    const becameOffline = () => setOnline(false);
    const queueChanged = (event: Event) => {
      const detail = (event as CustomEvent<OfflineQueueDetail>).detail ?? {};
      setQueued(detail.queued ?? 0);
      setSyncIssues(detail.failures ?? 0);
      setSync(detail.sync ?? getSyncState());
    };
    refresh();
    const cacheChanged = () => setCachedAt(getCatalogFallbacks().map((entry) => entry.cachedAt).sort((a, b) => a - b)[0] ?? null);
    cacheChanged();
    const unsubscribeAuth = subscribeAuth(() => { refresh(); cacheChanged(); });
    window.addEventListener('ash-offline-cache', cacheChanged);
    window.addEventListener('online', becameOnline);
    window.addEventListener('offline', becameOffline);
    window.addEventListener('ash-offline-queue', queueChanged);
    return () => {
      unsubscribeAuth();
      window.removeEventListener('ash-offline-cache', cacheChanged);
      window.removeEventListener('online', becameOnline);
      window.removeEventListener('offline', becameOffline);
      window.removeEventListener('ash-offline-queue', queueChanged);
    };
  }, []);
  return { online, queued, syncIssues, cachedAt, sync };
}
