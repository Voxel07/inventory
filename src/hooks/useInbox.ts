import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { getUnreadNotificationCount, getUnreadNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from '../services/notificationService';
import type { Page } from '../services/apiPagination';
import { useUIStore } from '../store/uiStore';
import { translate } from '../utils/naming';
import { useActionInbox } from './useActionInbox';

const NOTIFICATIONS_KEY = ['notifications', 'unread'];
const UNREAD_COUNT_KEY = ['notifications', 'unread-count'];

function useUnreadNoticeCount() {
  return useQuery({ queryKey: UNREAD_COUNT_KEY, queryFn: getUnreadNotificationCount, refetchInterval: 60_000 });
}

/** Pickup notices are one inbox category alongside tasks and reminders. */
export function usePickupNotifications() {
  const queryClient = useQueryClient();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const query = useInfiniteQuery({
    queryKey: NOTIFICATIONS_KEY, initialPageParam: 0, refetchInterval: 60_000,
    queryFn: ({ pageParam }) => getUnreadNotifications(pageParam),
    getNextPageParam: (last) => last.more ? last.page + 1 : undefined,
  });
  const count = useUnreadNoticeCount();
  // Pages can overlap after a notice is read between page loads; keep one row per notice.
  const unread = [...new Map((query.data?.pages ?? []).flatMap((page) => page.rows).filter((notification) => !notification.readAt)
    .map((notification) => [notification.id, notification])).values()];
  // Total unread on the server; the list holds the newest page of them.
  const unreadTotal = Math.max(unread.length, count.data ?? 0);
  const markRead = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(markNotificationRead)),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      const previous = queryClient.getQueryData<InfiniteData<Page<AppNotification>, number>>(NOTIFICATIONS_KEY);
      const readAt = new Date().toISOString();
      queryClient.setQueryData<InfiniteData<Page<AppNotification>, number>>(NOTIFICATIONS_KEY, (current) => current && ({
        ...current,
        pages: current.pages.map((page) => ({ ...page, rows: page.rows.map((notification) => ids.includes(notification.id) ? { ...notification, readAt } : notification) })),
      }));
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(NOTIFICATIONS_KEY, context.previous);
      showSnackbar(translate('Abholhinweis konnte nicht ausgeblendet werden', 'Could not dismiss pickup notice'), 'error');
    },
    // Refetch so older unread notices move into the page and the total stays exact.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(unread[0]?.createdAt),
    onError: () => showSnackbar(translate('Hinweise konnten nicht ausgeblendet werden', 'Could not dismiss notices'), 'error'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  return { ...query, unread, unreadTotal, markRead, markAll };
}

/** Number of inbox entries that currently need attention: due tasks plus unread notices. */
export function useInboxCount() {
  const inbox = useActionInbox();
  const notices = useUnreadNoticeCount();
  const dueActions = (inbox.data ?? []).filter((action) => !action.remindAt || Date.parse(action.remindAt) <= inbox.dataUpdatedAt).length;
  return dueActions + (notices.data ?? 0);
}

export { noticeDetails, noticeText, notificationPath } from '../utils/notifications';
import { noticeText } from '../utils/notifications';

export function notificationTitle(notification: AppNotification): string {
  if (notification.type === 'item_requested') {
    const item = noticeText(notification, 'itemName') ?? translate('Ihr Artikel', 'your item');
    const requester = noticeText(notification, 'requesterName');
    return requester
      ? translate(`${requester} hat ${item} angefragt`, `${requester} requested ${item}`)
      : translate(`${item} wurde angefragt`, `${item} was requested`);
  }
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
