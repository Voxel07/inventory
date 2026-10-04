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
import { noticeText, usePickupNotifications } from '../../hooks/useInbox';
import { useOperationCommand } from '../../hooks/useOperations';
import { translate, useLocalizedText } from '../../utils/naming';
import { OperationForm } from '../operations/OperationForm';
import { StateMessage } from '../common/StateMessage';

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
  const t = useLocalizedText(); const query = useActionInbox(); const command = useOperationCommand();
  const notices = usePickupNotifications(); const navigate = useNavigate();
  const [category, setCategory] = useState<Category>('all'); const [reminder, setReminder] = useState<InboxAction | null>(null);
  const labels: Record<string, string> = { pickup: t('Abholung', 'Pickup'), overdue_return: t('Überfällige Rückgabe', 'Overdue return'), acknowledgement: t('Rückgabeprüfung', 'Return review'), receipt: t('Wareneingang', 'Receipt'), expiring_lot: t('Charge läuft ab', 'Expiring lot'), maintenance: t('Wartung', 'Maintenance'), damage: t('Schadensmeldung', 'Damage report'), collection: t('Beim Anbieter abholen', 'Provider collection'), provider_return: t('An Anbieter zurückgeben', 'Provider return') };
  const now = query.dataUpdatedAt;
  const due = (query.data ?? []).filter(a => !a.remindAt || Date.parse(a.remindAt) <= now);
  const later = (query.data ?? []).filter(a => a.remindAt && Date.parse(a.remindAt) > now);
  const show = (value: Category) => category === 'all' ? value !== 'later' : category === value;
  const loading = query.isLoading || notices.isLoading;
  const failed = query.isError || notices.isError;
  const visibleCount = (show('notices') ? notices.unread.length : 0) + (show('tasks') ? due.length : 0) + (show('later') ? later.length : 0);

  const taskRow = (a: InboxAction) => <ListItem key={a.key} disableGutters sx={rowSx}>
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" useFlexGap sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.title}</Typography>
        <Chip size="small" variant="outlined" color={a.kind === 'overdue_return' ? 'error' : 'default'} label={labels[a.kind] ?? a.kind} />
        {a.due && <Typography variant="caption" color="text.secondary">{t('Fällig', 'Due')}: {a.due}</Typography>}
      </Stack>
      {a.detail && <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere', mt: 0.25 }}>{a.detail}</Typography>}
      {a.remindAt && <Typography variant="caption" color="text.secondary">{t('Erinnerung', 'Reminder')}: {new Date(a.remindAt).toLocaleString()}</Typography>}
    </Box>
    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.25 }}>
      <Button size="small" variant="outlined" component={Link} to={a.path} onClick={onOpenTask}>{t('Öffnen', 'Open')}</Button>
      <IconButton title={t('Später erinnern', 'Remind later')} onClick={() => setReminder(a)}><SnoozeIcon fontSize="small" /></IconButton>
      {a.remindAt && <IconButton title={t('Jetzt anzeigen', 'Show now')} disabled={command.isPending} onClick={() => command.mutate(() => actionInboxApi.remind({ key: a.key, remindAt: null }))}><NotificationsActiveOutlinedIcon fontSize="small" /></IconButton>}
    </Stack>
  </ListItem>;

  return <Stack spacing={2}>
    <ToggleButtonGroup exclusive size="small" value={category} onChange={(_, value: Category | null) => { if (value) setCategory(value); }}
      aria-label={t('Kategorie', 'Category')} sx={{ flexWrap: 'wrap' }}>
      <ToggleButton value="all">{t('Alle', 'All')} ({due.length + notices.unread.length})</ToggleButton>
      <ToggleButton value="notices">{t('Hinweise', 'Notices')} ({notices.unread.length})</ToggleButton>
      <ToggleButton value="tasks">{t('Aufgaben', 'Tasks')} ({due.length})</ToggleButton>
      <ToggleButton value="later">{t('Später', 'Snoozed')} ({later.length})</ToggleButton>
    </ToggleButtonGroup>
    {loading && <LinearProgress aria-label={t('Posteingang wird geladen', 'Loading inbox')} />}
    {failed && <StateMessage kind="error" title={t('Posteingang konnte nicht vollständig geladen werden', 'Could not load the whole inbox')}
      description={t('Prüfe die Verbindung und versuche es erneut.', 'Check your connection and try again.')}
      action={<Button onClick={() => { void query.refetch(); void notices.refetch(); }}>{t('Erneut laden', 'Retry')}</Button>} />}
    {command.error && <StateMessage kind="error" title={t('Erinnerung konnte nicht geändert werden', 'Could not change the reminder')} description={command.error.message} />}
    {!loading && !failed && visibleCount === 0 && <StateMessage kind="done" title={t('Alles erledigt', 'All caught up')}
      description={t('Erledigte Aufgaben verschwinden automatisch.', 'Completed tasks disappear automatically.')} />}

    {show('notices') && notices.unread.length > 0 && <InboxSection title={t('Abholhinweise', 'Pickup notices')} count={notices.unread.length}>
      {notices.unread.map((notification) => {
        const orderCode = noticeText(notification, 'orderCode');
        const details = [noticeText(notification, 'faction'), noticeText(notification, 'pickupLocation')].filter(Boolean).join(' · ');
        return <ListItem key={notification.id} disableGutters sx={rowSx}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{orderCode
              ? t(`Bestellung ${orderCode} ist abholbereit`, `Order ${orderCode} is ready for pickup`)
              : t('Bestellung ist abholbereit', 'Order is ready for pickup')}</Typography>
            {details && <Typography variant="body2" color="text.secondary">{details}</Typography>}
          </Box>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.25 }}>
            {notification.orderId && <Button size="small" variant="outlined" onClick={() => { notices.markRead.mutate([notification.id]); onOpenTask(); navigate(`/orders/faction/${notification.orderId}`); }}>{t('Öffnen', 'Open')}</Button>}
            <IconButton title={translate('Als gelesen markieren', 'Mark as read')} disabled={notices.markRead.isPending} onClick={() => notices.markRead.mutate([notification.id])}><DoneAllIcon fontSize="small" /></IconButton>
          </Stack>
        </ListItem>;
      })}
      {notices.unread.length > 1 && <Button size="small" startIcon={<DoneAllIcon />} disabled={notices.markRead.isPending} sx={{ mt: 1 }}
        onClick={() => notices.markRead.mutate(notices.unread.map((notification) => notification.id))}>{t('Alle als gelesen markieren', 'Mark all as read')}</Button>}
    </InboxSection>}

    {show('tasks') && due.length > 0 && <InboxSection title={t('Aufgaben', 'Tasks')} count={due.length}>{due.map(taskRow)}</InboxSection>}
    {show('later') && later.length > 0 && <InboxSection title={t('Später erinnern', 'Snoozed')} count={later.length}>{later.map(taskRow)}</InboxSection>}

    {reminder && <OperationForm title={t('Erinnerung planen', 'Schedule reminder')} onClose={() => setReminder(null)} fields={[{ key: 'at', label: t('Zeitpunkt (innerhalb 30 Tagen)', 'Time (within 30 days)'), type: 'datetime-local', required: true }]} onSave={v => actionInboxApi.remind({ key: reminder.key, remindAt: new Date(String(v.at)).toISOString() })} />}
  </Stack>;
}
