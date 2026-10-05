import type { QueryClient } from '@tanstack/react-query';
import { affectedDomains, domainForQuery, revokesAccess, type ApiChangeDetail } from '../services/apiChanges';
import { containsPrivateInventory } from '../services/privateInventoryCache';

/** One invalidation per change/batch, shared by local writes and SSE. */
export function invalidateForApiChange(queryClient: QueryClient, detail?: ApiChangeDetail): void {
  if (revokesAccess(detail)) {
    // A permission change (or events missed while disconnected) can revoke private views: drop cached
    // private data at once. Everything else keeps its data while active queries refetch in place.
    const predicate = (query: { state: { data: unknown } }) => containsPrivateInventory(query.state.data);
    void queryClient.cancelQueries({ predicate }).then(() => queryClient.resetQueries({ predicate }));
    void queryClient.invalidateQueries();
    return;
  }
  const domains = affectedDomains(detail);
  void queryClient.invalidateQueries({ predicate: query => domains === null || domains.has(domainForQuery(query.queryKey)) });
}

/** Coalesces bursts of changes (SSE fan-out, bulk writes) into one invalidation per window. */
export function createApiChangeCoalescer(queryClient: QueryClient, windowMs = 300) {
  let pending: ApiChangeDetail[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    const changes = pending;
    pending = [];
    if (changes.length) invalidateForApiChange(queryClient, changes.length === 1 ? changes[0] : { type: 'batch', changes });
  };
  return {
    push(detail?: ApiChangeDetail) {
      pending.push(detail ?? { type: 'unknown' });
      timer ??= setTimeout(flush, windowMs);
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      pending = [];
    },
  };
}
