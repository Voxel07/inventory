import { useQuery } from '@tanstack/react-query';
import { loadAllPages } from '../services/apiPagination';
import { getAssignableUsers, getUsers } from '../services/userService';
import type { User } from '../types';
import { usePagedList } from './usePagedList';

export function useUsers() {
  return usePagedList<User>(['users'], getUsers);
}

/** Explicit complete read of the people directory, for person filters and assignment selects. */
export function useAllUsers(enabled = true) {
  return useQuery({ queryKey: ['users', 'all'], enabled, networkMode: 'offlineFirst', queryFn: () => loadAllPages(getUsers) });
}

export function useAssignableUsers(enabled = true) {
  return usePagedList<User>(['users', 'assignable'], getAssignableUsers, { enabled });
}
