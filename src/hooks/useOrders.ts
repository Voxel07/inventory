import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GeneralOrderFormData } from '../types';
import { createOrder, getOrders, subscribeToOrders } from '../services/orderService';

export function useOrders() {
  const queryClient = useQueryClient();
  useEffect(() => subscribeToOrders(() => {
    queryClient.invalidateQueries({ queryKey: ['general-orders'] });
  }), [queryClient]);
  return useQuery({ queryKey: ['general-orders'], queryFn: getOrders });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GeneralOrderFormData) => createOrder(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['general-orders'] }),
  });
}
