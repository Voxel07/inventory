import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createEventReport,
  getEventReport,
  getEventReports,
  updateEventReport,
} from '../services/eventService';
import type { EventReportFormData, EventType } from '../types';

export function useEventReports(eventType?: EventType) {
  return useQuery({
    queryKey: ['event-reports', eventType],
    queryFn: () => getEventReports(eventType),
  });
}

export function useEventReport(id: string) {
  return useQuery({
    queryKey: ['event-reports', 'detail', id],
    queryFn: () => getEventReport(id),
    enabled: Boolean(id),
  });
}

export function useCreateEventReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: EventReportFormData) => createEventReport(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event-reports'] }),
  });
}

export function useUpdateEventReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EventReportFormData }) => updateEventReport(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event-reports'] }),
  });
}
