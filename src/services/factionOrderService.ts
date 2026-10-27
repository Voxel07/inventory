import type { FactionOrder, FactionOrderFormData, FactionOrderStatus, FactionOrderSummary } from '../types';
import { apiPage, apiRequest, ApiError } from './apiClient';
import type { Page } from './apiPagination';
import { assertAuthSession, captureAuthSession } from './authManager';
import { getOfflineCatalog, removeOfflineCatalog, setOfflineCatalog } from './offlineQueue';
import { containsPrivateInventory } from './privateInventoryCache';
import { changeOrderStatus, prepareOrder, reconcileOrder } from './orderCommands';
import type { AssetReturnOutcome, ReturnLineInput, OrderTransitionInput } from '../types/orderCommands';
export type { AssetReturnOutcome, ReturnLineInput } from '../types/orderCommands';

type FactionOrderFilters = { eventType?: string; faction?: string; orderCode?: string; status?: readonly FactionOrderStatus[]; eventId?: string };

/** List rows are summaries: they carry no history, and nothing pretends otherwise. */
export function getFactionOrders(filters: FactionOrderFilters | undefined, page: number, size: number): Promise<Page<FactionOrderSummary>> {
  return apiPage<FactionOrderSummary>('/api/orders/faction', page, size, { query: filters });
}
const orderDetailKey = (id: string) => `faction-orders:detail:${encodeURIComponent(id)}`;

export async function getPreviousFactionOrder(eventType: string, faction: string, before: number, excludeId?: string): Promise<FactionOrder | null> {
  return await apiRequest<FactionOrder | null>('/api/orders/faction/previous', { query: { eventType, faction, before, excludeId } }) ?? null;
}

/** Order detail with an account-scoped IndexedDB fallback for opened orders (offline preparation and returns). */
export async function getFactionOrder(id: string): Promise<FactionOrder> {
  const context = captureAuthSession();
  const key = orderDetailKey(id);
  try {
    const order = await apiRequest<FactionOrder>(`/api/orders/faction/${id}`, { session: context });
    assertAuthSession(context);
    if (containsPrivateInventory(order)) await removeOfflineCatalog(key, context);
    else await setOfflineCatalog(key, order, context);
    assertAuthSession(context);
    return order;
  } catch (error) {
    assertAuthSession(context);
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      await removeOfflineCatalog(key, context);
    } else if (!(error instanceof ApiError) || error.status >= 500) {
      const cached = await getOfflineCatalog<FactionOrder>(key, context);
      assertAuthSession(context);
      if (cached) return cached;
    }
    throw error;
  }
}
export function createFactionOrder(data: FactionOrderFormData): Promise<FactionOrder> {
  const idempotencyKey = crypto.randomUUID();
  const body = { ...data, idempotencyKey };
  return apiRequest('/api/orders/faction', {
    method: 'POST',
    body,
    offline: { type: 'order.create', payload: { kind: 'faction', ...data }, idempotencyKey },
  });
}
export function updateFactionOrder(id: string, data: FactionOrderFormData): Promise<FactionOrder> {
  return apiRequest(`/api/orders/faction/${id}`, { method: 'PATCH', body: data });
}

function transition(id: string, status: FactionOrderStatus, notes?: string, extra?: OrderTransitionInput): Promise<FactionOrder> {
  return changeOrderStatus('faction', id, status, { notes, ...extra });
}

export function submitFactionOrder(id: string) { return transition(id, 'submitted'); }
export function startFactionOrderPreparation(id: string) { return transition(id, 'preparing'); }

/** Built from the loaded order snapshot so it can be queued offline; the server revalidates on replay. */
export async function saveFactionOrderPreparation(
  order: FactionOrder,
  preparedQuantities: Record<string, number>,
  preparedAssemblyQuantities: Record<string, number>,
  assetAssignments: Record<string, string[]>,
  sourceLocations?: Record<string, string>,
): Promise<FactionOrder> {
  const id = order.id;
  const flattened = { ...preparedQuantities };
  for (const assembly of order.expand?.assemblyIds || []) {
    const assemblyCount = preparedAssemblyQuantities[assembly.id] || 0;
    for (const [itemId, componentQuantity] of Object.entries(assembly.itemQuantities || {})) {
      flattened[itemId] = (flattened[itemId] || 0) + componentQuantity * assemblyCount;
    }
  }
  const input = { preparedQuantities: flattened, assetAssignments, sourceLocations, acknowledgeShortages: false, idempotencyKey: crypto.randomUUID() };
  return prepareOrder('faction', id, input);
}

export function markFactionOrderReady(
  id: string,
  note?: string,
  pickupLocation?: string,
  pickupLatitude?: number,
  pickupLongitude?: number,
) {
  const extra: OrderTransitionInput = {};
  if (pickupLocation !== undefined) extra.pickupLocation = pickupLocation || undefined;
  if (pickupLatitude !== undefined) extra.pickupLatitude = pickupLatitude;
  if (pickupLongitude !== undefined) extra.pickupLongitude = pickupLongitude;
  return transition(id, 'ready', note, Object.keys(extra).length ? extra : undefined);
}
export function reopenFactionOrderPreparation(id: string, note?: string) { return transition(id, 'preparing', note); }
export function pickUpFactionOrder(id: string) { return transition(id, 'picked_up'); }
export function returnFactionOrder(id: string): Promise<FactionOrder> {
  const body = { idempotencyKey: crypto.randomUUID() };
  return apiRequest(`/api/orders/faction/${id}/return-all`, { method: 'POST', body });
}
export function returnFactionOrderItems(
  id: string,
  lines: Record<string, ReturnLineInput>,
  assets?: Record<string, AssetReturnOutcome>,
): Promise<FactionOrder> {
  const input = { lines, assets, idempotencyKey: crypto.randomUUID() };
  return reconcileOrder('faction', id, input);
}
export function cancelFactionOrder(id: string) { return transition(id, 'cancelled'); }
export function closeFactionOrder(id: string) { return transition(id, 'closed'); }
