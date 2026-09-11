import type { FactionOrder, FactionOrderFormData } from '../types';
import { apiRequest, subscribeToApiChanges } from './apiClient';

/**
 * Orders created by older releases do not necessarily contain every derived
 * quantity collection. Keep that compatibility concern at the API boundary so
 * list and detail components can render historical orders like current ones.
 */
export function normalizeFactionOrder(order: FactionOrder): FactionOrder {
  const requestedQuantities = order.requestedQuantities ?? {};
  const requestedAssemblyQuantities = order.requestedAssemblyQuantities ?? {};

  return {
    ...order,
    itemIds: order.itemIds ?? Object.keys(requestedQuantities),
    requestedQuantities,
    preparedQuantities: order.preparedQuantities ?? {},
    allocatedQuantities: order.allocatedQuantities ?? {},
    reservedQuantities: order.reservedQuantities ?? {},
    assemblyIds: order.assemblyIds ?? Object.keys(requestedAssemblyQuantities),
    requestedAssemblyQuantities,
    preparedAssemblyQuantities: order.preparedAssemblyQuantities ?? {},
    assetAssignments: order.assetAssignments ?? {},
    handedOverQuantities: order.handedOverQuantities ?? {},
    returnedQuantities: order.returnedQuantities ?? {},
    consumedQuantities: order.consumedQuantities ?? {},
    missingQuantities: order.missingQuantities ?? {},
    damagedQuantities: order.damagedQuantities ?? {},
    writtenOffQuantities: order.writtenOffQuantities ?? {},
    history: Array.isArray(order.history) ? order.history : [],
  };
}

function normalizedOrder(request: Promise<FactionOrder>): Promise<FactionOrder> {
  return request.then(normalizeFactionOrder);
}

export async function getFactionOrders(filters?: { eventType?: string; faction?: string }): Promise<FactionOrder[]> {
  const orders = await apiRequest<FactionOrder[]>('/api/orders', { query: filters });
  return orders.map(normalizeFactionOrder);
}
export function getFactionOrder(id: string): Promise<FactionOrder> {
  return normalizedOrder(apiRequest(`/api/orders/${id}`));
}
export function createFactionOrder(data: FactionOrderFormData): Promise<FactionOrder> {
  const idempotencyKey = crypto.randomUUID();
  const body = { ...data, idempotencyKey };
  return normalizedOrder(apiRequest('/api/orders', {
    method: 'POST',
    body,
    offline: { type: 'order.create', payload: data as unknown as Record<string, unknown>, idempotencyKey },
  }));
}
export function updateFactionOrder(id: string, data: FactionOrderFormData): Promise<FactionOrder> {
  return normalizedOrder(apiRequest(`/api/orders/${id}`, { method: 'PATCH', body: data }));
}

function transition(id: string, status: string, notes?: string, extra?: Record<string, unknown>): Promise<FactionOrder> {
  const idempotencyKey = crypto.randomUUID();
  const body = { idempotencyKey, notes, ...extra };
  return normalizedOrder(apiRequest(`/api/orders/${id}/transitions/${status}`, {
    method: 'POST', body,
    offline: { type: 'order.transition', payload: { orderId: id, status, notes, ...extra } },
  }));
}

export function submitFactionOrder(id: string) { return transition(id, 'submitted'); }
export function startFactionOrderPreparation(id: string) { return transition(id, 'preparing'); }

export async function saveFactionOrderPreparation(
  id: string,
  preparedQuantities: Record<string, number>,
  preparedAssemblyQuantities: Record<string, number>,
  assetAssignments: Record<string, string[]>,
): Promise<FactionOrder> {
  const order = await getFactionOrder(id);
  const flattened = { ...preparedQuantities };
  for (const assembly of order.expand?.assemblyIds || []) {
    const assemblyCount = preparedAssemblyQuantities[assembly.id] || 0;
    for (const [itemId, componentQuantity] of Object.entries(assembly.itemQuantities || {})) {
      flattened[itemId] = (flattened[itemId] || 0) + componentQuantity * assemblyCount;
    }
  }
  const input = { preparedQuantities: flattened, assetAssignments, acknowledgeShortages: false, idempotencyKey: crypto.randomUUID() };
  return normalizedOrder(apiRequest(`/api/orders/${id}/prepare`, {
    method: 'POST', body: input,
    offline: { type: 'order.prepare', payload: { orderId: id, input } },
  }));
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
  return normalizedOrder(apiRequest(`/api/orders/${id}/return-all`, { method: 'POST', body }));
}
export function returnFactionOrderItems(id: string, lines: Record<string, { returned: number; consumed: number; missing: number; damaged: number; operatingHours?: number; notes?: string }>): Promise<FactionOrder> {
  const input = { lines, idempotencyKey: crypto.randomUUID() };
  return normalizedOrder(apiRequest(`/api/orders/${id}/return`, {
    method: 'POST', body: input,
    offline: { type: 'order.return', payload: { orderId: id, input } },
  }));
}
export function cancelFactionOrder(id: string) { return transition(id, 'cancelled'); }
export function subscribeToFactionOrders(callback: () => void) { return subscribeToApiChanges(callback); }
