import { apiRequest } from './apiClient';

export type AppNotification = { id: string; type: string; payload: Record<string, unknown>; orderId?: string; createdAt: string; readAt?: string };
export function getNotifications(): Promise<AppNotification[]> { return apiRequest('/api/notifications'); }
export function markNotificationRead(id: string): Promise<AppNotification> { return apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' }); }
