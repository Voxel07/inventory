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
  name: string;
  amount?: number;
  minStock?: number;
  value: number;
  category: string;
  subcategory?: string;
  eventTypes?: EventType[];
  storageLocation: string;
  status: ItemStatus;
  images?: string[];
  hint?: string;
  containerSize?: number;
  containerCount?: number;
  containersOpened?: number;
  containerRemainingPercent?: number;
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
  eventTypes?: EventType[];
  storageLocation: string;
  hint?: string;
  imageFiles?: File[];
  removeImages?: string[];
  containerSize?: number;
  containerCount?: number;
  containersOpened?: number;
  containerRemainingPercent?: number;
}

import type { EventType } from './event';
