import type { GeneralOrder, GeneralOrderSummary, GeneralOrderFormData } from '../types';
import { createMutableResourceApi } from './resourceFactory';
import { apiRequest } from './apiClient';
import type { GeneralOrderCommands } from '../types/order';

const mutations = createMutableResourceApi<GeneralOrder, GeneralOrderFormData>('/api/general-orders');
export const generalOrderApi = {
  ...mutations,
  getAll: (query?: Record<string, string | number | boolean | undefined>) => apiRequest<GeneralOrderSummary[]>('/api/general-orders', { query }),
};
export const getOrders = generalOrderApi.getAll;
export const createOrder = generalOrderApi.create;
export const updateOrder = generalOrderApi.update;
export function transitionOrder(id: string, action: 'submit' | 'ready' | 'pickup' | 'close' | 'cancel', assetAssignments?: Record<string, string[]>) {
  return apiRequest<GeneralOrder>(`/api/general-orders/${id}/${action}`, { method: 'POST', body: { assetAssignments } });
}
export function returnOrder(id: string, returnedQuantities: Record<string, number>, consumedQuantities: Record<string, number>) {
  return apiRequest<GeneralOrder>(`/api/general-orders/${id}/return`, { method: 'POST', body: { returnedQuantities, consumedQuantities } });
}

export const generalOrderCommand = <A extends keyof GeneralOrderCommands>(id: string, action: A, data: GeneralOrderCommands[A]) => apiRequest<GeneralOrder>(`/api/general-orders/${id}/${action}`, { method: 'POST', body: data });
