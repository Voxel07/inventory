import { apiRequest } from './apiClient';

export type ProcurementDeficit = {
  itemId: string;
  sku: string;
  name: string;
  category: string;
  supplier: string;
  classification: 'consumable' | 'asset';
  demand: number;
  onHandStock: number;
  totalOwnedStock: number;
  availableStock: number;
  reservedStock: number;
  projectedStock: number;
  netDeficit: number;
  orderedStock: number;
  recommendedAction: 'purchase' | 'rent_or_purchase';
};

export type Vendor = { id: string; name: string; active: boolean };
export type PurchaseOrderLine = { id: string; itemId: string; itemName: string; orderedQuantity: number; receivedQuantity: number; remainingQuantity: number; unitPriceCents: number };
export type PurchaseOrder = { id: string; orderNumber: string; vendorName: string; orderDate: string; expectedDeliveryDate?: string; status: string; createdById: string; createdByName: string; notes?: string; lines: PurchaseOrderLine[] };

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
