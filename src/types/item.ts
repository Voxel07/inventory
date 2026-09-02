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

export interface Item {
  id: string;
  sku?: string;
  name: string;
  amount?: number;
  minStock?: number;
  value: number;
  category: string;
  subcategory?: string;
  supplier?: string;
  eventTypes?: EventType[];
  storageLocation: string;
  status: ItemStatus;
  images?: string[];
  hint?: string;
  isConsumable?: boolean;
  containerSize?: number;
  containerCount?: number;
  containersOpened?: number;
  containerRemainingPercent?: number;
  maintenanceIntervalDays?: number;
  nextMaintenanceDue?: string;
  currentOperatingHours?: number;
  maintenanceStatus?: 'certified' | 'due_soon' | 'overdue' | 'in_service';
  created: string;
  updated: string;
  expand?: {
    storageLocation?: StorageLocation;
  };
}

export type ItemStatus = 'available' | 'checked_out' | 'damaged' | 'retired';

export interface ItemFormData {
  name: string;
  amount?: number;
  minStock: number;
  value: number;
  category: string;
  subcategory?: string;
  supplier?: string;
  eventTypes?: EventType[];
  storageLocation: string;
  hint?: string;
  isConsumable?: boolean;
  imageFiles?: File[];
  removeImages?: string[];
  containerSize?: number;
  containerCount?: number;
  containersOpened?: number;
  containerRemainingPercent?: number;
  maintenanceIntervalDays?: number;
  nextMaintenanceDue?: string;
  currentOperatingHours?: number;
  maintenanceStatus?: 'certified' | 'due_soon' | 'overdue' | 'in_service';
}

import type { EventType } from './event';
