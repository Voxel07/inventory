import type { GeneralOrder, GeneralOrderFormData } from '../types';
import { apiRequest, subscribeToApiChanges } from './apiClient';

export function getOrders(): Promise<GeneralOrder[]> {
  return apiRequest('/api/general-orders');
}

export function createOrder(data: GeneralOrderFormData): Promise<GeneralOrder> {
  return apiRequest('/api/general-orders', { method: 'POST', body: data });
}

export function subscribeToOrders(callback: () => void) {
  return subscribeToApiChanges(callback);
}
