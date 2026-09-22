import type { GeneralOrder, GeneralOrderFormData } from '../types';
import { createMutableResourceApi } from './resourceFactory';
import { apiRequest } from './apiClient';

export const generalOrderApi = createMutableResourceApi<GeneralOrder, GeneralOrderFormData>('/api/general-orders');
export const getOrders = generalOrderApi.getAll;
export const createOrder = generalOrderApi.create;
export const updateOrder = generalOrderApi.update;
export function transitionOrder(id: string, action: 'submit' | 'ready' | 'pickup' | 'close' | 'cancel', assetAssignments?: Record<string, string[]>) {
  return apiRequest<GeneralOrder>(`/api/general-orders/${id}/${action}`, { method: 'POST', body: { assetAssignments } });
}
export function returnOrder(id: string, returnedQuantities: Record<string, number>, consumedQuantities: Record<string, number>) {
  return apiRequest<GeneralOrder>(`/api/general-orders/${id}/return`, { method: 'POST', body: { returnedQuantities, consumedQuantities } });
}
