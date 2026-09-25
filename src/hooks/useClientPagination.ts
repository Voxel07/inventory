import { useState } from 'react';

/** Page size sentinel meaning "render the whole collection on one page". */
export const SHOW_ALL_PAGE_SIZE = -1;

export interface UseClientPaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
}

/**
 * Client-side pagination for already-loaded collections.
 *
 * Values are derived during render (no effects, no syncing), so a filter that
 * shrinks the collection cannot leave the caller on an unreachable page: the
 * current page is clamped to the available range on every render.
 *
 * `SHOW_ALL_PAGE_SIZE` keeps the "all entries" option working for callers that
 * want the complete collection in the DOM.
 */
export function useClientPagination<T>(items: T[], options?: UseClientPaginationOptions) {
  const [page, setPage] = useState(options?.initialPage ?? 1);
  const [pageSize, setPageSize] = useState(options?.initialPageSize ?? 20);

  const effectivePageSize = pageSize === SHOW_ALL_PAGE_SIZE ? Number.MAX_SAFE_INTEGER : pageSize;
  const pageCount = Math.max(1, Math.ceil(items.length / effectivePageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = items.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize);

  return {
    page: currentPage,
    setPage,
    pageSize,
    setPageSize,
    effectivePageSize,
    pageCount,
    pageItems,
    /** Matches the `ListPagination` contract: changing size restarts at page 1. */
    onPageSizeChange: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
  };
}
