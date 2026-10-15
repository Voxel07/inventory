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
        offline: { type: 'transaction', payload: data },
      });
    },
  },
);

export type TransactionFilters = { itemId?: string; assetInstanceId?: string; userId?: string; transactionType?: string; startDate?: string; endDate?: string; search?: string };
export const getTransactions = (filters: TransactionFilters | undefined, page: number, size: number) => transactionApi.getPage(filters, page, size);
export const createTransaction = transactionApi.create;
export async function assemblyCheckout(itemQuantities: Record<string, number>, assemblyName: string, reason: string, notes: string, eventType: TransactionFormData['eventType'], faction: string, eventOccurrenceId: string) {
  const body = Object.entries(itemQuantities).filter(([, quantity]) => quantity > 0).map(([itemId, quantityChanged]) => ({ itemId, transactionType: 'checkout', quantityChanged, reason: reason || `Assembly checkout: ${assemblyName}`, notes, eventType, faction, eventOccurrenceId, idempotencyKey: crypto.randomUUID() }));
  return apiRequest<StockTransaction[]>('/api/transactions/batch', { method: 'POST', body });
}
