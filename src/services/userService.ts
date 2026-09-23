import type { User, UserPermissionsFormData } from '../types';
import { apiRequest, subscribeToApiChanges } from './apiClient';

export function getUsers(query?: { page?: number; size?: number }): Promise<User[]> { return apiRequest('/api/users', { query }); }
export function updateUserPermissions(userId: string, data: UserPermissionsFormData): Promise<User> { return apiRequest(`/api/users/${userId}`, { method: 'PATCH', body: data }); }
export function getAssignableUsers(query?: { page?: number; size?: number }): Promise<User[]> { return apiRequest('/api/users/assignable', { query }); }
export function subscribeToUsers(callback: () => void) { return subscribeToApiChanges(callback); }
