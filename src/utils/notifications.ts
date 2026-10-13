import type { AppNotification } from '../services/notificationService';

export function noticeText(notification: AppNotification, key: string): string | undefined {
  const value = notification.payload[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Secondary line of a notice: order context, or the request source of an item someone asked for. */
export function noticeDetails(notification: AppNotification): string {
  const keys = notification.type === 'item_requested' ? ['reference'] : ['faction', 'groupNames', 'pickupLocation'];
  return keys.map((key) => noticeText(notification, key)).filter(Boolean).join(' · ');
}

export function notificationPath(notification: AppNotification): string | undefined {
  const path = noticeText(notification, 'path');
  if (path?.startsWith('/orders?') || path?.startsWith('/items/')) return path;
  return notification.orderId ? `/orders/faction/${notification.orderId}` : undefined;
}
