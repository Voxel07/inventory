import type { EventReport, EventReportFormData, EventType } from '../types';
import { createMutableResourceApi } from './resourceFactory';

function formatEventPayload(data: Partial<EventReportFormData>) {
  return {
    eventType: data.eventType,
    name: data.eventDate ? `${data.eventType} ${new Date(data.eventDate).getUTCFullYear()}` : undefined,
    startDate: data.eventDate,
    endDate: data.eventDate,
    status: data.status,
    notes: data.notes,
  };
}

export const eventApi = createMutableResourceApi<EventReport, EventReportFormData>('/api/events', 'events', {
  transformPayload: (data) => formatEventPayload(data),
});

export const getEventReports = (eventType?: EventType) => eventApi.getAll(eventType ? { eventType } : undefined);
export const getEventReport = eventApi.getById;
export const createEventReport = eventApi.create;
export const updateEventReport = eventApi.update;
