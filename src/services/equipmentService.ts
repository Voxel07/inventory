import { apiRequest } from './apiClient';

export interface EquipmentCommitment {
  id: string; eventId?: string; eventName?: string; quantity: number; assetIds: string[];
  availableFrom: string; availableUntil: string; pickupDetails: string;
  returnDue?: string; returnDetails?: string; notes: string;
  status: 'active' | 'scheduled' | 'expired' | 'cancelled'; cancellationReason?: string; recordedBy: string;
}
export interface EquipmentProfile {
  itemId: string; ownershipType: 'organization' | 'private_owner' | 'external';
  ownerName?: string; keeperName?: string; keeperContact?: string;
  availabilityPolicy: 'available' | 'commitment_required' | 'unavailable';
  revision: number; commitments: EquipmentCommitment[];
}
export interface EquipmentAvailability { available: number; assetIds: string[]; pickupAllowed: boolean }
const path = (itemId: string) => `/api/items/${itemId}/equipment`;
export const equipmentApi = {
  get: (itemId: string) => apiRequest<EquipmentProfile>(path(itemId)),
  update: (itemId: string, body: unknown) => apiRequest<EquipmentProfile>(path(itemId), { method: 'PUT', body }),
  commit: (itemId: string, body: unknown) => apiRequest<EquipmentProfile>(`${path(itemId)}/commitments`, { method: 'POST', body }),
  cancel: (itemId: string, id: string, body: unknown) => apiRequest<EquipmentProfile>(`${path(itemId)}/commitments/${id}/cancel`, { method: 'POST', body }),
  availability: (eventId?: string) => apiRequest<Record<string, EquipmentAvailability>>('/api/equipment-availability', { query: { eventId } }),
};
