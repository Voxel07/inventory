import { apiRequest } from './apiClient';

export type ProcurementDeficit = {
  committedStock?: number;
  requiredDate?: string;
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

export type Vendor = { id: string; name: string; active: boolean; contactPerson?: string; email?: string; phone?: string; address?: string; website?: string; paymentNotes?: string; preferredVendor?: boolean; internalNotes?: string };
export type PurchaseOrderLine = { id: string; itemId: string; itemName: string; orderedQuantity: number; receivedQuantity: number; remainingQuantity: number; unitPriceCents: number };
export type PurchaseOrder = { id: string; orderNumber: string; vendorId: string; vendorName: string; eventOccurrenceId?: string; orderDate: string; expectedDeliveryDate?: string; status: string; createdById: string; createdByName: string; notes?: string; lines: PurchaseOrderLine[] };
export const saveVendor = (data: object, id?: string) => apiRequest<Vendor>(`/api/vendors${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: data });
export const updatePurchaseOrder = (id: string, data: object) => apiRequest<PurchaseOrder>(`/api/purchase-orders/${id}`, { method: 'PUT', body: data });

export const getVendors = (page = 0, size = 100) => apiRequest<Vendor[]>('/api/vendors', { query: { page, size } });
export const getPurchaseOrders = (page = 0, size = 100) => apiRequest<PurchaseOrder[]>('/api/purchase-orders', { query: { page, size } });
export function createVendor(name: string): Promise<Vendor> {
  return apiRequest('/api/vendors', { method: 'POST', body: { name, active: true } });
}
export function createPurchaseOrder(input: {
  vendorId: string; orderDate: string; expectedDeliveryDate?: string; orderNumber?: string;
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
