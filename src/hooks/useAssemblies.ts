import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAssemblies,
  getAssembly,
  createAssembly,
  updateAssembly,
  deleteAssembly,
  subscribeToAssemblies,
} from '../services/assemblyService';
import type { AssemblyFormData } from '../types';
import { useEffect } from 'react';

export function useAssemblies() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['assemblies'],
    queryFn: getAssemblies,
  });

  useEffect(() => {
    const unsubscribe = subscribeToAssemblies(() => {
      queryClient.invalidateQueries({ queryKey: ['assemblies'] });
    });
    return unsubscribe;
  }, [queryClient]);

  return query;
}

export function useAssembly(id: string) {
  return useQuery({
    queryKey: ['assemblies', id],
    queryFn: () => getAssembly(id),
    enabled: !!id,
  });
}

export function useCreateAssembly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AssemblyFormData) => createAssembly(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assemblies'] });
    },
  });
}

export function useUpdateAssembly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AssemblyFormData> }) =>
      updateAssembly(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assemblies'] });
    },
  });
}

export function useDeleteAssembly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAssembly(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assemblies'] });
    },
  });
}
