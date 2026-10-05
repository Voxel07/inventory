import type { GeneralOrderSummary, GeneralOrderFormData } from '../types';
import { generalOrderApi, transitionOrder } from '../services/orderService';
import { createMutableResourceHooks } from './useResourceApi';
import { useMutation } from '@tanstack/react-query';
import { useProgressiveList } from './useProgressiveList';

export const {
  useCreate: useCreateOrder,
  useUpdate: useUpdateOrder,
} = createMutableResourceHooks<GeneralOrderSummary, GeneralOrderFormData>(generalOrderApi, 'general-orders');

export function useOrders() {
  return useProgressiveList<GeneralOrderSummary>(['general-orders'], (page, size) => generalOrderApi.getAll({ page, size }));
}

export function useTransitionOrder() {
  return useMutation({
    mutationFn: ({ id, action, assetAssignments }: { id: string; action: 'submit' | 'ready' | 'pickup' | 'close' | 'cancel'; assetAssignments?: Record<string, string[]> }) => transitionOrder(id, action, assetAssignments),
  });
}

