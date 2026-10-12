import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '../services/apiClient';
import type { EventAttendee, EventAttendeeInput, EventTimelineEntry, EventTimelineInput } from '../types/eventLogistics';

function createEventLogisticsHooks<T, TInput>(section: 'attendees' | 'timeline') {
  const path = (eventId: string) => `/api/events/${eventId}/${section}`;
  return {
    useList(eventId?: string) {
      return useQuery({
        queryKey: ['event-logistics', eventId, section],
        queryFn: () => apiRequest<T[]>(path(eventId!)),
        enabled: Boolean(eventId),
      });
    },
    useSave(eventId: string) {
      return useMutation({
        mutationFn: ({ id, data }: { id?: string; data: TInput }) => apiRequest<T>(
          id ? `${path(eventId)}/${id}` : path(eventId),
          { method: id ? 'PUT' : 'POST', body: data },
        ),
      });
    },
    useDelete(eventId: string) {
      return useMutation({ mutationFn: (id: string) => apiRequest(`${path(eventId)}/${id}`, { method: 'DELETE' }) });
    },
  };
}

export const attendeeHooks = createEventLogisticsHooks<EventAttendee, EventAttendeeInput>('attendees');
export const timelineHooks = createEventLogisticsHooks<EventTimelineEntry, EventTimelineInput>('timeline');
