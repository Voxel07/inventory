import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import { LIST_PAGE_SIZE } from '../services/apiPagination';

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
    initialPageParam: options?.page ?? 0,
    queryFn: ({ pageParam }) => getPage(pageParam, size),
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      options?.page === undefined && lastPage.length === size ? lastPageParam + 1 : undefined,
  });
  const { hasNextPage, isFetching, isFetchingNextPage, isError, fetchNextPage } = query;

  useEffect(() => {
    if (options?.enabled !== false && hasNextPage && !isFetching && !isError) {
      void fetchNextPage({ cancelRefetch: false });
    }
  }, [options?.enabled, hasNextPage, isFetching, isError, fetchNextPage]);
  const data = query.data?.pages.flat();

  return {
    ...query,
    data,
    isComplete: !hasNextPage && !isFetchingNextPage,
  };
}
