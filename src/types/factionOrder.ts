import type { AssetInstance, Item } from './item';
import type { Assembly } from './assembly';
import type { EventType } from './event';
import type { User } from './user';
import type { OrderStatus } from './orderCommands';
import type { OrderHistoryEntry } from './orderHistory';
import type { StorageLocation } from './item';

/** Reference data from GET /api/factions. Memberships are `EVENT:slug` keys (see {@link FactionOrder.factionKey}). */
export interface Faction {
  id: string;
  eventType: EventType;
  name: string;
  slug: string;
  active?: boolean;
}

export type FactionOrderStatus = OrderStatus;
export type { OrderHistoryAction as FactionOrderHistoryAction, OrderHistoryEntry as FactionOrderHistoryEntry } from './orderHistory';

export interface FactionOrder {
  kind: 'faction';
  sourceLocations?: Record<string, string>;
  id: string;
  orderCode: string;
  factionKey: string;
  eventType: EventType;
  faction: string;
  eventDate: string;
  eventOccurrenceId: string;
  requestedPickupDate?: string;
  pickupLocation?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  status: FactionOrderStatus;
  itemIds: string[];
  requestedQuantities: Record<string, number>;
  preparedQuantities: Record<string, number>;
  allocatedQuantities?: Record<string, number>;
  reservedQuantities?: Record<string, number>;
  assemblyIds: string[];
  requestedAssemblyQuantities: Record<string, number>;
  preparedAssemblyQuantities: Record<string, number>;
  assetAssignments?: Record<string, AssetInstance[]>;
  handedOverQuantities?: Record<string, number>;
  returnedQuantities?: Record<string, number>;
  consumedQuantities?: Record<string, number>;
  missingQuantities?: Record<string, number>;
  damagedQuantities?: Record<string, number>;
  writtenOffQuantities?: Record<string, number>;
  notes?: string;
  createdBy: string;
  preparedBy?: string;
  readyBy?: string;
  pickedUpBy?: string;
  returnedBy?: string;
  history: OrderHistoryEntry[];
  created: string;
  updated: string;
  expand?: {
    itemIds?: Item[];
    assemblyIds?: Assembly[];
    createdBy?: User;
    preparedBy?: User;
    readyBy?: User;
    pickedUpBy?: User;
    returnedBy?: User;
    pickupLocation?: StorageLocation;
  };
}

/** List projection of GET /api/orders: no history, asset assignments, lines, source locations or actor fields. */
export type FactionOrderSummary = Omit<FactionOrder, 'history' | 'assetAssignments' | 'sourceLocations' | 'createdBy' | 'preparedBy' | 'readyBy' | 'pickedUpBy' | 'returnedBy'>;

export interface FactionOrderFormData {
  eventType: EventType;
  faction: string;
  eventDate: string;
  eventOccurrenceId?: string;
  requestedPickupDate?: string;
  pickupLocation?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  itemIds: string[];
  requestedQuantities: Record<string, number>;
  assemblyIds: string[];
  requestedAssemblyQuantities: Record<string, number>;
  notes?: string;
}
