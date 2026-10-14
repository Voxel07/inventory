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
import type { EventType, FactionOrder, FactionOrderFormData } from '../types';
import type { AssetReturnOutcome, ReturnLineInput } from '../services/factionOrderService';
import { useProgressiveList } from './useProgressiveList';
import { useAuth } from './useAuth';
import { canViewOrganization } from '../utils/access';


export function useFactionOrders(eventType?: EventType, faction?: string) {
  const { user } = useAuth();
  // Tenants have no access to organization orders; skip the request instead of failing.
  return useProgressiveList<FactionOrder>(
    ['faction-orders', eventType, faction],
    (page, size) => getFactionOrders({ eventType, faction, page, size }),
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

function useOrderMutation<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  return useMutation({
    mutationFn,
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
    order,
    values,
    assemblyValues,
    assetAssignments,
    sourceLocations,
  }: {
    order: FactionOrder;
    values: Record<string, number>;
    assemblyValues: Record<string, number>;
    assetAssignments: Record<string, string[]>;
    sourceLocations?: Record<string, string>;
  }) => saveFactionOrderPreparation(order, values, assemblyValues, assetAssignments, sourceLocations));
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

export function useReturnFactionOrderItems() {
  return useOrderMutation(({ id, lines, assets }: {
    id: string;
    lines: Record<string, ReturnLineInput>;
    assets?: Record<string, AssetReturnOutcome>;
  }) => returnFactionOrderItems(id, lines, assets));
}

export function useCancelFactionOrder() {
  return useOrderMutation((id: string) => cancelFactionOrder(id));
}
