import type { ActorSummary } from './user';
import type { OrderPreparationInput, OrderReturnInput, OrderStatus, OrderTransitionInput } from './orderCommands';
import type { OrderHistoryEntry } from './orderHistory';

export type GeneralOrderCommands = { prepare: OrderPreparationInput; pickup: OrderTransitionInput; return: OrderReturnInput };

export interface GeneralOrder {
  kind: 'general';
  sourceAllocations?: Record<string, Record<string, number>>;
  id: string;
  name: string;
  purpose: string;
  eventOccurrenceId?: string;
  status: OrderStatus;
  preparedQuantities: Record<string, number>;
  damagedQuantities: Record<string, number>;
  missingQuantities: Record<string, number>;
  writtenOffQuantities: Record<string, number>;
  reconciledAssets: Record<string, string[]>;
  history: OrderHistoryEntry[];
  requestedQuantities: Record<string, number>;
  handedOverQuantities: Record<string, number>;
  returnedQuantities: Record<string, number>;
  consumedQuantities: Record<string, number>;
  assetAssignments: Record<string, string[]>;
  itemNames?: Record<string, string>;
  createdBy: string;
  created: number;
  updated: number;
  expand?: { createdBy?: ActorSummary };
}

export interface GeneralOrderFormData {
  name: string;
  purpose: string;
  eventOccurrenceId?: string;
  requestedQuantities: Record<string, number>;
}

export type GeneralOrderSummary = Omit<GeneralOrder, 'history'>;
