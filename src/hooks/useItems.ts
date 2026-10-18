import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createResourceHooks } from './useResourceApi';
import { itemApi, getItemAssets, getItemCategories, createItemAssets, updateItemAsset, deleteItemAsset, getAssetRuntime, logAssetRuntime } from '../services/inventoryService';
import { useCompleteList, usePagedList } from './usePagedList';
import type { Item, ItemFormData, AssetInstance, AssetInstanceInput, RuntimeEntry, RuntimeInput } from '../types';

export const {
  useDetail: useItem,
  useCreate: useCreateItem,
  useUpdate: useUpdateItem,
  useDelete: useDeleteItem,
  useDeleteMany: useDeleteItems,
} = createResourceHooks<Item, ItemFormData>(itemApi, 'items');

/** Server-side catalog filters; every list screen pages these on demand. */
export type ItemQuery = { search?: string; category?: string; eventType?: string; includeUntagged?: boolean; locationId?: readonly string[]; id?: readonly string[]; mine?: boolean; sort?: string; maintenanceAttention?: boolean };

export function usePagedItems(query: ItemQuery = {}, options?: { enabled?: boolean; size?: number }) {
  return usePagedList<Item>(['items', 'page', query], (page, size) => itemApi.getPage(query, page, size), options);
}

/** Exactly the requested items (names, stock and detail for rows that reference them); one request per 100 ids. */
export function useItemsByIds(ids: readonly string[]) {
  const unique = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['items', 'ids', unique],
    enabled: unique.length > 0,
    networkMode: 'offlineFirst',
    queryFn: async () => (await Promise.all(chunks(unique, 100).map((id) => itemApi.getPage({ id }, 0, 100)))).flatMap((page) => page.rows),
  });
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

/** Every asset of one item: asset pickers and location tables decide over the whole (per-item bounded) set. */
export function useItemAssets(itemId: string | undefined) {
  return useCompleteList<AssetInstance>(['items', itemId, 'assets'], (page, size) => getItemAssets(itemId!, page, size),
    { enabled: Boolean(itemId) });
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

export function useAssetRuntime(itemId: string | undefined, assetId: string | undefined) {
  return useCompleteList<RuntimeEntry>(['items', itemId, 'assets', assetId, 'runtime'], (page, size) => getAssetRuntime(itemId!, assetId!, page, size),
    { enabled: Boolean(itemId && assetId) });
}

export function useLogAssetRuntime(itemId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, input }: { assetId: string; input: RuntimeInput }) => logAssetRuntime(itemId!, assetId, input),
    onSuccess: (_entry, { assetId }) => {
      void client.invalidateQueries({ queryKey: ['items', itemId, 'assets'] });
      void client.invalidateQueries({ queryKey: ['items', itemId, 'assets', assetId, 'runtime'] });
    },
  });
}

export function useDeleteItemAsset(itemId: string | undefined) {
  return useMutation({
    mutationFn: (assetId: string) => deleteItemAsset(itemId!, assetId),
  });
}

/** Categories of the items visible to the caller, read without the catalog. */
export function useItemCategories() {
  return useQuery({ queryKey: ['items', 'categories'], queryFn: getItemCategories, networkMode: 'offlineFirst', staleTime: 60_000 });
}
