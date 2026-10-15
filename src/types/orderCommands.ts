export type OrderKind = 'faction' | 'general';
export type OrderStatus = 'draft' | 'submitted' | 'preparing' | 'ready' | 'picked_up' | 'partially_returned' | 'returned' | 'closed' | 'cancelled';

export interface OrderPreparationInput {
  preparedQuantities: Record<string, number>;
  assetAssignments?: Record<string, string[]>;
  sourceLocations?: Record<string, string>;
  acknowledgeShortages?: boolean;
  idempotencyKey?: string;
  notes?: string | null;
}

export interface OrderTransitionInput {
  idempotencyKey?: string;
  notes?: string | null;
  collectorName?: string;
  pickupLocation?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
}

export type AssetReturnOutcome = {
  outcome: 'returned_good' | 'returned_damaged' | 'missing' | 'written_off';
  operatingHours?: number;
  notes?: string;
};
/** Missing is the unresolved total after this command; other outcomes settle units now. */
export type ReturnLineInput = { returned: number; consumed: number; missing: number; damaged: number; writtenOff: number; operatingHours?: number; notes?: string };
export interface OrderReturnInput {
  lines: Record<string, ReturnLineInput>;
  assets?: Record<string, AssetReturnOutcome>;
  idempotencyKey?: string;
  notes?: string | null;
}
