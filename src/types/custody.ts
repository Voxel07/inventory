export interface CheckedOutRow {
  key: string;
  itemId: string;
  name: string;
  category: string;
  storageLocation: string;
  checkedOut: number;
  personId: string;
  person: string;
  eventKey: string;
  event: string;
  eventOccurrenceId?: string;
  pendingQuantity?: number;
  /** Order the custody comes from; absent for direct checkouts. */
  orderId?: string;
  orderKind?: 'faction' | 'general';
  assetInstanceId?: string;
  /** Resolved assembly this item belongs to (if from a faction order) */
  assemblyId?: string;
}

