import { Button, IconButton, ToggleButton } from '../shared/ActionButtons';
import SnoozeIcon from '@mui/icons-material/Snooze';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { useState, type ReactNode } from 'react';
import { Box, Chip, List, ListItem, LinearProgress, Stack, ToggleButtonGroup, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import { actionInboxApi } from '../../services/actionInboxService';
import type { InboxAction } from '../../types/actionInbox';
import { useActionInbox } from '../../hooks/useActionInbox';
import { noticeDetails, notificationPath, notificationTitle, usePickupNotifications } from '../../hooks/useInbox';
import { useOperationCommand } from '../../hooks/useOperations';
import { translate, useT } from '../../utils/naming';
import { OperationForm } from '../operations/OperationForm';
import { StateMessage } from '../common/StateMessage';
import { formatDate, formatDateTime } from '../../utils/dateFormat';

type Category = 'all' | 'notices' | 'tasks' | 'later';

function InboxSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <Box component="section">
    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{title} <Typography component="span" variant="body2" color="text.secondary">({count})</Typography></Typography>
    <List disablePadding>{children}</List>
  </Box>;
}

const rowSx = { py: 1.25, borderBottom: 1, borderColor: 'divider', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'center' } as const;

/** One inbox: pickup notices, due tasks and snoozed reminders as categories. */
export function ActionInboxContent({ onOpenTask }: { onOpenTask: () => void }) {
  const t = useT(); const query = useActionInbox(); const command = useOperationCommand();
  const notices = usePickupNotifications(); const navigate = useNavigate();
  const [category, setCategory] = useState<Category>('all'); const [reminder, setReminder] = useState<InboxAction | null>(null);
  const labels: Record<string, string> = { pickup: t('common.pickup'), overdue_return: t('dialogs.actionInboxContent.overdueReturn'), acknowledgement: t('dialogs.actionInboxContent.returnReview'), receipt: t('dialogs.actionInboxContent.receipt'), expiring_lot: t('dialogs.actionInboxContent.expiringLot'), maintenance: t('enum.reason.maintenance'), damage: t('common.damageReport'), collection: t('dialogs.actionInboxContent.providerCollection'), provider_return: t('dialogs.actionInboxContent.providerReturn') };
  const now = query.dataUpdatedAt;
  const due = (query.data ?? []).filter(a => a.remindAt == null || a.remindAt <= now);
  const later = (query.data ?? []).filter(a => a.remindAt != null && a.remindAt > now);
  const show = (value: Category) => category === 'all' ? value !== 'later' : category === value;
  const loading = query.isLoading || notices.isLoading;
  const failed = query.isError || notices.isError;
  const visibleCount = (show('notices') ? notices.unreadTotal : 0) + (show('tasks') ? due.length : 0) + (show('later') ? later.length : 0);

  const taskRow = (a: InboxAction) => <ListItem key={a.key} disableGutters sx={rowSx}>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{a.title}</Typography>
      <Stack direction="row" useFlexGap sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
        <Chip size="small" variant="outlined" color={a.kind === 'overdue_return' ? 'error' : 'default'} label={labels[a.kind] ?? a.kind} />
        {a.due != null && <Typography variant="caption" color={a.kind === 'overdue_return' ? 'error' : 'text.secondary'}>{t('common.due')}: {formatDate(a.due)}</Typography>}
        {a.detail && <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>· {a.detail}</Typography>}
      </Stack>
      {a.remindAt != null && <Typography variant="caption" color="text.secondary">{t('dialogs.actionInboxContent.reminder')}: {formatDateTime(a.remindAt)}</Typography>}
    </Box>
    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.25 }}>
      <Button size="small" variant="outlined" component={Link} to={a.path} onClick={onOpenTask}>{t('common.open')}</Button>
      <IconButton title={t('dialogs.actionInboxContent.remindLater')} onClick={() => setReminder(a)}><SnoozeIcon fontSize="small" /></IconButton>
      {a.remindAt != null && <IconButton title={t('dialogs.actionInboxContent.showNow')} disabled={command.isPending} onClick={() => command.mutate(() => actionInboxApi.remind({ key: a.key, remindAt: null }))}><NotificationsActiveOutlinedIcon fontSize="small" /></IconButton>}
    </Stack>
  </ListItem>;

  return <Stack spacing={2}>
    {/* Applies to every unread notice up to the newest shown, including pages not loaded yet. */}
    {notices.unreadTotal > 0 && <Button size="small" startIcon={<DoneAllIcon />} sx={{ alignSelf: 'flex-end' }}
      disabled={notices.markAll.isPending || notices.unread.length === 0} onClick={() => notices.markAll.mutate()}>
      {t('dialogs.actionInboxContent.markAllUnreadTotalAsRead', { unreadTotal: String(notices.unreadTotal) })}</Button>}
    <ToggleButtonGroup exclusive size="small" value={category} onChange={(_, value: Category | null) => { if (value) setCategory(value); }}
      aria-label={t('common.category')} sx={{ flexWrap: 'wrap' }}>
      <ToggleButton value="all">{t('common.all')} ({due.length + notices.unreadTotal})</ToggleButton>
      <ToggleButton value="notices">{t('dialogs.actionInboxContent.notices')} ({notices.unreadTotal})</ToggleButton>
      <ToggleButton value="tasks">{t('common.tasks')} ({due.length})</ToggleButton>
      <ToggleButton value="later">{t('dialogs.actionInboxContent.snoozed')} ({later.length})</ToggleButton>
    </ToggleButtonGroup>
    {loading && <LinearProgress aria-label={t('dialogs.actionInboxContent.loadingInbox')} />}
    {failed && <StateMessage kind="error" title={t('dialogs.actionInboxContent.couldNotLoadTheWholeInbox')}
      description={t('common.checkYourConnectionAndTryAgain')}
      action={<Button onClick={() => { void query.refetch(); void notices.refetch(); }}>{t('common.retry')}</Button>} />}
    {command.error && <StateMessage kind="error" title={t('dialogs.actionInboxContent.couldNotChangeTheReminder')} description={command.error.message} />}
    {!loading && !failed && visibleCount === 0 && <StateMessage kind="done" title={t('dialogs.actionInboxContent.allCaughtUp')}
      description={t('dialogs.actionInboxContent.completedTasksDisappearAutomatically')} />}

    {show('notices') && notices.unread.length > 0 && <InboxSection title={t('dialogs.actionInboxContent.notices')} count={notices.unreadTotal}>
      {notices.unread.map((notification) => {
        const path = notificationPath(notification);
        const details = noticeDetails(notification);
        return <ListItem key={notification.id} disableGutters sx={rowSx}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{notificationTitle(notification)}</Typography>
            {details && <Typography variant="body2" color="text.secondary">{details}</Typography>}
          </Box>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.25 }}>
            {path && <Button size="small" variant="outlined" onClick={() => { notices.markRead.mutate([notification.id]); onOpenTask(); navigate(path); }}>{t('common.open')}</Button>}
            <IconButton title={translate('dialogs.actionInboxContent.markAsRead')} disabled={notices.markRead.isPending} onClick={() => notices.markRead.mutate([notification.id])}><DoneAllIcon fontSize="small" /></IconButton>
          </Stack>
        </ListItem>;
      })}
      {notices.hasNextPage && <Box sx={{ mt: 1 }}>
        <Button size="small" variant="outlined" disabled={notices.isFetchingNextPage} onClick={() => { void notices.fetchNextPage(); }}
          aria-label={t('dialogs.actionInboxContent.loadMoreNoticesUnreadCountOfUnreadTotalShown', { unreadCount: String(notices.unread.length), unreadTotal: String(notices.unreadTotal) })}>
          {t('dialogs.actionInboxContent.loadMoreNotices')} ({notices.unread.length}/{notices.unreadTotal})</Button>
      </Box>}
    </InboxSection>}

    {show('tasks') && due.length > 0 && <InboxSection title={t('common.tasks')} count={due.length}>{due.map(taskRow)}</InboxSection>}
    {show('later') && later.length > 0 && <InboxSection title={t('dialogs.actionInboxContent.snoozed2')} count={later.length}>{later.map(taskRow)}</InboxSection>}

    {reminder && <OperationForm title={t('dialogs.actionInboxContent.scheduleReminder')} onClose={() => setReminder(null)} fields={[{ key: 'at', label: t('dialogs.actionInboxContent.timeWithin30Days'), type: 'datetime-local', required: true }]} onSave={v => actionInboxApi.remind({ key: reminder.key, remindAt: Number(v.at) })} />}
  </Stack>;
}
