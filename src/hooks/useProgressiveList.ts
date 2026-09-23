import { useEffect, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

export const LIST_PAGE_SIZE = 100;

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
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);
  const data = useMemo(() => query.data?.pages.flat(), [query.data]);

  return {
    ...query,
    data,
    isComplete: !hasNextPage && !isFetchingNextPage,
  };
}
