import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  transactionApi,
  getTransactions,
  assemblyCheckout,
} from '../services/transactionService';
import { createCreateResourceHooks } from './useResourceApi';
import type { StockTransaction, TransactionFormData } from '../types';

const baseHooks = createCreateResourceHooks<StockTransaction, TransactionFormData>(
  transactionApi,
  'transactions',
  ['items'],
);

export const useCreateTransaction = baseHooks.useCreate;

export function useTransactions(filters?: { itemId?: string; assetInstanceId?: string; userId?: string; transactionType?: string; startDate?: string; endDate?: string; page?: number; size?: number }) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => getTransactions(filters),
  });
}

export function useAssemblyCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemQuantities, assemblyName, reason, notes, eventType, faction }: { itemQuantities: Record<string, number>; assemblyName: string; reason: string; notes: string; eventType: TransactionFormData['eventType']; faction: string }) =>
      assemblyCheckout(itemQuantities, assemblyName, reason, notes, eventType, faction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
