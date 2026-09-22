export interface StorageLocation {
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
  damaged: number;
  reserved: number;
  available: number;
}

export interface Item {
  id: string;
  sku?: string;
  barcode?: string;
  name: string;
  description?: string;
  amount?: number;
  minStock?: number;
  value: number;
  category: string;
  subcategory?: string;
  supplier?: string;
  visibilityScope?: 'global' | 'event' | 'person' | 'group';
  assignedUserId?: string;
  assignedUserName?: string;
  assignedGroup?: string;
  eventTypes?: EventType[];
  storageLocation: string;
  returnLocation?: string;
  status: ItemStatus;
  images?: string[];
  hint?: string;
  isConsumable?: boolean;
  trackingMode?: 'bulk' | 'serialized' | 'lot_tracked';
  inventoryRole?: 'consumable' | 'returnable' | 'repairable' | 'rental';
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
  maintenanceStatus?: 'certified' | 'due_soon' | 'overdue' | 'in_service';
  created: string;
  updated: string;
  stock?: ItemStock;
  expand?: {
    storageLocation?: StorageLocation;
    returnLocation?: StorageLocation;
    assignedUser?: User;
  };
}

export type ItemStatus = 'available' | 'checked_out' | 'damaged' | 'retired';

export interface ItemFormData {
  name: string;
  description?: string;
  amount?: number;
  minStock: number;
  value: number;
  category: string;
  subcategory?: string;
  supplier?: string;
  visibilityScope?: 'global' | 'event' | 'person' | 'group';
  assignedUserId?: string;
  assignedGroup?: string;
  eventTypes?: EventType[];
  storageLocation: string;
  returnLocation?: string;
  hint?: string;
  isConsumable?: boolean;
  trackingMode?: 'bulk' | 'serialized' | 'lot_tracked';
  inventoryRole?: 'consumable' | 'returnable' | 'repairable' | 'rental';
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
  maintenanceStatus?: 'certified' | 'due_soon' | 'overdue' | 'in_service';
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
  factionOrderId?: string;
  expectedReturnLocationId?: string;
  expectedReturnLocationName?: string;
  placementImage?: string;
  notes?: string;
  status: ReturnSubmissionStatus;
  acknowledgedById?: string;
  acknowledgedByName?: string;
  acknowledgedAt?: string;
  acknowledgementNotes?: string;
}

export interface ReturnSubmissionFormData {
  itemId: string;
  quantity: number;
  assetInstanceId?: string;
  returnedForUserId?: string;
  factionOrderId?: string;
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
  serviceStatus?: 'certified' | 'due_soon' | 'overdue' | 'in_service';
  operatingHours?: number;
  currentLocationId?: string;
  currentLocationName?: string;
  currentCustodianId?: string;
  currentCustodianName?: string;
  notes?: string;
  active: boolean;
  version: number;
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
import type { User } from './user';
