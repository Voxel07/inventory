import type { Item } from './item';
import type { EventType } from './event';
import type { User } from './user';

export const FACTIONS_BY_EVENT: Record<EventType, readonly string[]> = {
  DE: ['KGG', 'GOF', 'Enklave', 'Miliz'],
  LS: ['UCRF', 'TERA'],
  TNO: ['Militär', 'Freiheit', 'Stalker', 'Banditen', 'Wissenschaftler'],
  ASD: ['Delta', 'Ghost'],
  M24: ['Hondra', 'Militär', 'Kartell'],
};

export type FactionOrderStatus = 'draft' | 'preparing' | 'ready' | 'picked_up' | 'returned' | 'cancelled';
export type FactionOrderHistoryAction =
  | 'created'
  | 'updated'
  | 'preparation_started'
  | 'preparation_saved'
  | 'ready'
  | 'picked_up'
  | 'returned'
  | 'cancelled';

export interface FactionOrderHistoryEntry {
  action: FactionOrderHistoryAction;
  userId: string;
  userName: string;
  timestamp: string;
  quantities?: Record<string, number>;
  note?: string;
}

export interface FactionOrder {
  id: string;
  eventType: EventType;
  faction: string;
  eventDate: string;
  status: FactionOrderStatus;
  itemIds: string[];
  requestedQuantities: Record<string, number>;
  preparedQuantities: Record<string, number>;
  notes?: string;
  createdBy: string;
  preparedBy?: string;
  preparedAt?: string;
  readyBy?: string;
  readyAt?: string;
  pickedUpBy?: string;
  pickedUpAt?: string;
  returnedBy?: string;
  returnedAt?: string;
  history: FactionOrderHistoryEntry[];
  created: string;
  updated: string;
  expand?: {
    itemIds?: Item[];
    createdBy?: User;
    preparedBy?: User;
    readyBy?: User;
    pickedUpBy?: User;
    returnedBy?: User;
  };
}

export interface FactionOrderFormData {
  eventType: EventType;
  faction: string;
  eventDate: string;
  itemIds: string[];
  requestedQuantities: Record<string, number>;
  notes?: string;
}

export function isFactionForEvent(eventType: EventType, faction: string): boolean {
  return FACTIONS_BY_EVENT[eventType].includes(faction);
}

