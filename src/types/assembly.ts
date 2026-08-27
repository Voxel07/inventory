import type { Item } from './item';
import type { EventType } from './event';

export interface Assembly {
  id: string;
  name: string;
  itemIds: string[];
  itemQuantities: Record<string, number>;
  description: string;
  eventTypes?: EventType[];
  created: string;
  updated: string;
  expand?: {
    itemIds?: Item[];
  };
}

export interface AssemblyFormData {
  name: string;
  itemIds: string[];
  itemQuantities: Record<string, number>;
  description: string;
  eventTypes?: EventType[];
}
