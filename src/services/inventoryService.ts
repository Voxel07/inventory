import type { Item, ItemFormData, AssetInstance, AssetInstanceInput } from '../types';
import { apiRequest } from './apiClient';
import { stageImage } from './stagedImageService';
import { createCrudResourceApi } from './resourceFactory';

export interface InventoryCodeResolution {
  code: string;
  targetType: 'product' | 'asset' | 'location' | 'assembly' | string;
  targetId: string;
}

async function uploadItemImages(files: File[] = []): Promise<string[]> {
  return Promise.all(files.map(stageImage));
}

function payload(data: Partial<ItemFormData>) {
  const fields = { ...data };
  delete fields.imageFiles;
  delete fields.imageReplacements;
  delete fields.removeImages;
  return { ...fields, consumable: Boolean((data as Partial<ItemFormData> & { isConsumable?: boolean }).isConsumable) };
}

export const itemApi = createCrudResourceApi<Item, ItemFormData>(
  '/api/items',
  'items',
  {
    transformPayload: payload,
    customCreate: async (data: ItemFormData, basePath: string) => {
      const images = await uploadItemImages(data.imageFiles);
      return apiRequest<Item>(basePath, { method: 'POST', body: { ...payload(data), images } });
    },
    customUpdate: async (id: string, data: Partial<ItemFormData>, basePath: string) => {
      const current = await itemApi.getById(id);
      const uploaded = await uploadItemImages(data.imageFiles);
      const removed = new Set(data.removeImages || []);
      const images: string[] = [];
      for (const image of current.images || []) {
        if (removed.has(image)) continue;
        const replacement = data.imageReplacements?.[image];
        images.push(replacement ? await stageImage(replacement) : image);
      }
      images.push(...uploaded);
      return apiRequest<Item>(`${basePath}/${id}`, { method: 'PATCH', body: { ...payload(data), images } });
    },
  },
);

export const getItems = itemApi.getAll;
export const getItem = itemApi.getById;
export const createItem = itemApi.create;
export const updateItem = itemApi.update;
export const deleteItem = itemApi.delete;
export const deleteItems = itemApi.deleteMany;

export async function getItemAssets(itemId: string): Promise<AssetInstance[]> {
  return apiRequest<AssetInstance[]>(`/api/items/${itemId}/assets`);
}

export function resolveInventoryCode(code: string): Promise<InventoryCodeResolution> {
  return apiRequest(`/api/inventory-codes/resolve/${encodeURIComponent(code)}`);
}

export function getAssetByCode(code: string): Promise<AssetInstance> {
  return apiRequest(`/api/assets/by-code/${encodeURIComponent(code)}`);
}

export async function createItemAssets(itemId: string, input: AssetInstanceInput): Promise<AssetInstance[]> {
  return apiRequest<AssetInstance[]>(`/api/items/${itemId}/assets`, {
    method: 'POST',
    body: input,
  });
}

export async function updateItemAsset(itemId: string, assetId: string, input: AssetInstanceInput): Promise<AssetInstance> {
  return apiRequest<AssetInstance>(`/api/items/${itemId}/assets/${assetId}`, {
    method: 'PATCH',
    body: input,
  });
}

export async function deleteItemAsset(itemId: string, assetId: string): Promise<void> {
  await apiRequest<void>(`/api/items/${itemId}/assets/${assetId}`, {
    method: 'DELETE',
  });
}
