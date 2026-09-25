import type { EventReport, EventReportFormData, EventType } from '../types';
import { eventApi, getEventReports } from '../services/eventService';
import { createResourceHooks } from './useResourceApi';
import { useQuery } from '@tanstack/react-query';

const baseHooks = createResourceHooks<EventReport, EventReportFormData>(eventApi, 'event-reports');

export const useEventReport = baseHooks.useDetail;
export const useCreateEventReport = baseHooks.useCreate;
export const useUpdateEventReport = baseHooks.useUpdate;
export const useDeleteEventReport = baseHooks.useDelete;

export function useEventReports(eventType?: EventType) {
  return useQuery({
    queryKey: ['event-reports', eventType],
    queryFn: () => getEventReports(eventType),
  });
}
