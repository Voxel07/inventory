import type { EventReport, EventReportFormData, EventType } from '../types';
import { createCrudResourceApi } from './resourceFactory';

function formatEventPayload(data: Partial<EventReportFormData>) {
  const startDate = (data.startDate ?? data.eventDate)?.slice(0, 10);
  return {
    eventType: data.eventType,
    name: data.name,
    startDate,
    endDate: (data.endDate ?? data.startDate ?? data.eventDate)?.slice(0, 10),
    status: data.status,
    notes: data.notes,
    plannedQuantities: data.plannedQuantities,
    usedQuantities: data.usedQuantities,
  };
}

export const eventApi = createCrudResourceApi<EventReport, EventReportFormData>('/api/events', 'events', {
  transformPayload: (data) => formatEventPayload(data),
});

export const getEventReports = (eventType?: EventType) => eventApi.getAll(eventType ? { eventType } : undefined);
export const getEventReport = eventApi.getById;
export const createEventReport = eventApi.create;
export const updateEventReport = eventApi.update;
export const deleteEventReport = eventApi.delete;
