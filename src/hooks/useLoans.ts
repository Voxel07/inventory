import { queryKeys } from '../utils/queryKeys';
import { useInfiniteQuery } from '@tanstack/react-query';
import { loanApi } from '../services/loanService';
export const useLoans = () => {
  const query = useInfiniteQuery({ queryKey: queryKeys.loans(), initialPageParam: 0,
    queryFn: ({ pageParam }) => loanApi.list(pageParam),
    getNextPageParam: (last, pages) => last.length === 100 ? pages.length : undefined });
  return { ...query, data: query.data?.pages.flat() };
};
