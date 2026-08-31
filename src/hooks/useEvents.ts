import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createEventReport,
  getEventReport,
  getEventReports,
  subscribeToEventReports,
  updateEventReport,
} from '../services/eventService';
import type { EventReportFormData, EventType } from '../types';

export function useEventReports(eventType?: EventType) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['event-reports', eventType],
    queryFn: () => getEventReports(eventType),
  });

  useEffect(() => subscribeToEventReports(() => {
    queryClient.invalidateQueries({ queryKey: ['event-reports'] });
  }), [queryClient]);

  return query;
}

export function useEventReport(id: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['event-reports', 'detail', id],
    queryFn: () => getEventReport(id),
    enabled: Boolean(id),
  });

  useEffect(() => subscribeToEventReports(() => {
    queryClient.invalidateQueries({ queryKey: ['event-reports'] });
  }), [queryClient]);

  return query;
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
