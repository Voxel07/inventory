import { useMutation } from '@tanstack/react-query';
import { createResourceHooks } from './useResourceApi';
import { itemApi, getItemAssets, createItemAssets, updateItemAsset, deleteItemAsset } from '../services/inventoryService';
import { useProgressiveList } from './useProgressiveList';
import type { Item, ItemFormData, AssetInstance, AssetInstanceInput } from '../types';

export const {
  useList: usePagedItems,
  useDetail: useItem,
  useCreate: useCreateItem,
  useUpdate: useUpdateItem,
  useDelete: useDeleteItem,
  useDeleteMany: useDeleteItems,
} = createResourceHooks<Item, ItemFormData>(itemApi, 'items');

export function useItems() {
  return useProgressiveList<Item>(['items'], (page, size) => itemApi.getAll({ page, size }));
}

export function useItemAssets(itemId: string | undefined) {
  return useProgressiveList<AssetInstance>(
    ['items', itemId, 'assets'],
    (page, size) => getItemAssets(itemId!, { page, size }),
    { enabled: Boolean(itemId) },
  );
}

export function useCreateItemAsset(itemId: string | undefined) {
  return useMutation({
    mutationFn: (input: AssetInstanceInput) => createItemAssets(itemId!, input),
  });
}

export function useUpdateItemAsset(itemId: string | undefined) {
  return useMutation({
    mutationFn: ({ assetId, input }: { assetId: string; input: AssetInstanceInput }) =>
      updateItemAsset(itemId!, assetId, input),
  });
}

export function useDeleteItemAsset(itemId: string | undefined) {
  return useMutation({
    mutationFn: (assetId: string) => deleteItemAsset(itemId!, assetId),
  });
}
