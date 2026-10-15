import type { DamageReport, DamageReportFormData, DamageReportUpdateData, DamageStatus } from '../types';
import { apiRequest } from './apiClient';
import { createCreateResourceApi } from './resourceFactory';

export const damageReportApi = createCreateResourceApi<DamageReport, DamageReportFormData>(
  '/api/damage-reports',
  undefined,
  {
    customCreate: (data) =>
      apiRequest('/api/damage-reports', {
        method: 'POST',
        body: { ...data, idempotencyKey: crypto.randomUUID() },
        offline: { type: 'damage.create', payload: data },
      }),
  },
);

export type DamageReportFilters = { itemId?: string; assetInstanceId?: string; assemblyId?: string; status?: readonly DamageStatus[] };
export const getDamageReports = (filters: DamageReportFilters | undefined, page: number, size: number) => damageReportApi.getPage(filters, page, size);
export function updateDamageReportStatus(id: string, status: DamageStatus, amount = 1, notes?: string, itemHint?: string): Promise<DamageReport> {
  return apiRequest(`/api/damage-reports/${id}`, { method: 'PATCH', body: { status, amount, notes, itemHint } });
}

export function updateDamageReport(id: string, data: DamageReportUpdateData): Promise<DamageReport> {
  return apiRequest(`/api/damage-reports/${id}`, { method: 'PATCH', body: data });
}
