import type { Item } from './item';

/** Event type code (e.g. DE, LS); the list comes from GET /api/event-types. */
export type EventType = string;
export type EventReportStatus = 'planned' | 'completed';

export interface EventReport {
  id: string;
  eventType: EventType;
  name: string;
  eventDate: number;
  startDate: number;
  endDate: number;
  status: EventReportStatus;
  itemIds: string[];
  plannedQuantities: Record<string, number>;
  usedQuantities: Record<string, number>;
  quantities?: Record<string, Record<string, number>>;
  itemNames?: Record<string, string>;
  notes?: string;
  orderDeadline?: number | null;
  createdBy?: string;
  created: number;
  updated: number;
  expand?: {
    itemIds?: Item[];
  };
}

export interface EventReportFormData {
  eventType: EventType;
  name?: string;
  eventDate: number;
  startDate?: number;
  endDate?: number;
  status: EventReportStatus;
  itemIds: string[];
  plannedQuantities: Record<string, number>;
  /** Omitted on update to keep the usage recorded through orders. */
  usedQuantities?: Record<string, number>;
  notes?: string;
  orderDeadline?: number | null;
}
