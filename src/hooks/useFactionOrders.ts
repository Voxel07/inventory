import { useMutation, useQuery } from '@tanstack/react-query';
import {
  cancelFactionOrder,
  createFactionOrder,
  getFactionOrder,
  getFactionOrders,
  markFactionOrderReady,
  pickUpFactionOrder,
  reopenFactionOrderPreparation,
  returnFactionOrderItems,
  saveFactionOrderPreparation,
  startFactionOrderPreparation,
  submitFactionOrder,
  updateFactionOrder,
} from '../services/factionOrderService';
import type { EventType, FactionOrder, FactionOrderFormData, FactionOrderStatus, FactionOrderSummary } from '../types';
import type { AssetReturnOutcome, ReturnLineInput } from '../services/factionOrderService';
import { usePagedList } from './usePagedList';
import { useAuth } from './useAuth';
import { canViewOrganization } from '../utils/access';
import { closeFactionOrder } from '../services/factionOrderService';


export function useFactionOrders(eventType?: EventType, faction?: string, status?: readonly FactionOrderStatus[], eventId?: string) {
  const { user } = useAuth();
  // Tenants have no access to organization orders; skip the request instead of failing.
  return usePagedList<FactionOrderSummary>(
    ['faction-orders', eventType, faction, status, eventId],
    (page, size) => getFactionOrders({ eventType, faction, status, eventId }, page, size),
    { enabled: canViewOrganization(user) },
  );
}

export function useFactionOrder(id: string) {
  return useQuery({
    queryKey: ['faction-orders', 'detail', id],
    queryFn: () => getFactionOrder(id),
    enabled: Boolean(id),
    // The first attempt runs offline so the IndexedDB fallback of an opened order can be reached.
    networkMode: 'offlineFirst',
  });
}

export function useCreateFactionOrder() {
  return useMutation({ mutationFn: (data: FactionOrderFormData) => createFactionOrder(data) });
}

export function useUpdateFactionOrder() {
  return useMutation({ mutationFn: ({ id, data }: { id: string; data: FactionOrderFormData }) => updateFactionOrder(id, data) });
}

export function useStartFactionOrderPreparation() {
  return useMutation({ mutationFn: (id: string) => startFactionOrderPreparation(id) });
}

export function useSubmitFactionOrder() {
  return useMutation({ mutationFn: (id: string) => submitFactionOrder(id) });
}

export function useSaveFactionOrderPreparation() {
  return useMutation({ mutationFn: ({
    order,
    values,
    assemblyValues,
    assetAssignments,
    sourceAllocations,
  }: {
    order: FactionOrder;
    values: Record<string, number>;
    assemblyValues: Record<string, number>;
    assetAssignments: Record<string, string[]>;
    sourceAllocations?: Record<string, Record<string, number>>;
  }) => saveFactionOrderPreparation(order, values, assemblyValues, assetAssignments, sourceAllocations) });
}

export function useMarkFactionOrderReady() {
  return useMutation({ mutationFn: ({
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
  }) => markFactionOrderReady(id, note, pickupLocation, pickupLatitude, pickupLongitude) });
}

export function useReopenFactionOrderPreparation() {
  return useMutation({ mutationFn: ({ id, note }: { id: string; note?: string }) => reopenFactionOrderPreparation(id, note) });
}

export function usePickUpFactionOrder() {
  return useMutation({ mutationFn: (id: string) => pickUpFactionOrder(id) });
}

export function useReturnFactionOrderItems() {
  return useMutation({ mutationFn: ({ id, lines, assets }: {
    id: string;
    lines: Record<string, ReturnLineInput>;
    assets?: Record<string, AssetReturnOutcome>;
  }) => returnFactionOrderItems(id, lines, assets) });
}

export function useCancelFactionOrder() {
  return useMutation({ mutationFn: (id: string) => cancelFactionOrder(id) });
}

export function useCloseFactionOrder() {
  return useMutation({ mutationFn: (id: string) => closeFactionOrder(id) });
}
