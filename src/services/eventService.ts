import type { EventReport, EventReportFormData, EventType } from '../types';
import { apiRequest, subscribeToApiChanges } from './apiClient';

export function getEventReports(eventType?: EventType): Promise<EventReport[]> { return apiRequest('/api/events', { query: { eventType } }); }
export function getEventReport(id: string): Promise<EventReport> { return apiRequest(`/api/events/${id}`); }
function payload(data: EventReportFormData) {
  return { eventType: data.eventType, name: `${data.eventType} ${new Date(data.eventDate).getUTCFullYear()}`, startDate: data.eventDate, endDate: data.eventDate, status: data.status, notes: data.notes };
}
export function createEventReport(data: EventReportFormData): Promise<EventReport> { return apiRequest('/api/events', { method: 'POST', body: payload(data) }); }
export function updateEventReport(id: string, data: EventReportFormData): Promise<EventReport> { return apiRequest(`/api/events/${id}`, { method: 'PATCH', body: payload(data) }); }
export function subscribeToEventReports(callback: () => void) { return subscribeToApiChanges(callback); }
