import { MutationCache, QueryClient } from '@tanstack/react-query';
import { getAuthSnapshot, subscribeAuth } from './authManager';
import { OfflineQueuedError } from './apiClient';
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
    defaultOptions: { queries: { staleTime: 30_000, retry: 2 } },
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
