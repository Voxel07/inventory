import type { User } from './user';
import type { EventType } from './event';
import type { AssetInstance } from './item';

export interface StockTransaction {
  id: string;
  itemId: string;
  transactionType: TransactionType;
  quantityChanged: number;
  assetInstanceId?: string;
  userId: string;
  damageReportId?: string;
  factionOrderId?: string;
  eventType?: EventType;
  faction?: string;
  clientCommandId?: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  reason: string;
  notes: string;
  timestamp: string;
  created: string;
  updated: string;
  expand?: {
    userId?: User;
    assetInstanceId?: AssetInstance;
    factionOrderId?: {
      id: string;
      eventType: string;
      faction: string;
      orderCode?: string;
    };
  };
}


export type TransactionType = 'received' | 'adjusted' | 'reserved' | 'reservation_released' | 'transfer_out' | 'transfer_in' | 'staged' | 'checkout' | 'checkin' | 'added' | 'consumed' | 'damaged' | 'missing' | 'repaired' | 'written_off';

export interface TransactionFormData {
  occurredAt?: string;
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
  factionOrderId?: string;
  eventType?: EventType;
  faction?: string;
}
