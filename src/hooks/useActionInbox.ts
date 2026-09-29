import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../services/apiClient';
import { useAuth } from './useAuth';
export interface InboxAction { key: string; kind: string; title: string; detail?: string; due?: string; path: string; remindAt?: string }
export function useActionInbox() {
  const { user } = useAuth();
  return useQuery({ queryKey: ['action-inbox', user?.id], queryFn: () => apiRequest<InboxAction[]>('/api/action-inbox'), refetchInterval: 60_000, enabled: Boolean(user) });
}
