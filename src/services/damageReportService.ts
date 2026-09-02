import type { DamageReport, DamageReportFormData, DamageStatus } from '../types';
import { apiRequest, subscribeToApiChanges } from './apiClient';

export function getDamageReports(itemId?: string): Promise<DamageReport[]> { return apiRequest('/api/damage-reports', { query: { itemId } }); }
export function createDamageReport(data: DamageReportFormData): Promise<DamageReport> {
  return apiRequest('/api/damage-reports', { method: 'POST', body: { ...data, idempotencyKey: crypto.randomUUID() }, offline: { type: 'damage.create', payload: data as unknown as Record<string, unknown> } });
}
export function updateDamageReportStatus(id: string, status: DamageStatus, amount = 1): Promise<DamageReport> { return apiRequest(`/api/damage-reports/${id}`, { method: 'PATCH', body: { status, amount } }); }
export function subscribeToDamageReports(callback: (data: { action: string; record: DamageReport }) => void) {
  return subscribeToApiChanges(() => callback({ action: 'refresh', record: {} as DamageReport }));
}
