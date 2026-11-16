import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../services/apiClient';

export type LifecycleResourceKind = 'items' | 'storage-locations' | 'assemblies' | 'groups';
export type AccountLifecycleOverview = { active: boolean; revision: number; keeperAssignments: number; custody: unknown[];
  resources: { policyId: string; id: string; kind: LifecycleResourceKind; name: string }[]; moreResources: boolean };

/** Lifecycle state of an account; its revision is the account's access revision, shared with the role editor. */
export function useAccountLifecycle(userId: string) {
  return useQuery({ queryKey: ['account-lifecycle', userId],
    queryFn: () => apiRequest<AccountLifecycleOverview>(`/api/users/${userId}/lifecycle`) });
}
