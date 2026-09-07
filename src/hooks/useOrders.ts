import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GeneralOrderFormData } from '../types';
import { createOrder, getOrders } from '../services/orderService';

export function useOrders() {
  return useQuery({ queryKey: ['general-orders'], queryFn: getOrders });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GeneralOrderFormData) => createOrder(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['general-orders'] }),
  });
}
