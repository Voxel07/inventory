import type { User } from '../types';
import { apiRequest } from './apiClient';

export function getUsers(query?: { page?: number; size?: number }): Promise<User[]> { return apiRequest('/api/users', { query }); }
export function getAssignableUsers(query?: { page?: number; size?: number }): Promise<User[]> { return apiRequest('/api/users/assignable', { query }); }
