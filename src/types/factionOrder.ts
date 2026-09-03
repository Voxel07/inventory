import type { Item } from './item';
import type { Assembly } from './assembly';
import type { EventType } from './event';
import type { User } from './user';
import type { StorageLocation } from './item';

export const FACTIONS_BY_EVENT: Record<EventType, readonly string[]> = {
  DE: ['KGG', 'GOF', 'Enklave', 'Miliz'],
  LS: ['UCRF', 'TERA'],
  TNO: ['Militär', 'Freiheit', 'Stalker', 'Banditen', 'Wissenschaftler'],
  ASD: ['Delta', 'Ghost'],
  M24: ['Hondra', 'Militär', 'Kartell'],
};

export type FactionOrderStatus = 'draft' | 'submitted' | 'preparing' | 'ready' | 'picked_up' | 'partially_returned' | 'returned' | 'closed' | 'cancelled';
export type FactionOrderHistoryAction =
  | 'created'
  | 'updated'
  | 'historical_correction'
  | 'submitted'
  | 'submission_reopened'
  | 'preparation_started'
  | 'preparation_saved'
  | 'preparation_reopened'
  | 'ready'
  | 'picked_up'
  | 'partially_returned'
  | 'returned'
  | 'closed'
  | 'cancelled';

export interface FactionOrderHistoryEntry {
  action: FactionOrderHistoryAction;
  userId: string;
  userName: string;
  timestamp: string;
  quantities?: Record<string, number>;
  assemblyQuantities?: Record<string, number>;
  note?: string;
}

export interface FactionOrder {
  id: string;
  orderCode: string;
  factionKey: string;
  eventType: EventType;
  faction: string;
  eventDate: string;
  pickupLocation?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  status: FactionOrderStatus;
  itemIds: string[];
  requestedQuantities: Record<string, number>;
  preparedQuantities: Record<string, number>;
  assemblyIds: string[];
  requestedAssemblyQuantities: Record<string, number>;
  preparedAssemblyQuantities: Record<string, number>;
  pickedUpQuantities?: Record<string, number>;
  returnedQuantities?: Record<string, number>;
  missingQuantities?: Record<string, number>;
  damagedQuantities?: Record<string, number>;
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
    assemblyIds?: Assembly[];
    createdBy?: User;
    preparedBy?: User;
    readyBy?: User;
    pickedUpBy?: User;
    returnedBy?: User;
    pickupLocation?: StorageLocation;
  };
}

export interface FactionOrderFormData {
  eventType: EventType;
  faction: string;
  eventDate: string;
  pickupLocation?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  itemIds: string[];
  requestedQuantities: Record<string, number>;
  assemblyIds: string[];
  requestedAssemblyQuantities: Record<string, number>;
  notes?: string;
}

export function factionKey(eventType: EventType, faction: string): string {
  return `${eventType}:${faction}`;
}

export function isFactionForEvent(eventType: EventType, faction: string): boolean {
  return FACTIONS_BY_EVENT[eventType].includes(faction);
}
