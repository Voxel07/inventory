import { useAuth } from './useAuth';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../services/apiClient';
import type { CheckedOutRow } from '../types/custody';

export function useCustodyBalances(mine = false) {
  const { user } = useAuth();
  return useQuery({ queryKey: ['custody-balances', mine, user?.id], queryFn: () => apiRequest<CheckedOutRow[]>('/api/custody-balances', { query: { mine } }) });
}
