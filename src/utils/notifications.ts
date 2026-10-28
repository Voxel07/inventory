import type { AppNotification } from '../services/notificationService';

export function noticeText(notification: AppNotification, key: string): string | undefined {
  const value = notification.payload[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Secondary line of a notice: order context, the request source of an item someone asked for, or why a request was declined. */
export function noticeDetails(notification: AppNotification): string {
  const keys = notification.type === 'item_requested' ? ['reference']
    : notification.type === 'item_request_declined' ? ['reason', 'reference'] : ['faction', 'groupNames', 'pickupLocation'];
  return keys.map((key) => noticeText(notification, key)).filter(Boolean).join(' · ');
}

export function notificationPath(notification: AppNotification): string | undefined {
  const path = noticeText(notification, 'path');
  if (notification.type === 'action_reminder' || notification.type === 'action_digest') return '/';
  if (path?.startsWith('/orders?') || path?.startsWith('/items/')) return path;
  return notification.orderId ? `/orders/faction/${notification.orderId}` : undefined;
}
