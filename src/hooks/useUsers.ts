import { useQuery } from '@tanstack/react-query';
import { loadAllPages } from '../services/apiPagination';
import { getUsers } from '../services/userService';
import type { UserRole } from '../types';
import { useAuth } from './useAuth';
import { canManageUsers } from '../utils/access';

export function useUsers(page: number, size: number, search: string, role?: UserRole) {
  const { user } = useAuth();
  return useQuery({ queryKey: ['users', { page, size, search, role }], enabled: canManageUsers(user),
    queryFn: () => getUsers(page, size, search, role) });
}

/** Explicit complete read of the people directory, for person filters and assignment selects. */
export function useAllUsers(enabled = true) {
  return useQuery({ queryKey: ['users', 'all'], enabled, networkMode: 'offlineFirst', queryFn: () => loadAllPages(getUsers) });
}
