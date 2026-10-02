import { Button, IconButton } from '../shared/ActionButtons';
import SnoozeIcon from '@mui/icons-material/Snooze';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { useState } from 'react';
import { Alert, Box, Chip, List, ListItem, FormControlLabel, LinearProgress, Stack, Switch, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { actionInboxApi } from '../../services/actionInboxService';
import type { InboxAction } from '../../types/actionInbox';
import { useActionInbox } from '../../hooks/useActionInbox';
import { useOperationCommand } from '../../hooks/useOperations';
import { translate, useLocalizedText } from '../../utils/naming';
import { OperationForm } from '../operations/OperationForm';

export function ActionInboxContent({ onOpenTask }: { onOpenTask: () => void }) {
  const t = useLocalizedText(); const query = useActionInbox(); const command = useOperationCommand();
  const [showLater, setShowLater] = useState(false); const [reminder, setReminder] = useState<InboxAction | null>(null);
  const labels: Record<string, string> = { pickup: t('Abholung', 'Pickup'), overdue_return: t('Überfällige Rückgabe', 'Overdue return'), acknowledgement: t('Rückgabebestätigung', 'Acknowledgement'), receipt: t('Wareneingang', 'Receipt'), expiring_lot: t('Charge läuft ab', 'Expiring lot'), maintenance: t('Wartung', 'Maintenance'), damage: t('Schadensmeldung', 'Damage report'), collection: t('Beim Anbieter abholen', 'Provider collection'), provider_return: t('An Anbieter zurückgeben', 'Provider return') };
  const now = query.dataUpdatedAt; const rows = (query.data ?? []).filter(a => showLater || !a.remindAt || Date.parse(a.remindAt) <= now);
  return <Stack spacing={1}>
    <Typography variant="caption" color="text.secondary">{t('Erledigte Aufgaben verschwinden automatisch.', 'Completed tasks disappear automatically.')}</Typography>
    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center', justifyContent: 'space-between' }}><Button size="small" title={translate('Aufgaben und Erinnerungen aktualisieren', 'Refresh actions and reminders')} onClick={() => void query.refetch()}>{t('Aktualisieren', 'Refresh')}</Button><FormControlLabel label={t('Spätere Erinnerungen anzeigen', 'Show later reminders')} control={<Switch size="small" checked={showLater} onChange={(_, v) => setShowLater(v)} />} /></Stack>
    {query.isLoading && <LinearProgress />}{(query.error || command.error) && <Alert severity="error">{(query.error || command.error)?.message}</Alert>}
    {!query.isLoading && !query.error && !rows.length && <Typography>{t('Keine aktuellen Aufgaben.', 'No current actions.')}</Typography>}
    <List dense disablePadding>{rows.map(a => <ListItem key={a.key} disableGutters sx={{ py: 1, borderBottom: 1, borderColor: 'divider', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" useFlexGap sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}><Typography variant="body2" sx={{ fontWeight: 600 }}>{a.title}</Typography><Chip size="small" variant="outlined" color={a.kind === 'overdue_return' ? 'error' : 'default'} label={labels[a.kind] ?? a.kind} />{a.due && <Chip size="small" variant="outlined" label={`${t('Fällig', 'Due')}: ${a.due}`} />}</Stack>
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere', mt: 0.25 }}>{a.detail}</Typography>
        {a.remindAt && <Typography variant="caption" color="text.secondary">{t('Erinnerung', 'Reminder')}: {new Date(a.remindAt).toLocaleString()}</Typography>}
      </Box>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.25, '& .MuiButton-root': { px: 1, py: 0.25, minHeight: 32, textTransform: 'none' } }}>
          <Button size="small" title={translate('Die zugehörige Aufgabe öffnen', 'Open the related task')} component={Link} to={a.path} onClick={onOpenTask}>{t('Öffnen', 'Open')}</Button>
          <IconButton size="small" title={t('Später erinnern', 'Remind later')} onClick={() => setReminder(a)}><SnoozeIcon fontSize="small" /></IconButton>
          {a.remindAt && <IconButton size="small" title={t('Jetzt anzeigen', 'Show now')} disabled={command.isPending} onClick={() => command.mutate(() => actionInboxApi.remind({ key: a.key, remindAt: null }))}><NotificationsActiveOutlinedIcon fontSize="small" /></IconButton>}
        </Stack>
    </ListItem>)}</List>
    {reminder && <OperationForm title={t('Erinnerung planen', 'Schedule reminder')} onClose={() => setReminder(null)} fields={[{ key: 'at', label: t('Zeitpunkt (innerhalb 30 Tagen)', 'Time (within 30 days)'), type: 'datetime-local', required: true }]} onSave={v => actionInboxApi.remind({ key: reminder.key, remindAt: new Date(String(v.at)).toISOString() })} />}
  </Stack>;
}
