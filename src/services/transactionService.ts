import pb from './pocketbaseClient';
import type { DamageReport, Item, StockTransaction, TransactionFormData } from '../types';
import { calculateItemStock } from '../utils/stock';

const COLLECTION = 'inventory_stock_transactions';

export async function getTransactions(filters?: {
  itemId?: string;
  userId?: string;
  transactionType?: string;
  startDate?: string;
  endDate?: string;
}): Promise<StockTransaction[]> {
  const filterParts: string[] = [];

  if (filters?.itemId) filterParts.push(pb.filter('itemId = {:value}', { value: filters.itemId }));
  if (filters?.userId) filterParts.push(pb.filter('userId = {:value}', { value: filters.userId }));
  if (filters?.transactionType) filterParts.push(pb.filter('transactionType = {:value}', { value: filters.transactionType }));
  if (filters?.startDate) filterParts.push(pb.filter('timestamp >= {:value}', { value: filters.startDate }));
  if (filters?.endDate) filterParts.push(pb.filter('timestamp <= {:value}', { value: filters.endDate }));

  return pb.collection(COLLECTION).getFullList<StockTransaction>({
    sort: '-timestamp',
    filter: filterParts.join(' && ') || undefined,
    expand: 'userId,factionOrderId',
  });
}

export async function createTransaction(data: TransactionFormData): Promise<StockTransaction> {
  const actor = pb.authStore.record;
  if (!actor?.id) throw new Error('Authentication required');
  if (data.transactionType === 'repaired' || data.transactionType === 'written_off') {
    throw new Error('Damage resolution transactions are created from damage reports');
  }
  if (!Number.isInteger(data.quantityChanged) || data.quantityChanged < 1) throw new Error('Quantity must be a positive integer');

  const [transactions, damageReports, item] = await Promise.all([
    getTransactions({ itemId: data.itemId }),
    pb.collection('inventory_damage_reports').getFullList<DamageReport>({ filter: pb.filter('itemId = {:id}', { id: data.itemId }) }),
    pb.collection('inventory_items').getOne<Item>(data.itemId),
  ]);
  const stock = calculateItemStock(data.itemId, transactions, damageReports, item.amount ?? 0);
  if (data.transactionType === 'checkout' && data.quantityChanged > stock.remaining) {
    throw new Error(`Only ${stock.remaining} available`);
  }
  if (data.transactionType === 'checkin' && data.quantityChanged > stock.checkedOut) {
    throw new Error(`Only ${stock.checkedOut} currently checked out`);
  }

  let transactionUserId = actor.id;
  if (data.userId && data.userId !== actor.id) {
    const role = String(actor.role || '').trim().toLowerCase();
    const canManage = role === 'admin' || role === 'manager' || role === 'inventory_manager';
    if (!canManage) throw new Error('You cannot return inventory for another user');
    transactionUserId = data.userId;
  }
  const payload: TransactionFormData & { timestamp: string; userId: string } = {
    ...data,
    timestamp: new Date().toISOString(),
    userId: transactionUserId,
  };

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
  let disposed = false;
  let unsubscribe: (() => Promise<void>) | undefined;
  pb.collection(COLLECTION).subscribe<StockTransaction>('*', (e) => {
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
