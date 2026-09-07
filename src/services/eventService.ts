import type { EventReport, EventReportFormData, EventType } from '../types';
import { apiRequest, subscribeToApiChanges } from './apiClient';
import { getOfflineCatalog, setOfflineCatalog } from './offlineQueue';

export async function getEventReports(eventType?: EventType): Promise<EventReport[]> {
  try {
    const events = await apiRequest<EventReport[]>('/api/events', { query: { eventType } });
    if (!eventType) void setOfflineCatalog('events', events);
    return events;
  } catch (error) {
    const cached = await getOfflineCatalog<EventReport[]>('events');
    if (cached) return eventType ? cached.filter((event) => event.eventType === eventType) : cached;
    throw error;
  }
}
export async function getEventReport(id: string): Promise<EventReport> {
  try {
    return await apiRequest(`/api/events/${id}`);
  } catch (error) {
    const cached = await getOfflineCatalog<EventReport[]>('events');
    const found = cached?.find((event) => event.id === id);
    if (found) return found;
    throw error;
  }
}
function payload(data: EventReportFormData) {
  return { eventType: data.eventType, name: `${data.eventType} ${new Date(data.eventDate).getUTCFullYear()}`, startDate: data.eventDate, endDate: data.eventDate, status: data.status, notes: data.notes };
}
export function createEventReport(data: EventReportFormData): Promise<EventReport> { return apiRequest('/api/events', { method: 'POST', body: payload(data) }); }
export function updateEventReport(id: string, data: EventReportFormData): Promise<EventReport> { return apiRequest(`/api/events/${id}`, { method: 'PATCH', body: payload(data) }); }
export function subscribeToEventReports(callback: () => void) { return subscribeToApiChanges(callback); }
