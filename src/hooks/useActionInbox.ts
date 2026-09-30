import { queryKeys } from '../utils/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { actionInboxApi } from '../services/actionInboxService';
import { useAuth } from './useAuth';
export function useActionInbox() {
  const { user } = useAuth();
  return useQuery({ queryKey: queryKeys.inbox(user?.id), queryFn: actionInboxApi.list, refetchInterval: 60_000, enabled: Boolean(user) });
}
