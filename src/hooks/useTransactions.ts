import { useMutation } from '@tanstack/react-query';
import {
  transactionApi,
  getTransactions,
  assemblyCheckout,
  type TransactionFilters,
} from '../services/transactionService';
import { createCreateResourceHooks } from './useResourceApi';
import type { StockTransaction, TransactionFormData } from '../types';
import { usePagedList } from './usePagedList';

const baseHooks = createCreateResourceHooks<StockTransaction, TransactionFormData>(
  transactionApi,
  'transactions',
);

export const useCreateTransaction = baseHooks.useCreate;

export function useTransactions(filters?: TransactionFilters, size?: number) {
  return usePagedList<StockTransaction>(['transactions', filters], (page, pageSize) => getTransactions(filters, page, pageSize), { size });
}

export function useAssemblyCheckout() {
  return useMutation({
    mutationFn: ({ itemQuantities, assemblyName, reason, notes, eventType, faction, eventOccurrenceId }: { itemQuantities: Record<string, number>; assemblyName: string; reason: string; notes: string; eventType: TransactionFormData['eventType']; faction: string; eventOccurrenceId: string }) =>
      assemblyCheckout(itemQuantities, assemblyName, reason, notes, eventType, faction, eventOccurrenceId),
  });
}
