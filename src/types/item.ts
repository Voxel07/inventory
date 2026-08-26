export interface StorageLocation {
  id: string;
  name: string;
  description?: string;
  area?: string;
  location?: string;
  position?: string;
  created: string;
  updated: string;
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
  qrCode: string;
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
  containerSize?: number;
  containerCount?: number;
  containersOpened?: number;
  containerRemainingPercent?: number;
}

import type { EventType } from './event';
