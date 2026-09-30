import { useMutation } from '@tanstack/react-query';
import {
  transactionApi,
  getTransactions,
  assemblyCheckout,
} from '../services/transactionService';
import { createCreateResourceHooks } from './useResourceApi';
import type { StockTransaction, TransactionFormData } from '../types';
import { useProgressiveList } from './useProgressiveList';

const baseHooks = createCreateResourceHooks<StockTransaction, TransactionFormData>(
  transactionApi,
  'transactions',
);

export const useCreateTransaction = baseHooks.useCreate;

export function useTransactions(filters?: { itemId?: string; assetInstanceId?: string; userId?: string; transactionType?: string; startDate?: string; endDate?: string; page?: number; size?: number }) {
  return useProgressiveList<StockTransaction>(
    ['transactions', filters],
    (page, size) => getTransactions({ ...filters, page, size }),
    filters,
  );
}

export function useAssemblyCheckout() {
  return useMutation({
    mutationFn: ({ itemQuantities, assemblyName, reason, notes, eventType, faction, eventOccurrenceId }: { itemQuantities: Record<string, number>; assemblyName: string; reason: string; notes: string; eventType: TransactionFormData['eventType']; faction: string; eventOccurrenceId: string }) =>
      assemblyCheckout(itemQuantities, assemblyName, reason, notes, eventType, faction, eventOccurrenceId),
  });
}
