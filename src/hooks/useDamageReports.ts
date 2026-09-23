import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  damageReportApi,
  getDamageReports,
  updateDamageReport,
  updateDamageReportStatus,
} from '../services/damageReportService';
import { createCreateResourceHooks } from './useResourceApi';
import type { DamageReport, DamageReportFormData, DamageReportUpdateData, DamageStatus } from '../types';
import { useProgressiveList } from './useProgressiveList';

const relatedKeys = ['items', 'transactions'];
const baseHooks = createCreateResourceHooks<DamageReport, DamageReportFormData>(
  damageReportApi,
  'damageReports',
  relatedKeys,
);

export const useCreateDamageReport = baseHooks.useCreate;

export function useDamageReports(itemId?: string, filters?: { assetInstanceId?: string; assemblyId?: string; size?: number }) {
  const query = { itemId, ...filters };
  return useProgressiveList<DamageReport>(
    ['damageReports', query],
    (page, size) => getDamageReports({ ...query, page, size }),
    filters,
  );
}

export function useUpdateDamageReportStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, amount, notes, itemHint }: { id: string; status: DamageStatus; amount?: number; notes?: string; itemHint?: string }) =>
      updateDamageReportStatus(id, status, amount, notes, itemHint),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damageReports'] });
      relatedKeys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });
}

export function useUpdateDamageReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DamageReportUpdateData }) => updateDamageReport(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['damageReports'] }),
  });
}
