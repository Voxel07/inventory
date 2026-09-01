import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getUsers, subscribeToUsers, updateUserPermissions } from '../services/userService';
import type { UserPermissionsFormData } from '../types';

export function useUsers() {
  const queryClient = useQueryClient();
  useEffect(() => subscribeToUsers(() => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['faction-orders'] });
  }), [queryClient]);
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
