import type { Item, ItemFormData, AssetInstance, AssetInstanceInput, RuntimeEntry, RuntimeInput } from '../types';
import { apiPage, apiRequest, ApiError } from './apiClient';
import { getOfflineCatalog, setOfflineCatalog } from './offlineQueue';
import { containsPrivateInventory } from './privateInventoryCache';
import { loadAllPages, type Page } from './apiPagination';
import { stageImage } from './stagedImageService';
import { createCrudResourceApi } from './resourceFactory';
import { assertAuthSession, type AuthSessionContext } from './authManager';

async function uploadItemImages(files: File[] = [], context: AuthSessionContext): Promise<string[]> {
  assertAuthSession(context);
  return Promise.all(files.map((file) => stageImage(file, context)));
}

function payload(data: Partial<ItemFormData>) {
  const fields = { ...data };
  delete fields.imageFiles;
  delete fields.imageReplacements;
  delete fields.removeImages;
  return fields;
}

export const itemApi = createCrudResourceApi<Item, ItemFormData>(
  '/api/items',
  'items',
  {
    cacheDetails: true,
    transformPayload: payload,
    customCreate: async (data: ItemFormData, basePath: string, context) => {
      const images = await uploadItemImages(data.imageFiles, context);
      return apiRequest<Item>(basePath, { method: 'POST', body: { ...payload(data), images }, session: context });
    },
    customUpdate: async (id: string, data: Partial<ItemFormData>, basePath: string, context) => {
      const current = await itemApi.getById(id);
      const uploaded = await uploadItemImages(data.imageFiles, context);
      const removed = new Set(data.removeImages || []);
      const images: string[] = [];
      for (const image of current.images || []) {
        if (removed.has(image)) continue;
        const replacement = data.imageReplacements?.[image];
        images.push(replacement ? await stageImage(replacement, context) : image);
      }
      images.push(...uploaded);
      // Stock is never edited through the item; `amount` only seeds stock on creation.
      return apiRequest<Item>(`${basePath}/${id}`, { method: 'PATCH', body: { ...payload(data), amount: undefined, images }, session: context });
    },
  },
);

export const getItem = itemApi.getById;

/** One import row: created without `id`, otherwise updated; `assetCodes` register serialized units. */
export type ItemBatchEntry = { id?: string; item: Partial<ItemFormData>; assetCodes?: string[] };
/** Server maximum per request. */
export const ITEM_BATCH_LIMIT = 100;

/**
 * Bulk create/update in one request and transaction. All or nothing: a rejected entry fails the whole batch
 * with its position in `ApiError.details.index` (see {@link itemBatchErrorIndex}).
 */
export function saveItemBatch(entries: ItemBatchEntry[]): Promise<Item[]> {
  return apiRequest<Item[]>('/api/items/batch', {
    method: 'POST',
    body: { items: entries.map((entry) => ({ ...entry, item: payload(entry.item) })) },
  });
}

export function itemBatchErrorIndex(error: unknown): number | undefined {
  if (!(error instanceof ApiError) || typeof error.details !== 'object' || error.details === null) return undefined;
  const index = (error.details as { index?: unknown }).index;
  return typeof index === 'number' ? index : undefined;
}

const OFFLINE_ITEM_SNAPSHOT = 'items:offline-snapshot';

/** Overview metrics over the caller's visible inventory, computed on the server. */
export type InventorySummary = { items: number; totalUnits: number; lowStockItems: number; transactionsLast7Days: number; openDamageReports: number };
export function getInventorySummary(): Promise<InventorySummary> {
  return apiRequest<InventorySummary>('/api/inventory-summary');
}

export function getItemCategories(): Promise<string[]> {
  return apiRequest<string[]>('/api/item-categories');
}

/**
 * Server item search for pickers. Offline, it searches the explicit catalog snapshot taken by
 * {@link snapshotItemCatalog}; that snapshot (with its download time) is the defined offline completeness.
 */
export async function searchItems(search: string, size: number): Promise<Page<Item>> {
  try {
    return await itemApi.getPage({ search: search || undefined, sort: 'name' }, 0, size);
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) throw error;
    const snapshot = await getOfflineCatalog<Item[]>(OFFLINE_ITEM_SNAPSHOT);
    if (!snapshot) throw error;
    const needle = search.toLocaleLowerCase();
    const rows = snapshot.filter((item) => [item.name, item.sku, item.category].some((value) => value?.toLocaleLowerCase().includes(needle)));
    return { rows: rows.slice(0, size), page: 0, size, more: rows.length > size };
  }
}

/** Explicit exhaustive read that refreshes the offline item snapshot. */
export async function snapshotItemCatalog(context: AuthSessionContext): Promise<void> {
  const items = await itemApi.getAll();
  assertAuthSession(context);
  await setOfflineCatalog(OFFLINE_ITEM_SNAPSHOT, items.filter(item => !containsPrivateInventory(item)), context);
}
export const createItem = itemApi.create;
export const updateItem = itemApi.update;
export const deleteItem = itemApi.delete;
export const deleteItems = itemApi.deleteMany;

export function getItemAssets(itemId: string, page: number, size: number): Promise<Page<AssetInstance>> {
  return apiPage<AssetInstance>(`/api/items/${itemId}/assets`, page, size);
}

/** Explicit exhaustive read of one item's assets (asset pickers, imports). */
export function getAllItemAssets(itemId: string): Promise<AssetInstance[]> {
  return loadAllPages((page, size) => getItemAssets(itemId, page, size), 200);
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

export function logAssetRuntime(itemId: string, assetId: string, input: RuntimeInput): Promise<RuntimeEntry> {
  return apiRequest<RuntimeEntry>(`/api/items/${itemId}/assets/${assetId}/runtime`, { method: 'POST', body: input });
}

export function getAssetRuntime(itemId: string, assetId: string, page: number, size: number): Promise<Page<RuntimeEntry>> {
  return apiPage<RuntimeEntry>(`/api/items/${itemId}/assets/${assetId}/runtime`, page, size);
}

export async function deleteItemAsset(itemId: string, assetId: string): Promise<void> {
  await apiRequest<void>(`/api/items/${itemId}/assets/${assetId}`, {
    method: 'DELETE',
  });
}
