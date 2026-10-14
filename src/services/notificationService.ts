import { apiRequest } from './apiClient';

export type AppNotification = { id: string; type: string; payload: Record<string, unknown>; orderId?: string; createdAt: string; readAt?: string };
export const NOTICE_PAGE_SIZE = 50;
/** One page of unread notices, newest first, paged on the server so read notices never hide older unread ones. */
export function getUnreadNotifications(page: number): Promise<AppNotification[]> {
  return apiRequest('/api/notifications', { query: { unread: true, page, size: NOTICE_PAGE_SIZE } });
}
/** Marks every unread notice up to {@code before} (the newest one shown), including pages not loaded yet. */
export async function markAllNotificationsRead(before?: string): Promise<number> {
  return (await apiRequest<{ count: number }>('/api/notifications/read-all', { method: 'POST', body: { before } })).count;
}
export async function getUnreadNotificationCount(): Promise<number> {
  return (await apiRequest<{ count: number }>('/api/notifications/unread-count')).count;
}
export function markNotificationRead(id: string): Promise<AppNotification> { return apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' }); }
