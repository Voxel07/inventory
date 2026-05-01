import type { Item } from './item';

export interface Assembly {
  id: string;
  name: string;
  itemIds: string[];
  itemQuantities: Record<string, number>;
  description: string;
  created: string;
  updated: string;
  expand?: {
    itemIds?: Item[];
  };
}

export interface AssemblyFormData {
  name: string;
  itemIds: string[];
  itemQuantities: Record<string, number>;
  description: string;
}
