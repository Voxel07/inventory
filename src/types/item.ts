import type { InventoryAccess } from './inventoryAccess';
import type { MaintenanceType, ScheduleIntervalType } from './operations';
export interface StorageLocation {
  hierarchyPath?: string;
  keeperUserId?: string;
  keeperUserName?: string;
  keeperUserEmail?: string;
  access?: InventoryAccess;
  /** Null if an ancestor is hidden; otherwise 0 = site, 1 = section, 2+ = place. */
  depth: number | null;
  /** Top-level location this one belongs to (itself for a location). */
  rootLocationId?: string;
  rootLocationName?: string;
  parentLocationId?: string;
  active: boolean;
  id: string;
  name: string;
  /** Short code of this level, e.g. `R3`. */
  code: string;
  /** Level codes from the top-level location, e.g. `BH-CE-R2-F7`. */
  fullCode: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  mapZoom?: number;
  mapOverlay?: string;
  overlayBounds?: MapBounds;
  created: string;
  updated: string;
}

export type MapBounds = [[number, number], [number, number]];

export interface StorageLocationFormData {
  keepParent?: boolean;
  privateResource?: boolean;
  mapOverlay?: string | null;
  parentLocationId?: string | null;
  active?: boolean;
  name: string;
  code?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  mapZoom?: number;
  mapOverlayFile?: File;
  removeMapOverlay?: boolean;
  overlayBounds?: MapBounds;
}

/** A section or storage place in the structure editor; nodes without id are created. */
export interface StorageNodeInput {
  id?: string;
  name: string;
  code?: string;
  description?: string;
  children: StorageNodeInput[];
}

/** A top-level location with its sections, saved in one step (`PUT /api/storage-locations/structure`). */
export interface StorageStructureInput {
  id?: string;
  name: string;
  code?: string;
  description?: string;
  privateResource?: boolean;
  sections: StorageNodeInput[];
}

export interface ItemStock {
  totalOwned: number;
  onHand: number;
  checkedOut: number;
  inTransit: number;
  damaged: number;
  reserved: number;
  available: number;
  ordered: number;
}

export interface MaintenanceBlock {
  scheduleId: string;
  maintenanceType: MaintenanceType;
  assetCode: string | null;
  status: 'due' | 'unknown';
  intervalType: ScheduleIntervalType;
  nextDueAt: string | null;
  nextDueValue: number | null;
}

export interface Item {
  access?: InventoryAccess;
  locationRestricted?: boolean;
  id: string;
  sku?: string;
  name: string;
  description?: string;
  minStock?: number;
  value: number;
  category: string;
  subcategory?: string;
  supplier?: string;
  eventTypes?: EventType[];
  /** Null when the item has no storage location or the caller may not see it (`locationRestricted`). */
  storageLocation: string | null;
  /** Free-text place inside the storage location, e.g. "left side, top box". */
  positionDetails?: string;
  returnLocation: string | null;
  status: ItemStatus;
  images?: string[];
  hint?: string;
  /** Read-only projection of `inventoryRole === 'consumable'`; the role is the stored authority. */
  isConsumable: boolean;
  trackingMode?: 'bulk' | 'serialized' | 'lot_tracked';
  inventoryRole?: 'consumable' | 'returnable';
  /** Display unit ("L"); absent counts pieces. Every quantity of the item is in whole steps of 10^-quantityDecimals units. */
  unit?: string | null;
  quantityDecimals?: number;
  containerSize?: number;
  containerCount?: number;
  containerRemainingCount?: number;
  nextMaintenanceDue?: string;
  currentOperatingHours?: number;
  /** The warehouse records the hours run per unit and event when it checks a return. */
  tracksRuntime?: boolean;
  fuelConsumptionLitersPer100Km?: number;
  batteryReplacementDue?: string;
  bestBeforeDate?: string;
  /** Derived by the server from the out-of-service flag and the item calendar. */
  maintenanceStatus: MaintenanceStatus;
  /** Active schedules the server currently considers blocking for item or unit checkout. */
  blockingMaintenance: MaintenanceBlock[];
  created: string;
  updated: string;
  /** Null when no stock projection was computed for this response. */
  stock: ItemStock | null;
  expand?: {
    storageLocation?: StorageLocation;
    returnLocation?: StorageLocation;
  };
}

export type ItemStatus = 'available' | 'checked_out' | 'damaged' | 'retired';
export type MaintenanceStatus = 'certified' | 'due_soon' | 'overdue' | 'in_service';

export interface ItemFormData {
  privateResource?: boolean;
  publicUse?: boolean;
  name: string;
  description?: string;
  amount?: number;
  minStock: number;
  value: number;
  category: string;
  subcategory?: string;
  supplier?: string;
  eventTypes?: EventType[];
  storageLocation: string;
  positionDetails?: string;
  returnLocation?: string;
  hint?: string;
  trackingMode?: 'bulk' | 'serialized' | 'lot_tracked';
  inventoryRole?: 'consumable' | 'returnable';
  unit?: string;
  quantityDecimals?: number;
  imageFiles?: File[];
  imageReplacements?: Record<string, File>;
  removeImages?: string[];
  containerSize?: number;
  currentOperatingHours?: number;
  tracksRuntime?: boolean;
  fuelConsumptionLitersPer100Km?: number;
  batteryReplacementDue?: string;
  bestBeforeDate?: string;
  /** Creation only: serialized opening units are coded prefix + zero-padded number (server default: SKU- and 1). */
  assetCodePrefix?: string;
  assetStartNumber?: number;
  /** Creation only: item-wide maintenance plans created together with the item. */
  maintenanceSchedules?: ItemScheduleInput[];
}

/** A maintenance plan entered on the item creation form (`ApiModels.ItemScheduleInput`). */
export interface ItemScheduleInput {
  maintenanceType: MaintenanceType;
  intervalType: ScheduleIntervalType;
  intervalValue: number;
  nextDueAt?: string | null;
  nextDueValue?: number | null;
  warningWindow?: number | null;
  checkoutBlocking: boolean;
}

export type ReturnSubmissionStatus = 'pending' | 'accepted' | 'rejected';

export interface ReturnSubmission {
  id: string;
  created: string;
  updated: string;
  itemId: string;
  itemName: string;
  quantity: number;
  assetInstanceId?: string;
  assetCode?: string;
  returnedForUserId: string;
  returnedForUserName: string;
  submittedById: string;
  submittedByName: string;
  orderId?: string;
  expectedReturnLocationId?: string;
  expectedReturnLocationName?: string;
  placementImage?: string;
  notes?: string;
  status: ReturnSubmissionStatus;
  acknowledgedById?: string;
  acknowledgedByName?: string;
  acknowledgedAt?: string;
  acknowledgementNotes?: string;
  /** Open damage reports on the returned asset, or by the returning people for bulk items. */
  reportedDamage: ReturnDamage[];
  /** The item needs the hours run before it goes back to stock. */
  tracksRuntime: boolean;
  /** Meter of the returned unit (or bulk item) before this return. */
  currentOperatingHours?: number;
  /** Hours run recorded when the return was accepted. */
  runtimeHours?: number;
  /** Event the hours are booked to. */
  eventName?: string;
}

export interface ReturnDamage {
  id: string;
  assetCode?: string;
  quantity: number;
  /** Absent for contributor damage requests on bulk items. */
  severity?: string;
  status: string;
  description: string;
  reportedByName?: string;
  reportedAt: string;
}

export interface ReturnSubmissionFormData {
  eventOccurrenceId?: string;
  itemId: string;
  quantity: number;
  assetInstanceId?: string;
  returnedForUserId?: string;
  orderId?: string;
  placementImageFile?: File;
  notes?: string;
}

export type AssetConditionStatus = 'new_condition' | 'good' | 'fair' | 'damaged' | 'unsafe' | 'lost';
export type AssetAvailabilityStatus = 'available' | 'reserved' | 'staged' | 'in_transit' | 'in_custody' | 'in_field' | 'returned_pending_check' | 'damaged' | 'in_repair' | 'in_maintenance' | 'lost' | 'written_off';

export interface AssetInstance {
  id: string;
  createdAt: string;
  updatedAt: string;
  itemId: string;
  assetCode: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  replacementValue?: number;
  conditionStatus: AssetConditionStatus;
  availabilityStatus: AssetAvailabilityStatus;
  /** Derived from the asset's out-of-service flag and its own or its item's calendar. */
  serviceStatus: MaintenanceStatus;
  /** The asset's calendar date; it follows the item calendar until the asset is inspected individually. */
  nextMaintenanceDue?: string;
  operatingHours?: number;
  currentLocationId?: string;
  /** Full location code, e.g. `WH1-E1-R3`. */
  currentLocationCode?: string;
  /** Location path, e.g. `Warehouse 1 / Electronics 1 / Shelf 3`. */
  currentLocationName?: string;
  currentCustodianId?: string;
  currentCustodianName?: string;
  notes?: string;
  active: boolean;
  version: number;
  /** The open order holding a reserved or staged asset. */
  /** orderId is absent when the holding order is hidden from the viewer (restricted indicator). */
  reservedFor?: { kind: 'faction_order' | 'general_order'; orderId?: string; label: string };
}

/** One booking of running hours; the event says where the unit ran. */
export interface RuntimeEntry {
  id: string;
  itemId: string;
  assetInstanceId?: string;
  assetCode?: string;
  eventOccurrenceId?: string;
  eventName?: string;
  eventStartDate?: string;
  orderId?: string;
  orderLabel?: string;
  hours: number;
  readingAfter: number;
  source: 'manual' | 'return_check' | 'maintenance' | 'correction';
  recordedAt: string;
  recordedByName?: string;
  notes?: string;
}

export interface RuntimeInput {
  hours?: number;
  reading?: number;
  eventOccurrenceId?: string;
  notes?: string;
  expectedVersion: number;
}

export interface AssetInstanceInput {
  assetCode?: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  replacementValue?: number;
  conditionStatus?: AssetConditionStatus;
  availabilityStatus?: AssetAvailabilityStatus;
  currentLocationId?: string;
  currentCustodianId?: string;
  operatingHours?: number;
  notes?: string;
  expectedVersion?: number;
}

/** Renames the listed units, in order, to prefix + zero-padded consecutive numbers; stock is unchanged. */
export interface AssetRecodeInput {
  codePrefix: string;
  startNumber: number;
  assetIds: string[];
}

import type { EventType } from './event';
