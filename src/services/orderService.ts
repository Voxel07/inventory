import type { GeneralOrder, GeneralOrderSummary, GeneralOrderFormData } from '../types';
import { createMutableResourceApi } from './resourceFactory';
import { apiPage, apiRequest } from './apiClient';
import { loadAllPages, type Page } from './apiPagination';
import type { GeneralOrderCommands } from '../types/order';

const mutations = createMutableResourceApi<GeneralOrder, GeneralOrderFormData>('/api/general-orders');
const getPage = (query: { status?: readonly string[]; eventId?: string; eventType?: string; search?: string } | undefined, page: number, size = 100): Promise<Page<GeneralOrderSummary>> =>
  apiPage<GeneralOrderSummary>('/api/general-orders', page, size, { query });
export const generalOrderApi = {
  ...mutations,
  getPage,
  getAll: (query?: { status?: readonly string[] }) => loadAllPages((page, size) => getPage(query, page, size)),
};
export const getOrders = generalOrderApi.getPage;
export const createOrder = generalOrderApi.create;
export const updateOrder = generalOrderApi.update;
export function transitionOrder(id: string, action: 'submit' | 'ready' | 'pickup' | 'close' | 'cancel', assetAssignments?: Record<string, string[]>) {
  return apiRequest<GeneralOrder>(`/api/general-orders/${id}/${action}`, { method: 'POST', body: { assetAssignments } });
}
export function returnOrder(id: string, returnedQuantities: Record<string, number>, consumedQuantities: Record<string, number>) {
  return apiRequest<GeneralOrder>(`/api/general-orders/${id}/return`, { method: 'POST', body: { returnedQuantities, consumedQuantities } });
}

export const generalOrderCommand = <A extends keyof GeneralOrderCommands>(id: string, action: A, data: GeneralOrderCommands[A]) => apiRequest<GeneralOrder>(`/api/general-orders/${id}/${action}`, { method: 'POST', body: data });
