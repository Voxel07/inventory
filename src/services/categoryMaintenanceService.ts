import { apiRequest } from './apiClient';

export interface CategoryMaintenancePolicy {
  category: string;
  intervalDays: number;
}

export const getCategoryMaintenancePolicies = () => apiRequest<CategoryMaintenancePolicy[]>('/api/category-maintenance');

export const saveCategoryMaintenancePolicy = (category: string, intervalDays: number) =>
  apiRequest<CategoryMaintenancePolicy>('/api/category-maintenance', {
    method: 'PUT', body: { category, intervalDays },
  });
