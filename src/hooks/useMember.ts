import { queryKeys } from '../utils/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { usePagedList } from './usePagedList';
import { memberApi } from '../services/memberService';
import { useAuth } from './useAuth';
export function useMember() {
  const { user } = useAuth();
  const options = { enabled: Boolean(user) };
  const custody = useQuery({ queryKey: queryKeys.member('custody', user?.id), queryFn: memberApi.custody, ...options });
  const stored = useQuery({ queryKey: queryKeys.member('storage', user?.id), queryFn: memberApi.storage, ...options });
  const requests = usePagedList(queryKeys.member('requests', user?.id), memberApi.requests, options);
  return { custody, stored, requests };
}
