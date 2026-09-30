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
  generalOrderId?: string;
  eventOccurrenceId?: string;
  pendingQuantity?: number;
  factionOrderId?: string;
  assetInstanceId?: string;
  /** Resolved assembly this item belongs to (if from a faction order) */
  assemblyId?: string;
}

