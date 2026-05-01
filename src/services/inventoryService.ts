import pb from './pocketbaseClient';
import type { Item, ItemFormData } from '../types';
import { generateQRCodeDataURL } from './qrCodeService';
import { createTransaction } from './transactionService';

const COLLECTION = 'inventory_items';

export async function getItems(): Promise<Item[]> {
  return pb.collection(COLLECTION).getFullList<Item>({ sort: '-created' });
}

export async function getItem(id: string): Promise<Item> {
  return pb.collection(COLLECTION).getOne<Item>(id);
}

export async function createItem(data: ItemFormData): Promise<Item> {
  const item = await pb.collection(COLLECTION).create<Item>({
    ...data,
    minStock: data.minStock,
    status: 'available',
    qrCode: '',
  });

  let updated = item;
  try {
    const qrCode = await generateQRCodeDataURL(item.id);
    updated = await pb.collection(COLLECTION).update<Item>(item.id, { qrCode });
  } catch (e) {
    console.error('Failed to generate QR code:', e);
  }

  try {
    await createTransaction({
      itemId: updated.id,
      transactionType: 'added',
      quantityChanged: data.amount,
      reason: 'Initial stock',
      notes: '',
    });
  } catch (e) {
    console.error('Failed to create initial transaction:', e);
  }

  return updated;
}

export async function updateItem(id: string, data: Partial<ItemFormData>): Promise<Item> {
  return pb.collection(COLLECTION).update<Item>(id, data);
}

export async function deleteItem(id: string): Promise<boolean> {
  return pb.collection(COLLECTION).delete(id);
}

export function subscribeToItems(callback: (data: { action: string; record: Item }) => void) {
  pb.collection(COLLECTION).subscribe<Item>('*', (e) => {
    callback({ action: e.action, record: e.record });
  });
  return () => {
    pb.collection(COLLECTION).unsubscribe('*');
  };
}
