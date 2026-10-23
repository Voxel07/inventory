import type { StockTransaction, TransactionFormData } from '../types';
import { apiRequest } from './apiClient';
import { createCreateResourceApi } from './resourceFactory';
import { calendarDayInstant } from '../utils/dateFormat';

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

export type TransactionFilters = { itemId?: string; assetInstanceId?: string; userId?: string; eventOccurrenceId?: string; transactionType?: string; startDate?: number | ''; endDate?: number | ''; search?: string };
export const getTransactions = (filters: TransactionFilters | undefined, page: number, size: number) => transactionApi.getPage({
  ...filters,
  startDate: calendarDayInstant(filters?.startDate === '' ? undefined : filters?.startDate),
  // The API uses an exclusive end bound so even sub-millisecond movements on the last day are included.
  endDate: calendarDayInstant(filters?.endDate === '' ? undefined : filters?.endDate, true),
}, page, size);
export const createTransaction = transactionApi.create;
export async function assemblyCheckout(itemQuantities: Record<string, number>, assemblyName: string, reason: string, notes: string, eventType: TransactionFormData['eventType'], faction: string, eventOccurrenceId: string) {
  const body = Object.entries(itemQuantities).filter(([, quantity]) => quantity > 0).map(([itemId, quantityChanged]) => ({ itemId, transactionType: 'checkout', quantityChanged, reason: reason || `Assembly checkout: ${assemblyName}`, notes, eventType, faction, eventOccurrenceId, idempotencyKey: crypto.randomUUID() }));
  return apiRequest<StockTransaction[]>('/api/transactions/batch', { method: 'POST', body });
}

/** A direct consumable checkout that can still take restocked units (quantities in the item's steps). */
export interface RestockableCheckout { checkoutId: string; occurredAt: number; person?: string; event?: string; faction?: string; issued: number; restocked: number }
export const getRestockableCheckouts = (itemId: string) =>
  apiRequest<RestockableCheckout[]>('/api/transactions/restockable', { query: { itemId } });
/** Unused consumables of one direct checkout back to stock; the command key makes a resend harmless. */
export const restockCheckout = (checkoutId: string, data: { quantity: number; idempotencyKey: string; locationId?: string; notes?: string }) =>
  apiRequest<StockTransaction>(`/api/transactions/${checkoutId}/restock`, { method: 'POST', body: data });
