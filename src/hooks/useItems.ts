import { createResourceHooks } from './useResourceApi';
import { itemApi } from '../services/inventoryService';
import type { Item, ItemFormData } from '../types';

export const {
  useList: useItems,
  useDetail: useItem,
  useCreate: useCreateItem,
  useUpdate: useUpdateItem,
  useDelete: useDeleteItem,
  useDeleteMany: useDeleteItems,
} = createResourceHooks<Item, ItemFormData>(itemApi, 'items', ['transactions']);
