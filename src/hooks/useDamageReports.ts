import { useMutation } from '@tanstack/react-query';
import {
  damageReportApi,
  getDamageReports,
  updateDamageReport,
  updateDamageReportStatus,
} from '../services/damageReportService';
import { createCreateResourceHooks } from './useResourceApi';
import type { DamageReport, DamageReportFormData, DamageReportUpdateData, DamageStatus } from '../types';
import { usePagedList } from './usePagedList';

const baseHooks = createCreateResourceHooks<DamageReport, DamageReportFormData>(
  damageReportApi,
  'damageReports',
);

export const useCreateDamageReport = baseHooks.useCreate;

export function useDamageReports(itemId?: string, filters?: { assetInstanceId?: string; assemblyId?: string; status?: readonly DamageStatus[] }, size?: number) {
  const query = { itemId, ...filters };
  return usePagedList<DamageReport>(['damageReports', query], (page, pageSize) => getDamageReports(query, page, pageSize), { size });
}

export function useUpdateDamageReportStatus() {
  return useMutation({
    mutationFn: ({ id, status, amount, notes, itemHint }: { id: string; status: DamageStatus; amount?: number; notes?: string; itemHint?: string }) =>
      updateDamageReportStatus(id, status, amount, notes, itemHint),
  });
}

export function useUpdateDamageReport() {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DamageReportUpdateData }) => updateDamageReport(id, data),
  });
}
