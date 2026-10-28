import type { ActorSummary } from './user';
import type { OrderPreparationInput, OrderReturnInput, OrderStatus, OrderTransitionInput } from './orderCommands';
import type { OrderHistoryEntry } from './orderHistory';

/** Derived on the server: declined, received/ordered (via a purchase order), item_created (item linked) or open. */
export type ItemRequestStatus = 'open' | 'item_created' | 'ordered' | 'received' | 'declined';

/** Something an order asks for that the inventory does not hold yet. */
export interface OrderItemRequest {
  id: string;
  name: string;
  quantity: number;
  link?: string;
  note?: string;
  status: ItemRequestStatus;
  itemId?: string;
  itemName?: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  purchaseOrderStatus?: string;
  declineReason?: string;
  resolvedBy?: string;
  declinedAt?: number;
}

/** Without an id it is a new request; resolved requests are kept by the server whatever the input says. */
export interface OrderItemRequestInput {
  id?: string;
  name: string;
  quantity: number;
  link?: string;
  note?: string;
}

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
  itemRequests: OrderItemRequest[];
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
  itemRequests?: OrderItemRequestInput[];
}

export type GeneralOrderSummary = Omit<GeneralOrder, 'history'>;
