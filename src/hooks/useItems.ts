import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  subscribeToItems,
} from '../services/inventoryService';
import type { ItemFormData } from '../types';
import { useEffect } from 'react';

export function useItems() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['items'],
    queryFn: getItems,
  });

  useEffect(() => {
    const unsubscribe = subscribeToItems(() => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    });
    return unsubscribe;
  }, [queryClient]);

  return query;
}

export function useItem(id: string) {
  return useQuery({
    queryKey: ['items', id],
    queryFn: () => getItem(id),
    enabled: !!id,
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ItemFormData) => createItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ItemFormData> }) => updateItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
