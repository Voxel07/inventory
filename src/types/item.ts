export interface Item {
  id: string;
  name: string;
  amount: number;
  minStock?: number;
  value: number;
  category: string;
  storageLocation: string;
  position: string;
  location: string;
  status: ItemStatus;
  qrCode: string;
  containerSize?: number;
  containerCount?: number;
  containersOpened?: number;
  containerRemainingPercent?: number;
  created: string;
  updated: string;
}

export type ItemStatus = 'available' | 'checked_out' | 'damaged' | 'retired';

export interface ItemFormData {
  name: string;
  amount: number;
  minStock: number;
  value: number;
  category: string;
  storageLocation: string;
  position: string;
  location: string;
  containerSize?: number;
  containerCount?: number;
  containersOpened?: number;
  containerRemainingPercent?: number;
}
