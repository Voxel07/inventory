import type { FactionOrder, FactionOrderFormData } from '../types';
import { apiRequest, subscribeToApiChanges } from './apiClient';

export function getFactionOrders(filters?: { eventType?: string; faction?: string }): Promise<FactionOrder[]> {
  return apiRequest('/api/orders', { query: filters });
}
export function getFactionOrder(id: string): Promise<FactionOrder> { return apiRequest(`/api/orders/${id}`); }
export function createFactionOrder(data: FactionOrderFormData): Promise<FactionOrder> { return apiRequest('/api/orders', { method: 'POST', body: data }); }
export function updateFactionOrder(id: string, data: FactionOrderFormData): Promise<FactionOrder> { return apiRequest(`/api/orders/${id}`, { method: 'PATCH', body: data }); }

function transition(id: string, status: string, notes?: string): Promise<FactionOrder> {
  const idempotencyKey = crypto.randomUUID();
  const body = { idempotencyKey, notes };
  return apiRequest(`/api/orders/${id}/transitions/${status}`, {
    method: 'POST', body,
    offline: { type: 'order.transition', payload: { orderId: id, status, notes } },
  });
}

export function submitFactionOrder(id: string) { return transition(id, 'submitted'); }
export function startFactionOrderPreparation(id: string) { return transition(id, 'preparing'); }

export async function saveFactionOrderPreparation(
  id: string,
  preparedQuantities: Record<string, number>,
  preparedAssemblyQuantities: Record<string, number>,
): Promise<FactionOrder> {
  const order = await getFactionOrder(id);
  const flattened = { ...preparedQuantities };
  for (const assembly of order.expand?.assemblyIds || []) {
    const assemblyCount = preparedAssemblyQuantities[assembly.id] || 0;
    for (const [itemId, componentQuantity] of Object.entries(assembly.itemQuantities || {})) {
      flattened[itemId] = (flattened[itemId] || 0) + componentQuantity * assemblyCount;
    }
  }
  const input = { preparedQuantities: flattened, acknowledgeShortages: false, idempotencyKey: crypto.randomUUID() };
  return apiRequest(`/api/orders/${id}/prepare`, {
    method: 'POST', body: input,
    offline: { type: 'order.prepare', payload: { orderId: id, input } },
  });
}

export function markFactionOrderReady(id: string, note?: string) { return transition(id, 'ready', note); }
export function reopenFactionOrderPreparation(id: string, note?: string) { return transition(id, 'preparing', note); }
export function pickUpFactionOrder(id: string) { return transition(id, 'picked_up'); }
export function returnFactionOrder(id: string): Promise<FactionOrder> {
  const body = { idempotencyKey: crypto.randomUUID() };
  return apiRequest(`/api/orders/${id}/return-all`, { method: 'POST', body });
}
export function returnFactionOrderItems(id: string, lines: Record<string, { returned: number; missing: number; damaged: number; operatingHours?: number; notes?: string }>): Promise<FactionOrder> {
  const input = { lines, idempotencyKey: crypto.randomUUID() };
  return apiRequest(`/api/orders/${id}/return`, {
    method: 'POST', body: input,
    offline: { type: 'order.return', payload: { orderId: id, input } },
  });
}
export function cancelFactionOrder(id: string) { return transition(id, 'cancelled'); }
export function subscribeToFactionOrders(callback: () => void) { return subscribeToApiChanges(callback); }
