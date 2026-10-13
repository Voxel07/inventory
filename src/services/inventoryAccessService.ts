import { apiRequest } from './apiClient';
import type { AccessGroup, AccessPerson, InventoryAccess, InventoryGrant } from '../types/inventoryAccess';

export const getAccessPeople = () => apiRequest<AccessPerson[]>('/api/access/people');
export const getAccessGroups = () => apiRequest<AccessGroup[]>('/api/access/groups');
export const saveInventoryAccess = (kind: string, id: string, data: { revision: number; grants: InventoryGrant[]; reason: string; ownerId?: string; publicUse?: boolean }) =>
  apiRequest<InventoryAccess>(`/api/access/${kind}/${id}`, { method: 'PUT', body: data });
export const saveAccessGroup = (id: string | undefined, data: { name: string; memberIds: string[]; revision: number; reason: string; adminManaged?: boolean }) =>
  apiRequest<AccessGroup>(id ? `/api/access/groups/${id}` : '/api/access/groups', { method: id ? 'PATCH' : 'POST', body: data });
/** Deletes the group and every share made with it. */
export const deleteAccessGroup = (id: string, data: { revision: number; reason: string }) =>
  apiRequest<void>(`/api/access/groups/${id}/delete`, { method: 'POST', body: data });
