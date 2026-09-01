import pb from './pocketbaseClient';
import type { Item, ItemFormData } from '../types';
import { createTransaction } from './transactionService';

const COLLECTION = 'inventory_items';

export async function getItems(): Promise<Item[]> {
  return pb.collection(COLLECTION).getFullList<Item>({
    sort: '-created',
    expand: 'storageLocation',
  });
}

export async function getItem(id: string): Promise<Item> {
  return pb.collection(COLLECTION).getOne<Item>(id, {
    expand: 'storageLocation',
  });
}

export async function createItem(data: ItemFormData): Promise<Item> {
  const { amount, imageFiles = [], removeImages: _removeImages, ...rest } = data;
  if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
    throw new Error('Amount must be zero or a positive number');
  }
  const item = await pb.collection(COLLECTION).create<Item>({
    ...rest,
    images: imageFiles,
    amount: amount ?? 0,
    minStock: Number(data.minStock),
    value: Number(data.value),
    status: 'available',
  });

  if (amount !== undefined && amount > 0) {
    try {
      await createTransaction({
        itemId: item.id,
        transactionType: 'added',
        quantityChanged: amount,
        reason: 'Initial stock',
        notes: '',
      });
    } catch (e) {
      console.error('Failed to create initial transaction:', e);
    }
  }

  return item;
}

export async function updateItem(id: string, data: Partial<ItemFormData>): Promise<Item> {
  const { imageFiles = [], removeImages = [], ...rest } = data;
  delete rest.amount;
  return pb.collection(COLLECTION).update<Item>(id, {
    ...rest,
    ...(imageFiles.length ? { 'images+': imageFiles } : {}),
    ...(removeImages.length ? { 'images-': removeImages } : {}),
  });
}

export async function deleteItem(id: string): Promise<boolean> {
  return pb.collection(COLLECTION).delete(id);
}

export function subscribeToItems(callback: (data: { action: string; record: Item }) => void) {
  let disposed = false;
  let unsubscribe: (() => Promise<void>) | undefined;
  pb.collection(COLLECTION).subscribe<Item>('*', (e) => {
    callback({ action: e.action, record: e.record });
  }).then((cleanup) => {
    if (disposed) void cleanup().catch((err) => console.warn(`Failed to clean up ${COLLECTION} subscription:`, err));
    else unsubscribe = cleanup;
  }).catch((err) => {
    console.warn(`Failed to subscribe to ${COLLECTION} realtime updates:`, err);
  });
  return () => {
    disposed = true;
    void unsubscribe?.().catch((err) => console.warn(`Failed to clean up ${COLLECTION} subscription:`, err));
  };
}
