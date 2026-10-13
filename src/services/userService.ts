import type { User, UserRole } from '../types';
import { apiRequest } from './apiClient';

export function getUsers(query?: { page?: number; size?: number }): Promise<User[]> { return apiRequest('/api/users', { query }); }
/** Inventory admin only: role and faction memberships are managed in the app; Authentik only grants access. */
export function updateUserAccess(id: string, data: { roles: UserRole[]; factions: string[]; revision: number; reason: string }): Promise<User> {
  return apiRequest(`/api/users/${id}`, { method: 'PATCH', body: data });
}
export function getAssignableUsers(query?: { page?: number; size?: number }): Promise<User[]> { return apiRequest('/api/users/assignable', { query }); }
