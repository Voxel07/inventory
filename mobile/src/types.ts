export type Item = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  description?: string | null;
  trackingMode?: string | null;
  stock?: { available: number; onHand: number; checkedOut: number } | null;
};

export type Asset = {
  id: string;
  itemId: string;
  assetCode: string;
  availabilityStatus: string;
};

export type User = { id: string; name: string; role: string };

export type TransactionInput = {
  itemId: string;
  transactionType: 'checkout' | 'checkin';
  quantityChanged: number;
  reason: string;
  notes: string;
  assetInstanceId?: string;
  eventType?: string;
  faction?: string;
};

export type OfflineAction = {
  idempotencyKey: string;
  type: 'transaction';
  payload: TransactionInput;
  localTimestamp: string;
};

export type SyncIssue = OfflineAction & {
  status: 'conflict' | 'rejected';
  error: string;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  user: User | null;
};
