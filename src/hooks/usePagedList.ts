import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { LIST_PAGE_SIZE, loadAllPages, type Page } from '../services/apiPagination';

/**
 * Server pages on demand: the first page loads with the screen and further pages only on `fetchNextPage`
 * (a "load more" action), so an invalidation refetches what was shown instead of the whole collection.
 * Continuation comes from the page envelope, including pages restored from the offline cache.
 */
export function usePagedList<T>(
  queryKey: readonly unknown[],
  getPage: (page: number, size: number) => Promise<Page<T>>,
  options?: { size?: number; enabled?: boolean },
) {
  const size = options?.size ?? LIST_PAGE_SIZE;
  const query = useInfiniteQuery({
    queryKey: [...queryKey, { size }],
    enabled: options?.enabled,
    // Collection readers fall back to the per-account offline cache; let a cold offline start reach it
    // instead of pausing until the network returns.
    networkMode: 'offlineFirst',
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getPage(pageParam, size),
    getNextPageParam: (lastPage) => lastPage.more ? lastPage.page + 1 : undefined,
  });
  const data = query.data?.pages.flatMap((page) => page.rows);
  return {
    ...query,
    data,
    /** Every server row is loaded; otherwise lists offer `fetchNextPage`. */
    isComplete: Boolean(query.data) && !query.hasNextPage,
  };
}

/**
 * Explicit exhaustive read for a decision that needs every row of a bounded collection (one item's positions,
 * assets or lots). Unbounded screens use {@link usePagedList}.
 */
export function useCompleteList<T>(
  queryKey: readonly unknown[],
  getPage: (page: number, size: number) => Promise<Page<T>>,
  options?: { enabled?: boolean },
) {
  const query = useQuery({ queryKey: [...queryKey, 'complete'], enabled: options?.enabled, networkMode: 'offlineFirst',
    queryFn: () => loadAllPages(getPage) });
  return { ...query, isComplete: query.isSuccess };
}
