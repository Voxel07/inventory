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
