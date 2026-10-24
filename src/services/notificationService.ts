import { apiPage, apiRequest } from './apiClient';
import type { Page } from './apiPagination';

export type AppNotification = { id: string; type: string; payload: Record<string, unknown>; orderId?: string; createdAt: number; readAt?: number };
export const NOTICE_PAGE_SIZE = 50;
/** One page of unread notices, newest first, paged on the server so read notices never hide older unread ones. */
export function getUnreadNotifications(page: number): Promise<Page<AppNotification>> {
  return apiPage('/api/notifications', page, NOTICE_PAGE_SIZE, { query: { unread: true } });
}
/** Marks every unread notice up to {@code before} (the newest one shown), including pages not loaded yet. */
export async function markAllNotificationsRead(before?: number): Promise<number> {
  return (await apiRequest<{ count: number }>('/api/notifications/read-all', { method: 'POST', body: { before } })).count;
}
export async function getUnreadNotificationCount(): Promise<number> {
  return (await apiRequest<{ count: number }>('/api/notifications/unread-count')).count;
}
export function markNotificationRead(id: string): Promise<AppNotification> { return apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' }); }

/** {@code ntfyServer} is null while ntfy delivery is not configured for this deployment. */
export type NotificationSettings = { ntfyServer: string | null; ntfyTopic: string | null; webhookUrl: string | null };
export function getNotificationSettings(): Promise<NotificationSettings> { return apiRequest('/api/notifications/settings'); }
/** Sets the current user's personal ntfy topic and webhook URL; null clears one. */
export function updateNotificationSettings(input: { ntfyTopic: string | null; webhookUrl: string | null }): Promise<NotificationSettings> {
  return apiRequest('/api/notifications/settings', { method: 'PUT', body: input });
}
/** Publishes a test message to the current user's saved ntfy topic. */
export async function sendNtfyTest(): Promise<void> { await apiRequest('/api/notifications/settings/ntfy-test', { method: 'POST' }); }
