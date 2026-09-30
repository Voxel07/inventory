import { queryKeys } from '../utils/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { memberApi } from '../services/memberService';
import { useAuth } from './useAuth';
export function useMember() {
  const { user } = useAuth();
  const options = { enabled: Boolean(user) };
  const custody = useQuery({ queryKey: queryKeys.member('custody', user?.id), queryFn: memberApi.custody, ...options });
  const stored = useQuery({ queryKey: queryKeys.member('storage', user?.id), queryFn: memberApi.storage, ...options });
  const requests = useQuery({ queryKey: queryKeys.member('requests', user?.id), queryFn: memberApi.requests, ...options });
  return { custody, stored, requests };
}
export const useMemberAssignments = () => useQuery({ queryKey: queryKeys.memberAssignments(), queryFn: memberApi.assignments });
