import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  assemblyCheckout,
} from '../services/transactionService';
import type { TransactionFormData } from '../types';

interface TransactionFilters {
  itemId?: string;
  userId?: string;
  transactionType?: string;
  startDate?: string;
  endDate?: string;
}

export function useTransactions(filters?: TransactionFilters) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => getTransactions(filters),
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TransactionFormData) => createTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TransactionFormData> }) =>
      updateTransaction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useAssemblyCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemQuantities, assemblyName, reason, notes }: {
      itemQuantities: Record<string, number>;
      assemblyName: string;
      reason: string;
      notes: string;
    }) => assemblyCheckout(itemQuantities, assemblyName, reason, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
