import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createResourceHooks } from './useResourceApi';
import { itemApi, getItemAssets, createItemAssets, updateItemAsset, deleteItemAsset } from '../services/inventoryService';
import type { Item, ItemFormData, AssetInstanceInput } from '../types';

export const {
  useList: useItems,
  useDetail: useItem,
  useCreate: useCreateItem,
  useUpdate: useUpdateItem,
  useDelete: useDeleteItem,
  useDeleteMany: useDeleteItems,
} = createResourceHooks<Item, ItemFormData>(itemApi, 'items', ['transactions']);

export function useItemAssets(itemId: string | undefined) {
  return useQuery({
    queryKey: ['items', itemId, 'assets'],
    queryFn: () => getItemAssets(itemId!),
    enabled: Boolean(itemId),
  });
}

export function useCreateItemAsset(itemId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssetInstanceInput) => createItemAssets(itemId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items', itemId, 'assets'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['items', itemId] });
    },
  });
}

export function useUpdateItemAsset(itemId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, input }: { assetId: string; input: AssetInstanceInput }) =>
      updateItemAsset(itemId!, assetId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items', itemId, 'assets'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['items', itemId] });
    },
  });
}

export function useDeleteItemAsset(itemId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => deleteItemAsset(itemId!, assetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items', itemId, 'assets'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['items', itemId] });
    },
  });
}
