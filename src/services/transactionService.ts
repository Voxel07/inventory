import type { StockTransaction, TransactionFormData } from '../types';
import { apiRequest } from './apiClient';
import { createCreateResourceApi } from './resourceFactory';

export const transactionApi = createCreateResourceApi<StockTransaction, TransactionFormData>(
  '/api/transactions',
  undefined,
  {
    customCreate: (data) => {
      const payload = { ...data, idempotencyKey: crypto.randomUUID() };
      return apiRequest('/api/transactions', {
        method: 'POST',
        body: payload,
        offline: { type: 'transaction', payload: data as unknown as Record<string, unknown> },
      });
    },
  },
);

type Filters = { itemId?: string; userId?: string; transactionType?: string; startDate?: string; endDate?: string };
export const getTransactions = (filters?: Filters): Promise<StockTransaction[]> => transactionApi.getAll(filters);
export const createTransaction = transactionApi.create;
export const updateTransaction = (_id: string, _data: Partial<TransactionFormData>): Promise<StockTransaction> => {
  void _id;
  void _data;
  return Promise.reject(new Error('Stock transactions are immutable audit records'));
};
export async function bulkCheckout(itemIds: string[], reason: string, notes: string, eventType: TransactionFormData['eventType'], faction: string) {
  return Promise.all(itemIds.map((itemId) => createTransaction({ itemId, transactionType: 'checkout', quantityChanged: 1, reason, notes, eventType, faction })));
}
export async function bulkCheckin(itemIds: string[], reason: string, notes: string) {
  return Promise.all(itemIds.map((itemId) => createTransaction({ itemId, transactionType: 'checkin', quantityChanged: 1, reason, notes })));
}
export async function assemblyCheckout(itemQuantities: Record<string, number>, assemblyName: string, reason: string, notes: string, eventType: TransactionFormData['eventType'], faction: string) {
  return Promise.all(Object.entries(itemQuantities).filter(([, quantity]) => quantity > 0).map(([itemId, quantityChanged]) => createTransaction({ itemId, transactionType: 'checkout', quantityChanged, reason: reason || `Assembly checkout: ${assemblyName}`, notes, eventType, faction })));
}
