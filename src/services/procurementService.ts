import { apiRequest } from './apiClient';

export type ProcurementDeficit = {
  itemId: string;
  sku: string;
  name: string;
  category: string;
  supplier: string;
  classification: 'consumable' | 'asset';
  demand: number;
  physicalStock: number;
  availableStock: number;
  reservedStock: number;
  netDeficit: number;
  recommendedAction: 'purchase' | 'rent_or_purchase';
};

export function getProcurementDeficits(eventOccurrenceId?: string): Promise<ProcurementDeficit[]> {
  return apiRequest('/api/procurement/deficits', { query: { eventOccurrenceId } });
}
