import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  transactionApi,
  getTransactions,
  updateTransaction,
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

export function useTransactions(filters?: { itemId?: string; userId?: string; transactionType?: string; startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => getTransactions(filters),
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TransactionFormData> }) => updateTransaction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useAssemblyCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemQuantities, assemblyName, reason, notes }: { itemQuantities: Record<string, number>; assemblyName: string; reason: string; notes: string }) =>
      assemblyCheckout(itemQuantities, assemblyName, reason, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
