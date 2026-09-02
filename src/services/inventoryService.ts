import type { Item, ItemFormData } from '../types';
import { apiRequest, subscribeToApiChanges, uploadMedia } from './apiClient';

function payload(data: Partial<ItemFormData>) {
  const fields = { ...data };
  delete fields.imageFiles;
  delete fields.removeImages;
  return { ...fields, consumable: Boolean((data as Partial<ItemFormData> & { isConsumable?: boolean }).isConsumable) };
}
export function getItems(): Promise<Item[]> { return apiRequest('/api/items'); }
export function getItem(id: string): Promise<Item> { return apiRequest(`/api/items/${id}`); }
export async function createItem(data: ItemFormData): Promise<Item> {
  const images = await Promise.all((data.imageFiles || []).map(uploadMedia));
  return apiRequest('/api/items', { method: 'POST', body: { ...payload(data), images } });
}
export async function updateItem(id: string, data: Partial<ItemFormData>): Promise<Item> {
  const current = await getItem(id);
  const uploaded = await Promise.all((data.imageFiles || []).map(uploadMedia));
  const removed = new Set(data.removeImages || []);
  const images = [...(current.images || []).filter((image) => !removed.has(image)), ...uploaded];
  return apiRequest(`/api/items/${id}`, { method: 'PATCH', body: { ...payload(data), images } });
}
export async function deleteItem(id: string): Promise<boolean> { await apiRequest(`/api/items/${id}`, { method: 'DELETE' }); return true; }
export function subscribeToItems(callback: (data: { action: string; record: Item }) => void) {
  return subscribeToApiChanges(() => callback({ action: 'refresh', record: {} as Item }));
}
