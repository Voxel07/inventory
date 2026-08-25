import type { Item } from './item';

export const EVENT_TYPES = ['DE', 'TNO', 'LS', 'M24', 'ASD'] as const;

export type EventType = typeof EVENT_TYPES[number];
export type EventReportStatus = 'planned' | 'completed';

export interface EventReport {
  id: string;
  eventType: EventType;
  eventDate: string;
  status: EventReportStatus;
  itemIds: string[];
  plannedQuantities: Record<string, number>;
  usedQuantities: Record<string, number>;
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
  eventDate: string;
  status: EventReportStatus;
  itemIds: string[];
  plannedQuantities: Record<string, number>;
  usedQuantities: Record<string, number>;
  notes?: string;
}
