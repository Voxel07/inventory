import { useMutation, useQuery } from '@tanstack/react-query';
import {
  damageReportApi,
  getDamageReports,
  updateDamageReport,
  updateDamageReportStatus,
  type DamageReportFilters,
} from '../services/damageReportService';
import { createCreateResourceHooks } from './useResourceApi';
import type { DamageReport, DamageReportFormData, DamageReportUpdateData, DamageStatus } from '../types';
import { usePagedList } from './usePagedList';

const baseHooks = createCreateResourceHooks<DamageReport, DamageReportFormData>(
  damageReportApi,
  'damageReports',
);

export const useCreateDamageReport = baseHooks.useCreate;

export function useDamageReports(itemId?: string, filters?: Omit<DamageReportFilters, 'itemId'>, size?: number) {
  const query = { itemId, ...filters };
  return usePagedList<DamageReport>(['damageReports', query], (page, pageSize) => getDamageReports(query, page, pageSize), { size });
}

export function useDamageReportsPage(filters: DamageReportFilters, page: number, size: number) {
  return useQuery({
    queryKey: ['damageReports', 'page', filters, { page, size }],
    queryFn: () => getDamageReports(filters, page, size),
    networkMode: 'offlineFirst',
  });
}

export function useUpdateDamageReportStatus() {
  return useMutation({
    mutationFn: ({ id, status, amount, notes }: { id: string; status: DamageStatus; amount?: number; notes?: string }) =>
      updateDamageReportStatus(id, status, amount, notes),
  });
}

export function useUpdateDamageReport() {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DamageReportUpdateData }) => updateDamageReport(id, data),
  });
}
