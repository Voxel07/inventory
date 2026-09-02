import { apiRequest } from './apiClient';

export type MaintenanceRecord = {
  id: string;
  itemId: string;
  type: 'dguv_v3' | 'generator_service' | 'battery_test' | 'chrono_fps';
  inspectorUserId: string;
  performedAt: string;
  nextDueAt?: string;
  operatingHours?: number;
  result: 'passed' | 'failed' | 'advisory';
  certificateNumber?: string;
  notes?: string;
};

export function getMaintenanceRecords(itemId?: string): Promise<MaintenanceRecord[]> { return apiRequest('/api/maintenance', { query: { itemId } }); }
export function createMaintenanceRecord(data: Omit<MaintenanceRecord, 'id' | 'inspectorUserId'>): Promise<MaintenanceRecord> { return apiRequest('/api/maintenance', { method: 'POST', body: data }); }
