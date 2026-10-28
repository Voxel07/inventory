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
  const unread = [...new Map((query.data?.pages ?? []).flatMap((page) => page.rows).filter((notification) => notification.readAt == null)
    .map((notification) => [notification.id, notification])).values()];
  // Total unread on the server; the list holds the newest page of them.
  const unreadTotal = Math.max(unread.length, count.data ?? 0);
  const markRead = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(markNotificationRead)),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      const previous = queryClient.getQueryData<InfiniteData<Page<AppNotification>, number>>(NOTIFICATIONS_KEY);
      const readAt = Date.now();
      queryClient.setQueryData<InfiniteData<Page<AppNotification>, number>>(NOTIFICATIONS_KEY, (current) => current && ({
        ...current,
        pages: current.pages.map((page) => ({ ...page, rows: page.rows.map((notification) => ids.includes(notification.id) ? { ...notification, readAt } : notification) })),
      }));
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(NOTIFICATIONS_KEY, context.previous);
      showSnackbar(translate('hooks.useInbox.couldNotDismissPickupNotice'), 'error');
    },
    // Refetch so older unread notices move into the page and the total stays exact.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(unread[0]?.createdAt),
    onError: () => showSnackbar(translate('hooks.useInbox.couldNotDismissNotices'), 'error'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  return { ...query, unread, unreadTotal, markRead, markAll };
}

/** Number of inbox entries that currently need attention: due tasks plus unread notices. */
export function useInboxCount() {
  const inbox = useActionInbox();
  const notices = useUnreadNoticeCount();
  const dueActions = (inbox.data ?? []).filter((action) => action.remindAt == null || action.remindAt <= inbox.dataUpdatedAt).length;
  return dueActions + (notices.data ?? 0);
}

export { noticeDetails, noticeText, notificationPath } from '../utils/notifications';
import { noticeText } from '../utils/notifications';

export function notificationTitle(notification: AppNotification): string {
  if (notification.type === "action_reminder" || notification.type === "action_digest") return translate("review.taskReminder");
  if (notification.type === 'item_request_declined') {
    const name = noticeText(notification, 'requestName');
    return name ? translate('itemRequests.notificationTitle', { name: name }) : translate('itemRequests.notificationGeneric');
  }
  if (notification.type === 'item_requested') {
    const item = noticeText(notification, 'itemName') ?? translate('hooks.useInbox.yourItem');
    const requester = noticeText(notification, 'requesterName');
    return requester
      ? translate('hooks.useInbox.requesterRequestedItem', { requester: requester, item: item })
      : translate('hooks.useInbox.itemWasRequested', { item: item });
  }
  const name = noticeText(notification, 'orderCode');
  if (notification.type === 'order_items_assigned') return name
    ? translate('hooks.useInbox.prepareItemsForOrderName', { name: name })
    : translate('hooks.useInbox.prepareOrderedItems');
  if (notification.type === 'order_group_ready') return name
    ? translate('hooks.useInbox.yourItemsForOrderNameAreReadyForPickup', { name: name })
    : translate('hooks.useInbox.yourItemsAreReadyForPickup');
  return name ? translate('hooks.useInbox.orderNameIsReadyForPickup', { name: name })
    : translate('header.orderReadyGeneric');
}
