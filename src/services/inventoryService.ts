import type { Item, ItemFormData } from '../types';
import { apiRequest, uploadMedia } from './apiClient';
import { prepareItemImage } from '../utils/prepareItemImage';
import { createCrudResourceApi } from './resourceFactory';

async function uploadItemImages(files: File[] = []): Promise<string[]> {
  const images: string[] = [];
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
        images.push(replacement ? await uploadMedia(await prepareItemImage(replacement)) : image);
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
