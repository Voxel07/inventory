import type { QueryClient } from '@tanstack/react-query';
import { affectedDomains, domainForQuery, type ApiChangeDetail } from '../services/apiChanges';

/** One invalidation per change/batch, shared by local writes and SSE. */
export function invalidateForApiChange(queryClient: QueryClient, detail?: ApiChangeDetail): void {
  if (detail?.type === 'access.changed' || detail?.type === 'access.invalidated') {
    void queryClient.cancelQueries().then(() => {
      queryClient.resetQueries();
    });
    return;
  }
  const domains = affectedDomains(detail);
  void queryClient.invalidateQueries({ predicate: query => domains === null || domains.has(domainForQuery(query.queryKey)) });
}
