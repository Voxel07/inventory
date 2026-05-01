import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTransactions,
  createTransaction,
  assemblyCheckout,
  subscribeToTransactions,
} from '../services/transactionService';
import type { TransactionFormData } from '../types';
import { useEffect } from 'react';

interface TransactionFilters {
  itemId?: string;
  userId?: string;
  transactionType?: string;
  startDate?: string;
  endDate?: string;
}

export function useTransactions(filters?: TransactionFilters) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => getTransactions(filters),
  });

  useEffect(() => {
    const unsubscribe = subscribeToTransactions(() => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    });
    return unsubscribe;
  }, [queryClient]);

  return query;
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
