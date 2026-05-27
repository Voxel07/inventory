import pb from './pocketbaseClient';
import type { StockTransaction, TransactionFormData } from '../types';

const COLLECTION = 'inventory_stock_transactions';

export async function getTransactions(filters?: {
  itemId?: string;
  userId?: string;
  transactionType?: string;
  startDate?: string;
  endDate?: string;
}): Promise<StockTransaction[]> {
  const filterParts: string[] = [];

  if (filters?.itemId) filterParts.push(`itemId = "${filters.itemId}"`);
  if (filters?.userId) filterParts.push(`userId = "${filters.userId}"`);
  if (filters?.transactionType) filterParts.push(`transactionType = "${filters.transactionType}"`);
  if (filters?.startDate) filterParts.push(`timestamp >= "${filters.startDate}"`);
  if (filters?.endDate) filterParts.push(`timestamp <= "${filters.endDate}"`);

  return pb.collection(COLLECTION).getFullList<StockTransaction>({
    sort: '-timestamp',
    filter: filterParts.join(' && ') || undefined,
    expand: 'userId',
  });
}

export async function createTransaction(data: TransactionFormData): Promise<StockTransaction> {
  let userId = pb.authStore.record?.id;
  if (!userId) {
    try {
      const users = await pb.collection('users').getList(1, 1);
      if (users.items.length > 0) {
        userId = users.items[0].id;
      }
    } catch (err) {
      console.warn('Could not fetch fallback user:', err);
    }
  }

  const payload: any = {
    ...data,
    timestamp: new Date().toISOString(),
  };
  if (userId) {
    payload.userId = userId;
  }

  return pb.collection(COLLECTION).create<StockTransaction>(payload);
}

export async function updateTransaction(
  id: string,
  data: Partial<TransactionFormData>,
): Promise<StockTransaction> {
  return pb.collection(COLLECTION).update<StockTransaction>(id, data);
}

export async function bulkCheckout(
  itemIds: string[],
  reason: string,
  notes: string,
): Promise<StockTransaction[]> {
  const results: StockTransaction[] = [];
  for (const itemId of itemIds) {
    const tx = await createTransaction({
      itemId,
      transactionType: 'checkout',
      quantityChanged: 1,
      reason,
      notes,
    });
    results.push(tx);
  }
  return results;
}

export async function bulkCheckin(
  itemIds: string[],
  reason: string,
  notes: string,
): Promise<StockTransaction[]> {
  const results: StockTransaction[] = [];
  for (const itemId of itemIds) {
    const tx = await createTransaction({
      itemId,
      transactionType: 'checkin',
      quantityChanged: 1,
      reason,
      notes,
    });
    results.push(tx);
  }
  return results;
}

export async function assemblyCheckout(
  itemQuantities: Record<string, number>,
  assemblyName: string,
  reason: string,
  notes: string,
): Promise<StockTransaction[]> {
  const results: StockTransaction[] = [];
  for (const [itemId, quantity] of Object.entries(itemQuantities)) {
    if (quantity <= 0) continue;
    const tx = await createTransaction({
      itemId,
      transactionType: 'checkout',
      quantityChanged: quantity,
      reason: reason || `Assembly checkout: ${assemblyName}`,
      notes,
    });
    results.push(tx);
  }
  return results;
}

export function subscribeToTransactions(
  callback: (data: { action: string; record: StockTransaction }) => void,
) {
  pb.collection(COLLECTION).subscribe<StockTransaction>('*', (e) => {
    callback({ action: e.action, record: e.record });
  }).catch((err) => {
    console.warn(`Failed to subscribe to ${COLLECTION} realtime updates:`, err);
  });
  return () => {
    pb.collection(COLLECTION).unsubscribe('*');
  };
}
