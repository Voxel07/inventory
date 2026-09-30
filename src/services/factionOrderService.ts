import type { FactionOrder, FactionOrderFormData } from '../types';
import { apiRequest } from './apiClient';
import { assertAuthSession, captureAuthSession } from './authManager';

type FactionOrderSummaryResponse = Omit<FactionOrder, 'history'>;

export async function getFactionOrders(filters?: { eventType?: string; faction?: string; orderCode?: string; page?: number; size?: number }): Promise<FactionOrder[]> {
  const orders = await apiRequest<FactionOrderSummaryResponse[]>('/api/orders', { query: filters });
  return orders.map((order) => ({ ...order, history: [] }));
}
export function getFactionOrder(id: string): Promise<FactionOrder> {
  return apiRequest(`/api/orders/${id}`);
}
export function createFactionOrder(data: FactionOrderFormData): Promise<FactionOrder> {
  const idempotencyKey = crypto.randomUUID();
  const body = { ...data, idempotencyKey };
  return apiRequest('/api/orders', {
    method: 'POST',
    body,
    offline: { type: 'order.create', payload: data as unknown as Record<string, unknown>, idempotencyKey },
  });
}
export function updateFactionOrder(id: string, data: FactionOrderFormData): Promise<FactionOrder> {
  return apiRequest(`/api/orders/${id}`, { method: 'PATCH', body: data });
}

function transition(id: string, status: string, notes?: string, extra?: Record<string, unknown>): Promise<FactionOrder> {
  const idempotencyKey = crypto.randomUUID();
  const body = { idempotencyKey, notes, ...extra };
  return apiRequest(`/api/orders/${id}/transitions/${status}`, {
    method: 'POST', body,
    offline: { type: 'order.transition', payload: { orderId: id, status, notes, ...extra } },
  });
}

export function submitFactionOrder(id: string) { return transition(id, 'submitted'); }
export function startFactionOrderPreparation(id: string) { return transition(id, 'preparing'); }

export async function saveFactionOrderPreparation(
  id: string,
  preparedQuantities: Record<string, number>,
  preparedAssemblyQuantities: Record<string, number>,
  assetAssignments: Record<string, string[]>,
  sourceLocations?: Record<string, string>,
): Promise<FactionOrder> {
  const context = captureAuthSession();
  const order = await getFactionOrder(id);
  assertAuthSession(context);
  const flattened = { ...preparedQuantities };
  for (const assembly of order.expand?.assemblyIds || []) {
    const assemblyCount = preparedAssemblyQuantities[assembly.id] || 0;
    for (const [itemId, componentQuantity] of Object.entries(assembly.itemQuantities || {})) {
      flattened[itemId] = (flattened[itemId] || 0) + componentQuantity * assemblyCount;
    }
  }
  const input = { preparedQuantities: flattened, assetAssignments, sourceLocations, acknowledgeShortages: false, idempotencyKey: crypto.randomUUID() };
  return apiRequest(`/api/orders/${id}/prepare`, {
    session: context,
    method: 'POST', body: input,
    offline: { type: 'order.prepare', payload: { orderId: id, input } },
  });
}

export function markFactionOrderReady(
  id: string,
  note?: string,
  pickupLocation?: string,
  pickupLatitude?: number,
  pickupLongitude?: number,
) {
  const extra: Record<string, unknown> = {};
  if (pickupLocation !== undefined) extra.pickupLocation = pickupLocation || null;
  if (pickupLatitude !== undefined) extra.pickupLatitude = pickupLatitude;
  if (pickupLongitude !== undefined) extra.pickupLongitude = pickupLongitude;
  return transition(id, 'ready', note, Object.keys(extra).length ? extra : undefined);
}
export function reopenFactionOrderPreparation(id: string, note?: string) { return transition(id, 'preparing', note); }
export function pickUpFactionOrder(id: string) { return transition(id, 'picked_up'); }
export function returnFactionOrder(id: string): Promise<FactionOrder> {
  const body = { idempotencyKey: crypto.randomUUID() };
  return apiRequest(`/api/orders/${id}/return-all`, { method: 'POST', body });
}
export type AssetReturnOutcome = {
  outcome: 'returned_good' | 'returned_damaged' | 'missing';
  operatingHours?: number;
  notes?: string;
};

export function returnFactionOrderItems(
  id: string,
  lines: Record<string, { returned: number; consumed: number; missing: number; damaged: number; operatingHours?: number; notes?: string }>,
  assets?: Record<string, AssetReturnOutcome>,
): Promise<FactionOrder> {
  const input = { lines, assets, idempotencyKey: crypto.randomUUID() };
  return apiRequest(`/api/orders/${id}/return`, {
    method: 'POST', body: input,
    offline: { type: 'order.return', payload: { orderId: id, input } },
  });
}
export function cancelFactionOrder(id: string) { return transition(id, 'cancelled'); }
export function closeFactionOrder(id: string) { return transition(id, 'closed'); }
