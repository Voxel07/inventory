import { apiRequest } from './apiClient';

export type OrderKind = 'faction' | 'general';
export type PickupAssignment = { responsiblePersonId: string | null; groupName: string; pickupLocationId: string | null };
export type PickupLine = { itemId: string; name: string; ordered: number; prepared: number };
export type PickupGroup = { key: string; name: string; responsiblePersonId?: string; responsiblePersonName?: string; pickupLocationId?: string; pickupLocationName?: string; items: PickupLine[] };
export type PickupPlan = { orderName: string; status: string; canEdit: boolean; pickupPointsComplete: boolean; groups: PickupGroup[] };
export type ItemResponsibility = { responsiblePersonId?: string; responsiblePersonName?: string };
const path = (kind: OrderKind, id: string) => `/api/${kind === 'faction' ? 'orders' : 'general-orders'}/${id}/pickup-groups`;
export const orderPickupApi = {
  get: (kind: OrderKind, id: string): Promise<PickupPlan> => apiRequest(path(kind, id)),
  save: (kind: OrderKind, id: string, assignments: Record<string, PickupAssignment>): Promise<PickupPlan> => apiRequest(path(kind, id), { method: 'PATCH', body: { assignments } }),
  notify: (kind: OrderKind, id: string): Promise<number> => apiRequest(`${path(kind, id)}/notify`, { method: 'POST' }),
  responsibility: (id: string): Promise<ItemResponsibility> => apiRequest(`/api/items/${id}/responsibility`),
  setResponsibility: (id: string, responsiblePersonId: string | null): Promise<ItemResponsibility> => apiRequest(`/api/items/${id}/responsibility`, { method: 'PATCH', body: { responsiblePersonId } }),
};
