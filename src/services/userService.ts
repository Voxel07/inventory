import type { User, UserPermissionsFormData } from '../types';
import { apiRequest, subscribeToApiChanges } from './apiClient';

export function getUsers(): Promise<User[]> { return apiRequest('/api/users'); }
export function updateUserPermissions(userId: string, data: UserPermissionsFormData): Promise<User> { return apiRequest(`/api/users/${userId}`, { method: 'PATCH', body: data }); }
export function subscribeToUsers(callback: () => void) { return subscribeToApiChanges(callback); }
