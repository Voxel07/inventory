import type { User, UserRole } from '../types';
import { apiPage, apiRequest } from './apiClient';
import type { Page } from './apiPagination';
import type { UserAccessHistoryEntry } from '../types/user';

export function getUsers(page: number, size: number, search?: string, role?: UserRole): Promise<Page<User>> {
  return apiPage('/api/users', page, size, { query: { search, role } });
}

export function getUserAccessHistory(id: string, page: number, size: number): Promise<Page<UserAccessHistoryEntry>> {
  return apiPage(`/api/users/${id}/history`, page, size);
}
/** Inventory admin only: role and faction memberships are managed in the app; Authentik only grants access. */
export function updateUserAccess(id: string, data: { roles: UserRole[]; factions: string[]; revision: number; reason: string }): Promise<User> {
  return apiRequest(`/api/users/${id}`, { method: 'PATCH', body: data });
}
