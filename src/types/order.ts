import type { User } from './user';

export interface GeneralOrder {
  id: string;
  name: string;
  purpose: string;
  eventOccurrenceId?: string;
  status: 'draft' | 'submitted' | 'ready' | 'picked_up' | 'partially_returned' | 'returned' | 'closed' | 'cancelled';
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
