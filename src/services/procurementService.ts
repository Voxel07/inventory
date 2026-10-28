import { apiPage, apiRequest } from './apiClient';
import type { OrderItemRequest } from '../types';

export type ProcurementDeficit = {
  committedStock?: number;
  requiredDate?: number;
  lateOrderedStock?: number;
  safetyStock?: number;
  overrideReason?: string;
  overrideActor?: string;
  itemId: string;
  sku: string;
  name: string;
  category: string;
  supplier: string;
  classification: 'consumable' | 'asset';
  demand: number;
  onHandStock: number;
  inTransitStock: number;
  totalOwnedStock: number;
  availableStock: number;
  reservedStock: number;
  projectedStock: number;
  netDeficit: number;
  orderedStock: number;
  recommendedAction: 'purchase' | 'rent_or_purchase' | 'obtain_commitment';
};

/** Opening lines of a new purchase draft, e.g. procurement shortages or an order request. */
export type PurchaseDraftLine = { itemId: string; orderedQuantity: number };
/** Still to order for a shortage: at least one unit. */
export const shortageLine = (row: ProcurementDeficit): PurchaseDraftLine => ({ itemId: row.itemId, orderedQuantity: Math.max(1, row.netDeficit - row.orderedStock) });

export type Vendor = { id: string; name: string; active: boolean; contactPerson?: string; email?: string; phone?: string; address?: string; website?: string; paymentNotes?: string; preferredVendor?: boolean; internalNotes?: string };
type PurchaseOrderLine = { id: string; itemId: string; itemName: string; orderedQuantity: number; receivedQuantity: number; remainingQuantity: number; unitPriceCents: number };
export type PurchaseOrder = { id: string; orderNumber: string; vendorId: string; vendorName: string; eventOccurrenceId?: string; orderDate: number; expectedDeliveryDate?: number; status: string; createdById: string; createdByName: string; notes?: string; lines: PurchaseOrderLine[] };
export const saveVendor = (data: object, id?: string) => apiRequest<Vendor>(`/api/vendors${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: data });
export const updatePurchaseOrder = (id: string, data: object) => apiRequest<PurchaseOrder>(`/api/purchase-orders/${id}`, { method: 'PUT', body: data });

export const getVendors = (page: number, size: number) => apiPage<Vendor>('/api/vendors', page, size);
export const getPurchaseOrders = (page: number, size: number) => apiPage<PurchaseOrder>('/api/purchase-orders', page, size);
export function createVendor(name: string): Promise<Vendor> {
  return apiRequest('/api/vendors', { method: 'POST', body: { name, active: true } });
}
export function createPurchaseOrder(input: {
  vendorId: string; orderDate: number; expectedDeliveryDate?: number; orderNumber?: string;
  eventOccurrenceId?: string; notes?: string; lines: { itemId: string; orderedQuantity: number; unitPriceCents: number }[];
}): Promise<PurchaseOrder> {
  return apiRequest('/api/purchase-orders', { method: 'POST', body: input });
}
export function transitionPurchaseOrder(id: string, status: 'ordered' | 'cancelled'): Promise<PurchaseOrder> {
  return apiRequest(`/api/purchase-orders/${id}/transitions`, { method: 'POST', body: { status } });
}

export function getProcurementDeficits(eventOccurrenceId?: string): Promise<ProcurementDeficit[]> {
  return apiRequest('/api/procurement/deficits', { query: { eventOccurrenceId } });
}

export const overrideForecast = (data: object) => apiRequest<void>('/api/procurement/overrides', { method: 'POST', body: data });

/** One request for something the inventory does not hold, with the order it came from. */
export type ItemRequestQueueEntry = {
  request: OrderItemRequest; orderId: string; orderKind: 'faction' | 'general'; orderLabel: string; orderStatus: string;
  faction?: string; eventOccurrenceId?: string; eventName?: string; eventDate?: number; requestedBy: string;
};
export const getItemRequestQueue = (eventOccurrenceId?: string, includeResolved = false) =>
  apiRequest<ItemRequestQueueEntry[]>('/api/procurement/item-requests', { query: { eventOccurrenceId, includeResolved } });
export const assignRequestItem = (id: string, itemId: string) =>
  apiRequest<ItemRequestQueueEntry>(`/api/procurement/item-requests/${id}/item`, { method: 'POST', body: { itemId } });
export const declineItemRequest = (id: string, reason: string) =>
  apiRequest<ItemRequestQueueEntry>(`/api/procurement/item-requests/${id}/decline`, { method: 'POST', body: { reason } });
