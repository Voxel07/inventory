import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createEventReport, getEventReports, subscribeToEventReports } from '../services/eventService';
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

export function useCreateEventReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: EventReportFormData) => createEventReport(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event-reports'] }),
  });
}
