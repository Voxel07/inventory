import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotifications, markNotificationRead, type AppNotification } from '../services/notificationService';
import { useUIStore } from '../store/uiStore';
import { translate } from '../utils/naming';
import { useActionInbox } from './useActionInbox';

const NOTIFICATIONS_KEY = ['notifications'];

/** Pickup notices are one inbox category alongside tasks and reminders. */
export function usePickupNotifications() {
  const queryClient = useQueryClient();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const query = useQuery({ queryKey: NOTIFICATIONS_KEY, queryFn: getNotifications, refetchInterval: 60_000 });
  const unread = (query.data ?? []).filter((notification) => !notification.readAt);
  const markRead = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(markNotificationRead)),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      const previous = queryClient.getQueryData<AppNotification[]>(NOTIFICATIONS_KEY);
      const readAt = new Date().toISOString();
      queryClient.setQueryData<AppNotification[]>(NOTIFICATIONS_KEY, (current = []) =>
        current.map((notification) => ids.includes(notification.id) ? { ...notification, readAt } : notification),
      );
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(NOTIFICATIONS_KEY, context.previous);
      showSnackbar(translate('Abholhinweis konnte nicht ausgeblendet werden', 'Could not dismiss pickup notice'), 'error');
    },
    onSettled: (_data, error) => { if (error) void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }); },
  });
  return { ...query, unread, markRead };
}

/** Number of inbox entries that currently need attention: due tasks plus unread notices. */
export function useInboxCount() {
  const inbox = useActionInbox();
  const notices = useQuery({ queryKey: NOTIFICATIONS_KEY, queryFn: getNotifications, refetchInterval: 60_000 });
  const dueActions = (inbox.data ?? []).filter((action) => !action.remindAt || Date.parse(action.remindAt) <= inbox.dataUpdatedAt).length;
  const unreadNotices = (notices.data ?? []).filter((notification) => !notification.readAt).length;
  return dueActions + unreadNotices;
}

export function noticeText(notification: AppNotification, key: string): string | undefined {
  const value = notification.payload[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function notificationPath(notification: AppNotification): string | undefined {
  const path = noticeText(notification, 'path');
  return path?.startsWith('/orders?') ? path : notification.orderId ? `/orders/faction/${notification.orderId}` : undefined;
}

export function notificationTitle(notification: AppNotification): string {
  const name = noticeText(notification, 'orderCode');
  if (notification.type === 'order_items_assigned') return name
    ? translate(`Artikel für Bestellung ${name} vorbereiten`, `Prepare items for order ${name}`)
    : translate('Bestellte Artikel vorbereiten', 'Prepare ordered items');
  if (notification.type === 'order_group_ready') return name
    ? translate(`Ihre Artikel für Bestellung ${name} sind abholbereit`, `Your items for order ${name} are ready for pickup`)
    : translate('Ihre Artikel sind abholbereit', 'Your items are ready for pickup');
  return name ? translate(`Bestellung ${name} ist abholbereit`, `Order ${name} is ready for pickup`)
    : translate('Bestellung ist abholbereit', 'Order is ready for pickup');
}
