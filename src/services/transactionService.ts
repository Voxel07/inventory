import type { StockTransaction, TransactionFormData } from '../types';
import { apiRequest, subscribeToApiChanges } from './apiClient';

type Filters = { itemId?: string; userId?: string; transactionType?: string; startDate?: string; endDate?: string };
export function getTransactions(filters?: Filters): Promise<StockTransaction[]> { return apiRequest('/api/transactions', { query: filters }); }
export function createTransaction(data: TransactionFormData): Promise<StockTransaction> {
  const payload = { ...data, idempotencyKey: crypto.randomUUID() };
  return apiRequest('/api/transactions', { method: 'POST', body: payload, offline: { type: 'transaction', payload: data as unknown as Record<string, unknown> } });
}
export function updateTransaction(id: string, data: Partial<TransactionFormData>): Promise<StockTransaction> { void id; void data; return Promise.reject(new Error('Stock transactions are immutable audit records')); }
export async function bulkCheckout(itemIds: string[], reason: string, notes: string) { return Promise.all(itemIds.map((itemId) => createTransaction({ itemId, transactionType: 'checkout', quantityChanged: 1, reason, notes }))); }
export async function bulkCheckin(itemIds: string[], reason: string, notes: string) { return Promise.all(itemIds.map((itemId) => createTransaction({ itemId, transactionType: 'checkin', quantityChanged: 1, reason, notes }))); }
export async function assemblyCheckout(itemQuantities: Record<string, number>, assemblyName: string, reason: string, notes: string) {
  return Promise.all(Object.entries(itemQuantities).filter(([, quantity]) => quantity > 0).map(([itemId, quantityChanged]) => createTransaction({ itemId, transactionType: 'checkout', quantityChanged, reason: reason || `Assembly checkout: ${assemblyName}`, notes })));
}
export function subscribeToTransactions(callback: (data: { action: string; record: StockTransaction }) => void) {
  return subscribeToApiChanges(() => callback({ action: 'refresh', record: {} as StockTransaction }));
}
