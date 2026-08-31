import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import { useEventReport, useUpdateEventReport } from '../hooks/useEvents';
import { useItems } from '../hooks/useItems';
import { EVENT_TYPES, type EventReportStatus, type EventType } from '../types';
import { useAppLanguage, useTranslate } from '../utils/naming';
import { useUIStore } from '../store/uiStore';

type QuantityInputs = Record<string, string>;

function toInputs(values: Record<string, number> | undefined): QuantityInputs {
  return Object.fromEntries(Object.entries(values ?? {}).map(([id, value]) => [id, String(value)]));
}

function toQuantities(values: QuantityInputs): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([id, value]) => [id, Number(value)] as const)
      .filter(([, value]) => Number.isFinite(value) && value >= 0),
  );
}

export function EventDetail() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const t = useTranslate();
  const language = useAppLanguage();
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const { data: report, isLoading, isError } = useEventReport(reportId);
  const { data: items = [] } = useItems();
  const updateReport = useUpdateEventReport();
  const [editing, setEditing] = useState(false);
  const [eventType, setEventType] = useState<EventType>('DE');
  const [eventDate, setEventDate] = useState('');
  const [status, setStatus] = useState<EventReportStatus>('completed');
  const [planned, setPlanned] = useState<QuantityInputs>({});
  const [used, setUsed] = useState<QuantityInputs>({});
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');

  function resetForm() {
    if (!report) return;
    setEventType(report.eventType);
    setEventDate(report.eventDate.slice(0, 10));
    setStatus(report.status);
    setPlanned(toInputs(report.plannedQuantities));
    setUsed(toInputs(report.usedQuantities));
    setNotes(report.notes ?? '');
    setSearch('');
  }

  useEffect(() => {
    resetForm();
  }, [report?.id, report?.updated]);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const recordedIds = useMemo(() => new Set([
    ...Object.keys(planned),
    ...Object.keys(used),
  ]), [planned, used]);
  const missingItemIds = useMemo(
    () => [...recordedIds].filter((id) => !itemMap.has(id) && (Number(planned[id]) > 0 || Number(used[id]) > 0)),
    [itemMap, planned, recordedIds, used],
  );
  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return items
      .filter((item) => {
        const isRecorded = Number(planned[item.id]) > 0 || Number(used[item.id]) > 0 || recordedIds.has(item.id);
        if (isRecorded) return true;
        if (!editing) return false;
        if (term) return `${item.name} ${item.category} ${item.subcategory ?? ''}`.toLocaleLowerCase().includes(term);
        return item.eventTypes?.includes(eventType);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [editing, eventType, items, planned, recordedIds, search, used]);

  const plannedQuantities = toQuantities(planned);
  const usedQuantities = toQuantities(used);
  const plannedTotal = Object.values(plannedQuantities).reduce((sum, value) => sum + value, 0);
  const usedTotal = Object.values(usedQuantities).reduce((sum, value) => sum + value, 0);
  const usedLines = Object.values(usedQuantities).filter((value) => value > 0).length;

  function cancelEditing() {
    resetForm();
    setEditing(false);
  }

  function save() {
    if (!report || !eventDate) return;
    const knownItemIds = [...new Set([
      ...Object.keys(plannedQuantities),
      ...Object.keys(usedQuantities),
    ])].filter((id) => itemMap.has(id));
    updateReport.mutate({
      id: report.id,
      data: {
        eventType,
        eventDate: new Date(`${eventDate}T12:00:00.000Z`).toISOString(),
        status,
        itemIds: knownItemIds,
        plannedQuantities,
        usedQuantities,
        notes: notes.trim(),
      },
    }, {
      onSuccess: () => {
        setEditing(false);
        showSnackbar(t('Eventbericht korrigiert', 'Event report corrected'), 'success');
      },
      onError: (error) => showSnackbar(
        error instanceof Error ? error.message : t('Eventbericht konnte nicht gespeichert werden', 'Could not save event report'),
        'error',
      ),
    });
  }

  if (isLoading) return <LinearProgress />;
  if (isError || !report) {
    return (
      <Alert severity="error" action={<Button color="inherit" onClick={() => navigate('/events')}>{t('Zur Übersicht', 'Back to overview')}</Button>}>
        {t('Eventbericht nicht gefunden.', 'Event report not found.')}
      </Alert>
    );
  }

  const locale = language === 'de' ? 'de-DE' : 'en-US';

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/events')} sx={{ mb: 1 }}>
        {t('Zum Eventverlauf', 'Back to event history')}
      </Button>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between' }}>
        <Box>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h4">{report.eventType === 'LS' ? 'LightSim' : report.eventType}</Typography>
            <Chip
              size="small"
              color={report.status === 'completed' ? 'success' : 'info'}
              label={report.status === 'completed' ? t('Abgeschlossen', 'Completed') : t('Geplant', 'Planned')}
            />
          </Stack>
          <Typography color="text.secondary">{new Date(report.eventDate).toLocaleDateString(locale)}</Typography>
        </Box>
        {!editing ? (
          <Button variant="contained" startIcon={<EditIcon />} onClick={() => setEditing(true)} sx={{ alignSelf: { sm: 'flex-start' } }}>
            {t('Event korrigieren', 'Correct event')}
          </Button>
        ) : (
          <Stack direction="row" spacing={1}>
            <Button startIcon={<CloseIcon />} onClick={cancelEditing}>{t('Abbrechen', 'Cancel')}</Button>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={updateReport.isPending || !eventDate}>
              {t('Änderungen speichern', 'Save changes')}
            </Button>
          </Stack>
        )}
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, mb: 3 }}>
        <Paper sx={{ p: 2 }}><Typography variant="caption" color="text.secondary">{t('Positionen verwendet', 'Lines used')}</Typography><Typography variant="h5">{usedLines}</Typography></Paper>
        <Paper sx={{ p: 2 }}><Typography variant="caption" color="text.secondary">{t('Gesamt geplant', 'Total planned')}</Typography><Typography variant="h5">{plannedTotal}</Typography></Paper>
        <Paper sx={{ p: 2 }}><Typography variant="caption" color="text.secondary">{t('Gesamt verwendet', 'Total used')}</Typography><Typography variant="h5">{usedTotal}</Typography></Paper>
      </Box>

      {editing && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t(
            'Abgeschlossene Events können für nachträgliche Korrekturen bearbeitet werden. Suchen Sie nach einem beliebigen Artikel, um ihn hinzuzufügen.',
            'Completed events can be edited for later corrections. Search for any item to add it.',
          )}
        </Alert>
      )}

      {editing && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField select fullWidth label={t('Event', 'Event')} value={eventType} onChange={(event) => setEventType(event.target.value as EventType)}>
                {EVENT_TYPES.map((type) => <MenuItem key={type} value={type}>{type === 'LS' ? 'LightSim' : type}</MenuItem>)}
              </TextField>
              <TextField fullWidth type="date" label={t('Eventdatum', 'Event date')} value={eventDate} onChange={(event) => setEventDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} required />
              <TextField select fullWidth label={t('Status', 'Status')} value={status} onChange={(event) => setStatus(event.target.value as EventReportStatus)}>
                <MenuItem value="planned">{t('Geplant', 'Planned')}</MenuItem>
                <MenuItem value="completed">{t('Abgeschlossen', 'Completed')}</MenuItem>
              </TextField>
            </Stack>
            <TextField
              fullWidth
              label={t('Artikel zum Event hinzufügen', 'Add an item to the event')}
              placeholder={t('Name, Kategorie oder Unterkategorie suchen', 'Search name, category, or subcategory')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Stack>
        </Paper>
      )}

      <TableContainer component={Paper} sx={{ mb: 3, overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('Artikel', 'Item')}</TableCell>
              <TableCell>{t('Kategorie', 'Category')}</TableCell>
              <TableCell align="right">{t('Geplant', 'Planned')}</TableCell>
              <TableCell align="right">{t('Verwendet', 'Used')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleItems.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{item.name}</TableCell>
                <TableCell>{item.category || '—'}</TableCell>
                <TableCell align="right">
                  {editing ? (
                    <TextField type="number" size="small" value={planned[item.id] ?? ''} onChange={(event) => setPlanned((current) => ({ ...current, [item.id]: event.target.value }))} slotProps={{ htmlInput: { min: 0, step: 1, inputMode: 'numeric' } }} sx={{ width: 100 }} />
                  ) : plannedQuantities[item.id] ?? 0}
                </TableCell>
                <TableCell align="right">
                  {editing ? (
                    <TextField type="number" size="small" value={used[item.id] ?? ''} onChange={(event) => setUsed((current) => ({ ...current, [item.id]: event.target.value }))} slotProps={{ htmlInput: { min: 0, step: 1, inputMode: 'numeric' } }} sx={{ width: 100 }} />
                  ) : usedQuantities[item.id] ?? 0}
                </TableCell>
              </TableRow>
            ))}
            {missingItemIds.map((itemId) => (
              <TableRow key={itemId}>
                <TableCell>
                  <Typography sx={{ fontWeight: 600 }}>{itemId}</Typography>
                  <Typography variant="caption" color="warning.main">{t('Artikel nicht mehr im Inventar', 'Item no longer in inventory')}</Typography>
                </TableCell>
                <TableCell>—</TableCell>
                <TableCell align="right">{plannedQuantities[itemId] ?? 0}</TableCell>
                <TableCell align="right">{usedQuantities[itemId] ?? 0}</TableCell>
              </TableRow>
            ))}
            {!visibleItems.length && !missingItemIds.length && (
              <TableRow><TableCell colSpan={4}>{t('Für dieses Event wurden keine Artikel erfasst.', 'No items were recorded for this event.')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>{t('Anmerkungen', 'Notes')}</Typography>
        {editing ? (
          <TextField fullWidth multiline minRows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        ) : (
          <Typography color={report.notes ? 'text.primary' : 'text.secondary'}>{report.notes || t('Keine Anmerkungen.', 'No notes.')}</Typography>
        )}
      </Paper>
    </Box>
  );
}
