import type { Item, ItemFormData } from '../types';
import { apiRequest, subscribeToApiChanges, uploadMedia } from './apiClient';
import { prepareItemImage } from '../utils/prepareItemImage';

async function uploadItemImages(files: File[] = []): Promise<string[]> {
  const images: string[] = [];
  // Bound decoding memory when several large camera photos are selected.
  for (const file of files) images.push(await uploadMedia(await prepareItemImage(file)));
  return images;
}

function payload(data: Partial<ItemFormData>) {
  const fields = { ...data };
  delete fields.imageFiles;
  delete fields.imageReplacements;
  delete fields.removeImages;
  return { ...fields, consumable: Boolean((data as Partial<ItemFormData> & { isConsumable?: boolean }).isConsumable) };
}
export function getItems(): Promise<Item[]> { return apiRequest('/api/items'); }
export function getItem(id: string): Promise<Item> { return apiRequest(`/api/items/${id}`); }
export async function createItem(data: ItemFormData): Promise<Item> {
  const images = await uploadItemImages(data.imageFiles);
  return apiRequest('/api/items', { method: 'POST', body: { ...payload(data), images } });
}
export async function updateItem(id: string, data: Partial<ItemFormData>): Promise<Item> {
  const current = await getItem(id);
  const uploaded = await uploadItemImages(data.imageFiles);
  const removed = new Set(data.removeImages || []);
  const images: string[] = [];
  for (const image of current.images || []) {
    if (removed.has(image)) continue;
    const replacement = data.imageReplacements?.[image];
    images.push(replacement ? await uploadMedia(await prepareItemImage(replacement)) : image);
  }
  images.push(...uploaded);
  return apiRequest(`/api/items/${id}`, { method: 'PATCH', body: { ...payload(data), images } });
}
export async function deleteItem(id: string): Promise<boolean> { await apiRequest(`/api/items/${id}`, { method: 'DELETE' }); return true; }
export function subscribeToItems(callback: (data: { action: string; record: Item }) => void) {
  return subscribeToApiChanges(() => callback({ action: 'refresh', record: {} as Item }));
}
