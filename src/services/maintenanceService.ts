import type { MaintenanceResult, MaintenanceType } from '../types/operations';
import { apiRequest } from './apiClient';

export type MaintenanceRecord = {
  id: string;
  itemId: string;
  itemName: string;
  assetInstanceId?: string;
  scheduleId?: string;
  certificateObjectKey?: string;
  type: MaintenanceType;
  inspectorUserId: string;
  performedAt: string;
  nextDueAt?: string;
  operatingHours?: number;
  result: MaintenanceResult;
  certificateNumber?: string;
  notes?: string;
};

export function getMaintenanceRecords(itemId?: string): Promise<MaintenanceRecord[]> { return apiRequest('/api/maintenance', { query: { itemId } }); }
export function createMaintenanceRecord(data: Omit<MaintenanceRecord, 'id' | 'inspectorUserId' | 'itemName'>): Promise<MaintenanceRecord> { return apiRequest('/api/maintenance', { method: 'POST', body: data }); }
