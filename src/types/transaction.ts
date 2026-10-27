import type { ActorSummary } from './user';
import type { EventType } from './event';
import type { AssetInstance } from './item';

export interface StockTransaction {
  reversesId?: string;
  reversedBy?: ActorSummary | null;
  id: string;
  itemId: string;
  itemName: string;
  transactionType: TransactionType;
  quantityChanged: number;
  assetInstanceId?: string;
  userId: string;
  damageReportId?: string;
  orderId?: string;
  eventOccurrenceId?: string;
  eventType?: EventType;
  faction?: string;
  clientCommandId?: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  reason: string;
  notes: string;
  timestamp: number;
  created: number;
  updated: number;
  expand?: {
    eventOccurrence?: { id: string; name: string; eventType: string; startDate: number; endDate: number };
    userId?: ActorSummary;
    assetInstanceId?: AssetInstance;
    order?: {
      kind: 'faction' | 'general';
      id: string;
      eventType?: string;
      faction: string;
      orderCode?: string;
    };
  };
}


export const TRANSACTION_TYPES = ['received', 'adjusted', 'putaway', 'reserved', 'reservation_released', 'transfer_out', 'transfer_in', 'staged', 'checkout', 'checkin', 'added', 'consumed', 'damaged', 'missing', 'repaired', 'written_off'] as const;
export type TransactionType = typeof TRANSACTION_TYPES[number];

export interface TransactionFormData {
  occurredAt?: number;
  locationId?: string;
  lotId?: string;
  eventOccurrenceId?: string;
  itemId: string;
  transactionType: TransactionType;
  quantityChanged: number;
  assetInstanceId?: string;
  reason: string;
  notes: string;
  userId?: string;
  /** Order of the custody a check-in settles; the return submission is checked against it. */
  orderId?: string;
  eventType?: EventType;
  faction?: string;
}
