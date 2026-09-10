import type { User } from './user';
import type { EventType } from './event';

export interface StockTransaction {
  id: string;
  itemId: string;
  transactionType: TransactionType;
  quantityChanged: number;
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
    factionOrderId?: {
      id: string;
      eventType: string;
      faction: string;
      orderCode?: string;
    };
  };
}


export type TransactionType = 'checkout' | 'checkin' | 'added' | 'repaired' | 'written_off' | 'consumed';

export interface TransactionFormData {
  itemId: string;
  transactionType: TransactionType;
  quantityChanged: number;
  reason: string;
  notes: string;
  userId?: string;
  factionOrderId?: string;
  eventType?: EventType;
  faction?: string;
}
