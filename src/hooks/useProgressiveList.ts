import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import { LIST_PAGE_SIZE } from '../services/apiPagination';
import { isFullPage } from '../services/pageCompleteness';

/** Show the first API page immediately, then fill the same cache in the background. */
export function useProgressiveList<T>(
  queryKey: readonly unknown[],
  getPage: (page: number, size: number) => Promise<T[]>,
  options?: { page?: number; size?: number; enabled?: boolean },
) {
  const size = options?.size ?? LIST_PAGE_SIZE;
  const query = useInfiniteQuery({
    queryKey,
    enabled: options?.enabled,
    // Collection readers fall back to the per-account offline cache; let a cold offline start reach it
    // instead of pausing until the network returns.
    networkMode: 'offlineFirst',
    initialPageParam: options?.page ?? 0,
    // The completeness flag is computed from the fetched array itself; cached copies lose that metadata.
    queryFn: async ({ pageParam }) => {
      const rows = await getPage(pageParam, size);
      return { rows, more: options?.page === undefined && isFullPage(rows, size) };
    },
    getNextPageParam: (lastPage, _pages, lastPageParam) => lastPage.more ? lastPageParam + 1 : undefined,
  });
  const { hasNextPage, isFetching, isFetchingNextPage, isError, fetchNextPage } = query;

  useEffect(() => {
    if (options?.enabled !== false && hasNextPage && !isFetching && !isError) {
      void fetchNextPage({ cancelRefetch: false });
    }
  }, [options?.enabled, hasNextPage, isFetching, isError, fetchNextPage]);
  const data = query.data?.pages.flatMap((page) => page.rows);

  return {
    ...query,
    data,
    isComplete: !hasNextPage && !isFetchingNextPage,
  };
}
