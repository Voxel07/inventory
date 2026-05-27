import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getStorageLocations,
  getStorageLocation,
  createStorageLocation,
  updateStorageLocation,
  deleteStorageLocation,
  subscribeToStorageLocations,
} from '../services/storageLocationService';
import { useEffect } from 'react';

export function useStorageLocations() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['storageLocations'],
    queryFn: getStorageLocations,
  });

  useEffect(() => {
    const unsubscribe = subscribeToStorageLocations(() => {
      queryClient.invalidateQueries({ queryKey: ['storageLocations'] });
    });
    return unsubscribe;
  }, [queryClient]);

  return query;
}

export function useStorageLocation(id: string) {
  return useQuery({
    queryKey: ['storageLocations', id],
    queryFn: () => getStorageLocation(id),
    enabled: !!id,
  });
}

export function useCreateStorageLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      area?: string;
      location?: string;
      position?: string;
    }) => createStorageLocation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageLocations'] });
    },
  });
}

export function useUpdateStorageLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        name: string;
        description: string;
        area: string;
        location: string;
        position: string;
      }>;
    }) => updateStorageLocation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageLocations'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useDeleteStorageLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteStorageLocation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageLocations'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
