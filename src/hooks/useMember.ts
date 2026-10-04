import { queryKeys } from '../utils/queryKeys';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { memberApi } from '../services/memberService';
import { useAuth } from './useAuth';
export function useMember() {
  const { user } = useAuth();
  const options = { enabled: Boolean(user) };
  const custody = useQuery({ queryKey: queryKeys.member('custody', user?.id), queryFn: memberApi.custody, ...options });
  const stored = useQuery({ queryKey: queryKeys.member('storage', user?.id), queryFn: memberApi.storage, ...options });
  const requestPages = useInfiniteQuery({ queryKey: queryKeys.member('requests', user?.id), initialPageParam: 0,
    queryFn: ({ pageParam }) => memberApi.requests(pageParam),
    getNextPageParam: (last, pages) => last.length === 100 ? pages.length : undefined, ...options });
  const requests = { ...requestPages, data: requestPages.data?.pages.flat() };
  return { custody, stored, requests };
}
export const useMemberAssignments = () => useQuery({ queryKey: queryKeys.memberAssignments(), queryFn: memberApi.assignments });
