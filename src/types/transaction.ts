export interface StockTransaction {
  id: string;
  itemId: string;
  transactionType: TransactionType;
  quantityChanged: number;
  userId: string;
  reason: string;
  notes: string;
  timestamp: string;
  created: string;
  updated: string;
}

export type TransactionType = 'checkout' | 'checkin' | 'added';

export interface TransactionFormData {
  itemId: string;
  transactionType: TransactionType;
  quantityChanged: number;
  reason: string;
  notes: string;
}
