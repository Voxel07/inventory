import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getAssignableUsers, getUsers, updateUserPermissions } from '../services/userService';
import type { User, UserPermissionsFormData } from '../types';
import { useProgressiveList } from './useProgressiveList';

export function useUsers() {
  return useProgressiveList<User>(['users'], (page, size) => getUsers({ page, size }));
}

export function useUpdateUserPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UserPermissionsFormData }) => updateUserPermissions(userId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useAssignableUsers() {
  return useProgressiveList<User>(['users', 'assignable'], (page, size) => getAssignableUsers({ page, size }));
}
