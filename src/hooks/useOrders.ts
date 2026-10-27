import type { GeneralOrderSummary, GeneralOrderFormData } from '../types';
import { createOrder, generalOrderApi, transitionOrder } from '../services/orderService';
import { useMutation } from '@tanstack/react-query';
import { usePagedList } from './usePagedList';

export function useCreateOrder() {
  return useMutation({ mutationFn: (data: GeneralOrderFormData) => createOrder(data) });
}

export function useUpdateOrder() {
  return useMutation({ mutationFn: ({ id, data }: { id: string; data: Partial<GeneralOrderFormData> }) => generalOrderApi.update(id, data) });
}

type GeneralOrderQuery = { status?: readonly GeneralOrderSummary['status'][]; eventId?: string; eventType?: string; search?: string };

/** Every filter runs on the server, so a screen never pages through orders it does not show. */
export function useOrders(query: GeneralOrderQuery = {}) {
  return usePagedList<GeneralOrderSummary>(['general-orders', query], (page, size) => generalOrderApi.getPage(query, page, size));
}

export function useTransitionOrder() {
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'submit' | 'ready' | 'pickup' | 'close' | 'cancel' }) => transitionOrder(id, action),
  });
}
