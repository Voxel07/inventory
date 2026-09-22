import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAssignableUsers, getUsers, updateUserPermissions } from '../services/userService';
import type { UserPermissionsFormData } from '../types';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });
}

export function useUpdateUserPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UserPermissionsFormData }) => updateUserPermissions(userId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useAssignableUsers() {
  return useQuery({ queryKey: ['users', 'assignable'], queryFn: getAssignableUsers });
}
