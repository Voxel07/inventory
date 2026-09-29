import type { User } from './user';

export interface GeneralOrder {
  sourceLocations?: Record<string, string>;
  id: string;
  name: string;
  purpose: string;
  eventOccurrenceId?: string;
  status: 'draft' | 'submitted' | 'preparing' | 'ready' | 'picked_up' | 'partially_returned' | 'returned' | 'closed' | 'cancelled';
  preparedQuantities: Record<string, number>;
  damagedQuantities: Record<string, number>;
  missingQuantities: Record<string, number>;
  writtenOffQuantities: Record<string, number>;
  reconciledAssets: Record<string, string[]>;
  history: { id: string; actorName: string; timestamp: string; action: string; notes?: string; delta: Record<string, unknown> }[];
  requestedQuantities: Record<string, number>;
  handedOverQuantities: Record<string, number>;
  returnedQuantities: Record<string, number>;
  consumedQuantities: Record<string, number>;
  assetAssignments: Record<string, string[]>;
  itemNames?: Record<string, string>;
  createdBy: string;
  created: string;
  updated: string;
  expand?: { createdBy?: User };
}

export interface GeneralOrderFormData {
  name: string;
  purpose: string;
  eventOccurrenceId?: string;
  requestedQuantities: Record<string, number>;
}
