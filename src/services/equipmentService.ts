import { apiRequest } from './apiClient';

import type { EquipmentProfile, EquipmentAvailability, EquipmentProfileInput, EquipmentCommitmentInput, EquipmentCancelInput } from '../types/equipment';

const path = (itemId: string) => `/api/items/${itemId}/equipment`;
export const equipmentApi = {
  get: (itemId: string) => apiRequest<EquipmentProfile>(path(itemId)),
  update: (itemId: string, body: EquipmentProfileInput) => apiRequest<EquipmentProfile>(path(itemId), { method: 'PUT', body }),
  commit: (itemId: string, body: EquipmentCommitmentInput) => apiRequest<EquipmentProfile>(`${path(itemId)}/commitments`, { method: 'POST', body }),
  cancel: (itemId: string, id: string, body: EquipmentCancelInput) => apiRequest<EquipmentProfile>(`${path(itemId)}/commitments/${id}/cancel`, { method: 'POST', body }),
  availability: (eventId?: string) => apiRequest<Record<string, EquipmentAvailability>>('/api/equipment-availability', { query: { eventId } }),
};
