import type { InventoryAccess } from './inventoryAccess';
export interface StorageLocation {
  access?: InventoryAccess;
  warehouseId?: string;
  warehouseName?: string;
  parentLocationId?: string;
  active: boolean;
  id: string;
  name: string;
  description?: string;
  area?: string;
  location?: string;
  position?: string;
  latitude?: number;
  longitude?: number;
  mapZoom?: number;
  mapOverlay?: string;
  overlayBounds?: MapBounds;
  locationType?: 'warehouse' | 'bin' | 'staging' | 'event_site' | 'vehicle' | 'in_custody' | 'quarantine' | 'repair' | 'scrap';
  created: string;
  updated: string;
}

export type MapBounds = [[number, number], [number, number]];

export interface StorageLocationFormData {
  privateResource?: boolean;
  mapOverlay?: string | null;
  warehouseId?: string | null;
  parentLocationId?: string | null;
  locationType?: StorageLocation['locationType'];
  active?: boolean;
  name: string;
  description?: string;
  area?: string;
  location?: string;
  position?: string;
  latitude?: number;
  longitude?: number;
  mapZoom?: number;
  mapOverlayFile?: File;
  removeMapOverlay?: boolean;
  overlayBounds?: MapBounds;
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
  returnLocation: string | null;
  status: ItemStatus;
  images?: string[];
  hint?: string;
  /** Read-only projection of `inventoryRole === 'consumable'`; the role is the stored authority. */
  isConsumable: boolean;
  trackingMode?: 'bulk' | 'serialized' | 'lot_tracked';
  inventoryRole?: 'consumable' | 'returnable';
  containerSize?: number;
  containerCount?: number;
  containersOpened?: number;
  containerRemainingPercent?: number;
  maintenanceIntervalDays?: number;
  nextMaintenanceDue?: string;
  currentOperatingHours?: number;
  fuelConsumptionLitersPer100Km?: number;
  batteryReplacementDue?: string;
  bestBeforeDate?: string;
  /** Derived by the server from the out-of-service flag and the item calendar. */
  maintenanceStatus: MaintenanceStatus;
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
  returnLocation?: string;
  hint?: string;
  trackingMode?: 'bulk' | 'serialized' | 'lot_tracked';
  inventoryRole?: 'consumable' | 'returnable';
  imageFiles?: File[];
  imageReplacements?: Record<string, File>;
  removeImages?: string[];
  containerSize?: number;
  containerCount?: number;
  containersOpened?: number;
  containerRemainingPercent?: number;
  maintenanceIntervalDays?: number;
  nextMaintenanceDue?: string;
  currentOperatingHours?: number;
  fuelConsumptionLitersPer100Km?: number;
  batteryReplacementDue?: string;
  bestBeforeDate?: string;
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
  conditionStatus: AssetConditionStatus;
  availabilityStatus: AssetAvailabilityStatus;
  /** Derived from the asset's out-of-service flag and its own or its item's calendar. */
  serviceStatus: MaintenanceStatus;
  /** The asset's calendar date; it follows the item calendar until the asset is inspected individually. */
  nextMaintenanceDue?: string;
  operatingHours?: number;
  currentLocationId?: string;
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

export interface AssetInstanceInput {
  assetCode?: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  conditionStatus?: AssetConditionStatus;
  availabilityStatus?: AssetAvailabilityStatus;
  currentLocationId?: string;
  currentCustodianId?: string;
  operatingHours?: number;
  notes?: string;
  batchCount?: number;
  codePrefix?: string;
  startNumber?: number;
  expectedVersion?: number;
}

import type { EventType } from './event';
