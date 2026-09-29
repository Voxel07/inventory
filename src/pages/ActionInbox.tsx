import { useState } from 'react';
import { Alert, Button, Card, CardContent, Chip, FormControlLabel, LinearProgress, Stack, Switch, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/apiClient';
import { useActionInbox, type InboxAction } from '../hooks/useActionInbox';
import { useOperationCommand } from '../hooks/useOperations';
import { useLocalizedText } from '../utils/naming';
import { OperationForm } from '../components/operations/OperationForm';

export function ActionInbox() {
  const t = useLocalizedText(); const query = useActionInbox(); const command = useOperationCommand();
  const [showLater, setShowLater] = useState(false); const [reminder, setReminder] = useState<InboxAction | null>(null);
  const labels: Record<string, string> = { pickup: t('Abholung', 'Pickup'), overdue_return: t('Überfällige Rückgabe', 'Overdue return'), acknowledgement: t('Rückgabebestätigung', 'Acknowledgement'), receipt: t('Wareneingang', 'Receipt'), expiring_lot: t('Charge läuft ab', 'Expiring lot'), maintenance: t('Wartung', 'Maintenance'), damage: t('Schadensmeldung', 'Damage report'), collection: t('Beim Anbieter abholen', 'Provider collection'), provider_return: t('An Anbieter zurückgeben', 'Provider return') };
  const now = query.dataUpdatedAt; const rows = (query.data ?? []).filter(a => showLater || !a.remindAt || Date.parse(a.remindAt) <= now);
  return <Stack spacing={2}>
    <Typography variant="h4">{t('Aufgaben & Erinnerungen', 'Actions & reminders')}</Typography>
    <Alert severity="info">{t('Aktuelle Aufgaben für Ihre Zuständigkeit. Erinnerungen erscheinen hier beim nächsten Öffnen oder Aktualisieren. Erledigte Aufgaben verschwinden automatisch.', 'Current tasks for your responsibilities. Reminders reappear here on the next visit or refresh. Completed tasks disappear automatically.')}</Alert>
    <Stack direction="row" spacing={2}><Button onClick={() => void query.refetch()}>{t('Aktualisieren', 'Refresh')}</Button><FormControlLabel label={t('Spätere Erinnerungen anzeigen', 'Show later reminders')} control={<Switch checked={showLater} onChange={(_, v) => setShowLater(v)} />} /></Stack>
    {query.isLoading && <LinearProgress />}{(query.error || command.error) && <Alert severity="error">{(query.error || command.error)?.message}</Alert>}
    {!query.isLoading && !query.error && !rows.length && <Typography>{t('Keine aktuellen Aufgaben.', 'No current actions.')}</Typography>}
    {rows.map(a => <Card key={a.key}><CardContent><Stack spacing={1}>
      <Chip sx={{ alignSelf: 'start' }} label={labels[a.kind] ?? a.kind} />
      <Typography variant="h6">{a.title}</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{a.detail}</Typography>
      {a.due && <Typography>{t('Fällig', 'Due')}: {a.due}</Typography>}
      {a.remindAt && <Typography>{t('Erinnerung', 'Reminder')}: {new Date(a.remindAt).toLocaleString()}</Typography>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component={Link} to={a.path}>{t('Aufgabe öffnen', 'Open task')}</Button><Button onClick={() => setReminder(a)}>{t('Später erinnern', 'Remind me later')}</Button>{a.remindAt && <Button disabled={command.isPending} onClick={() => command.mutate(() => apiRequest('/api/action-inbox/reminder', { method: 'PUT', body: { key: a.key, remindAt: null } }))}>{t('Jetzt anzeigen', 'Show now')}</Button>}</Stack>
    </Stack></CardContent></Card>)}
    {reminder && <OperationForm title={t('Erinnerung planen', 'Schedule reminder')} onClose={() => setReminder(null)} fields={[{ key: 'at', label: t('Zeitpunkt (innerhalb 30 Tagen)', 'Time (within 30 days)'), type: 'datetime-local', required: true }]} onSave={v => apiRequest('/api/action-inbox/reminder', { method: 'PUT', body: { key: reminder.key, remindAt: new Date(String(v.at)).toISOString() } })} />}
  </Stack>;
}
