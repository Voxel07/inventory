import { containsPrivateInventory } from './privateInventoryCache';
import { MutationCache, QueryClient } from '@tanstack/react-query';
import { getAuthSnapshot, subscribeAuth } from './authManager';
import { ApiError, OfflineQueuedError } from './apiClient';
import { SessionChangedError } from './authManager';
import { useUIStore } from '../store/uiStore';
import { translate } from '../utils/naming';

function createSessionClient(generation: number): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => {
        if (getAuthSnapshot().generation === generation && error instanceof OfflineQueuedError) {
          useUIStore.getState().showSnackbar(
            translate('Offline gespeichert — wird bei Verbindung synchronisiert', 'Saved offline — will sync when connected'),
            'info',
          );
        }
      },
    }),
    defaultOptions: { queries: { staleTime: 30_000, retry: (failures, error) => failures < 2
      && !(error instanceof SessionChangedError)
      && (!(error instanceof ApiError) || error.status === 408 || error.status === 429 || error.status >= 500) } },
  });
}

let generation = getAuthSnapshot().generation;
let client = createSessionClient(generation);
const listeners = new Set<() => void>();

subscribeAuth(() => {
  if (generation === getAuthSnapshot().generation) return;
  generation = getAuthSnapshot().generation;
  void client.cancelQueries();
  client.clear();
  client = createSessionClient(generation);
  useUIStore.getState().resetTransactionFilters();
  useUIStore.getState().hideSnackbar();
  listeners.forEach((listener) => listener());
});

export const getSessionQueryClient = () => client;
export function subscribeSessionQueryClient(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Private snapshots stay in memory for at most a minute and disappear when connectivity is lost.
const evictPrivateQueries = () => {
  const predicate = (query: { state: { data: unknown } }) => containsPrivateInventory(query.state.data);
  void client.cancelQueries({ predicate }).then(() => client.resetQueries({ predicate }));
};
window.setInterval(evictPrivateQueries, 60_000);
window.addEventListener('offline', evictPrivateQueries);
window.addEventListener('online', evictPrivateQueries);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') evictPrivateQueries(); });
