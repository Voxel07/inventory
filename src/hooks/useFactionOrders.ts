import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelFactionOrder,
  createFactionOrder,
  getFactionOrder,
  getFactionOrders,
  markFactionOrderReady,
  pickUpFactionOrder,
  reopenFactionOrderPreparation,
  returnFactionOrder,
  returnFactionOrderItems,
  saveFactionOrderPreparation,
  startFactionOrderPreparation,
  submitFactionOrder,
  updateFactionOrder,
} from '../services/factionOrderService';
import type { EventType, FactionOrderFormData } from '../types';

export function useFactionOrders(eventType?: EventType, faction?: string) {
  return useQuery({
    queryKey: ['faction-orders', eventType, faction],
    queryFn: () => getFactionOrders({ eventType, faction }),
  });
}

export function useFactionOrder(id: string) {
  return useQuery({
    queryKey: ['faction-orders', 'detail', id],
    queryFn: () => getFactionOrder(id),
    enabled: Boolean(id),
  });
}

function useOrderMutation<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faction-orders'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-deficits'] });
    },
  });
}

export function useCreateFactionOrder() {
  return useOrderMutation((data: FactionOrderFormData) => createFactionOrder(data));
}

export function useUpdateFactionOrder() {
  return useOrderMutation(({ id, data }: { id: string; data: FactionOrderFormData }) => updateFactionOrder(id, data));
}

export function useStartFactionOrderPreparation() {
  return useOrderMutation((id: string) => startFactionOrderPreparation(id));
}

export function useSubmitFactionOrder() {
  return useOrderMutation((id: string) => submitFactionOrder(id));
}

export function useSaveFactionOrderPreparation() {
  return useOrderMutation(({
    id,
    values,
    assemblyValues,
  }: {
    id: string;
    values: Record<string, number>;
    assemblyValues: Record<string, number>;
  }) => saveFactionOrderPreparation(id, values, assemblyValues));
}

export function useMarkFactionOrderReady() {
  return useOrderMutation(({
    id,
    note,
    pickupLocation,
    pickupLatitude,
    pickupLongitude,
  }: {
    id: string;
    note?: string;
    pickupLocation?: string;
    pickupLatitude?: number;
    pickupLongitude?: number;
  }) => markFactionOrderReady(id, note, pickupLocation, pickupLatitude, pickupLongitude));
}

export function useReopenFactionOrderPreparation() {
  return useOrderMutation(({ id, note }: { id: string; note?: string }) => reopenFactionOrderPreparation(id, note));
}

export function usePickUpFactionOrder() {
  return useOrderMutation((id: string) => pickUpFactionOrder(id));
}

export function useReturnFactionOrder() {
  return useOrderMutation((id: string) => returnFactionOrder(id));
}

export function useReturnFactionOrderItems() {
  return useOrderMutation(({ id, lines }: { id: string; lines: Record<string, { returned: number; missing: number; damaged: number; operatingHours?: number; notes?: string }> }) => returnFactionOrderItems(id, lines));
}

export function useCancelFactionOrder() {
  return useOrderMutation((id: string) => cancelFactionOrder(id));
}
