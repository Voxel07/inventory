export type OrderHistoryAction =
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

export interface OrderHistoryEntry {
  id: string;
  action: OrderHistoryAction;
  userId: string;
  userName: string;
  timestamp: number;
  deltaSnapshot?: {
    items?: Record<string, number>;
    assemblies?: Record<string, number>;
    addedItems?: Record<string, number>;
    removedItems?: Record<string, number>;
    changedItems?: Record<string, { before: number; after: number }>;
    addedAssemblies?: Record<string, number>;
    removedAssemblies?: Record<string, number>;
    changedAssemblies?: Record<string, { before: number; after: number }>;
  };
  note?: string;
}
