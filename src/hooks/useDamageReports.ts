import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDamageReports,
  createDamageReport,
  updateDamageReportStatus,
  subscribeToDamageReports,
} from '../services/damageReportService';
import type { DamageReportFormData, DamageStatus } from '../types';
import { useEffect } from 'react';

export function useDamageReports(itemId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['damageReports', itemId],
    queryFn: () => getDamageReports(itemId),
  });

  useEffect(() => {
    const unsubscribe = subscribeToDamageReports(() => {
      queryClient.invalidateQueries({ queryKey: ['damageReports'] });
    });
    return unsubscribe;
  }, [queryClient]);

  return query;
}

export function useCreateDamageReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DamageReportFormData) => createDamageReport(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damageReports'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useUpdateDamageReportStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: DamageStatus }) =>
      updateDamageReportStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damageReports'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
