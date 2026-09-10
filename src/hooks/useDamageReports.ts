import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  damageReportApi,
  getDamageReports,
  updateDamageReportStatus,
} from '../services/damageReportService';
import { createCreateResourceHooks } from './useResourceApi';
import type { DamageReport, DamageReportFormData, DamageStatus } from '../types';

const relatedKeys = ['items', 'transactions'];
const baseHooks = createCreateResourceHooks<DamageReport, DamageReportFormData>(
  damageReportApi,
  'damageReports',
  relatedKeys,
);

export const useCreateDamageReport = baseHooks.useCreate;

export function useDamageReports(itemId?: string) {
  return useQuery({
    queryKey: ['damageReports', itemId],
    queryFn: () => getDamageReports(itemId),
  });
}

export function useUpdateDamageReportStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, amount }: { id: string; status: DamageStatus; amount?: number }) =>
      updateDamageReportStatus(id, status, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damageReports'] });
      relatedKeys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });
}
