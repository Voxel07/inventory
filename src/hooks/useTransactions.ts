import {
  transactionApi,
  getTransactions,
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
