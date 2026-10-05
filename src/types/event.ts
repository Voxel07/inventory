import type { Item } from './item';

/** Event type code (e.g. DE, LS); the list comes from GET /api/event-types. */
export type EventType = string;
export type EventReportStatus = 'planned' | 'completed';

export interface EventReport {
  id: string;
  eventType: EventType;
  name: string;
  eventDate: string;
  startDate: string;
  endDate: string;
  status: EventReportStatus;
  itemIds: string[];
  plannedQuantities: Record<string, number>;
  usedQuantities: Record<string, number>;
  quantities?: Record<string, Record<string, number>>;
  itemNames?: Record<string, string>;
  notes?: string;
  createdBy?: string;
  created: string;
  updated: string;
  expand?: {
    itemIds?: Item[];
  };
}

export interface EventReportFormData {
  eventType: EventType;
  name?: string;
  eventDate: string;
  startDate?: string;
  endDate?: string;
  status: EventReportStatus;
  itemIds: string[];
  plannedQuantities: Record<string, number>;
  usedQuantities: Record<string, number>;
  notes?: string;
}
