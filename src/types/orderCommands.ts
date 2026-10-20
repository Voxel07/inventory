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
/** Missing is the unresolved total after this command; other outcomes settle units now. Consumables are consumed at pickup. */
export type ReturnLineInput = { returned: number; missing: number; damaged: number; writtenOff: number; operatingHours?: number; notes?: string };
/** Unused consumables back to stock, per item in the item's steps; allowed from pickup on, also on completed orders. */
export interface OrderRestockInput {
  quantities: Record<string, number>;
  idempotencyKey?: string;
  locationId?: string;
  notes?: string | null;
}
export interface OrderReturnInput {
  lines: Record<string, ReturnLineInput>;
  assets?: Record<string, AssetReturnOutcome>;
  idempotencyKey?: string;
  notes?: string | null;
}
