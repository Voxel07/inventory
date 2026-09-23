import type { GeneralOrder, GeneralOrderFormData } from '../types';
import { generalOrderApi, returnOrder, transitionOrder } from '../services/orderService';
import { createMutableResourceHooks } from './useResourceApi';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useProgressiveList } from './useProgressiveList';

export const {
  useCreate: useCreateOrder,
  useUpdate: useUpdateOrder,
} = createMutableResourceHooks<GeneralOrder, GeneralOrderFormData>(generalOrderApi, 'general-orders', ['event-reports', 'items', 'transactions']);

export function useOrders() {
  return useProgressiveList<GeneralOrder>(['general-orders'], (page, size) => generalOrderApi.getAll({ page, size }));
}

export function useTransitionOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, assetAssignments }: { id: string; action: 'submit' | 'ready' | 'pickup' | 'close' | 'cancel'; assetAssignments?: Record<string, string[]> }) => transitionOrder(id, action, assetAssignments),
    onSuccess: () => ['general-orders', 'event-reports', 'items', 'transactions'].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  });
}

export function useReturnOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, returnedQuantities, consumedQuantities }: { id: string; returnedQuantities: Record<string, number>; consumedQuantities: Record<string, number> }) => returnOrder(id, returnedQuantities, consumedQuantities),
    onSuccess: () => ['general-orders', 'event-reports', 'items', 'transactions'].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  });
}
