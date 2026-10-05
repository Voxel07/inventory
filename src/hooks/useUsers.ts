import { getAssignableUsers, getUsers } from '../services/userService';
import type { User } from '../types';
import { useProgressiveList } from './useProgressiveList';

export function useUsers() {
  return useProgressiveList<User>(['users'], (page, size) => getUsers({ page, size }));
}

export function useAssignableUsers(enabled = true) {
  return useProgressiveList<User>(['users', 'assignable'], (page, size) => getAssignableUsers({ page, size }), { enabled });
}
