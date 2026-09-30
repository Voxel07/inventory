import { apiRequest } from './apiClient';

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  description?: string;
  active: boolean;
}

export type WarehouseInput = Pick<Warehouse, 'code' | 'name' | 'description' | 'active'>;

export function getWarehouses(page: number, size: number) {
  return apiRequest<Warehouse[]>('/api/warehouses', { query: { page, size } });
}

export function saveWarehouse(data: WarehouseInput, id?: string) {
  return apiRequest<Warehouse>(`/api/warehouses${id ? `/${id}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    body: data,
  });
}
