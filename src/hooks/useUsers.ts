import { useMutation } from '@tanstack/react-query';
import { getAssignableUsers, getUsers, updateUserPermissions } from '../services/userService';
import type { User, UserPermissionsFormData } from '../types';
import { useProgressiveList } from './useProgressiveList';

export function useUsers() {
  return useProgressiveList<User>(['users'], (page, size) => getUsers({ page, size }));
}

export function useUpdateUserPermissions() {
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UserPermissionsFormData }) => updateUserPermissions(userId, data),
  });
}

export function useAssignableUsers(enabled = true) {
  return useProgressiveList<User>(['users', 'assignable'], (page, size) => getAssignableUsers({ page, size }), { enabled });
}
