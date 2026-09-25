import { Dialog } from '../components/shared/ClosableDialog';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { useItems } from '../hooks/useItems';
import { useCreateEventReport, useDeleteEventReport, useEventReports, useUpdateEventReport } from '../hooks/useEvents';
import { EVENT_TYPES, type EventReportStatus, type EventType, type Item } from '../types';
import { getItemStock } from '../utils/stock';
import { useAppLanguage, useLocalizedText } from '../utils/naming';
import { useUIStore } from '../store/uiStore';
import { toNonNegativeQuantities, toQuantityInputs, type QuantityInputs } from '../utils/quantityMaps';

export function Events() {
  const navigate = useNavigate();
  const t = useLocalizedText();
  const language = useAppLanguage();
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const eventType = useUIStore((state) => state.activeEventType);
  const setEventType = useUIStore((state) => state.setActiveEventType);
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [eventEndDate, setEventEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedEventId, setSelectedEventId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newEndDate, setNewEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [planned, setPlanned] = useState<QuantityInputs>({});
  const [notes, setNotes] = useState('');
  const { data: items, isLoading: itemsLoading } = useItems();
  const { data: reports, isLoading: reportsLoading } = useEventReports(eventType);
  const createReport = useCreateEventReport();
  const updateReport = useUpdateEventReport();
  const deleteReport = useDeleteEventReport();

  function deleteEvent() {
    if (!deletingEventId) return;
    deleteReport.mutate(deletingEventId, {
      onSuccess: () => {
        if (selectedEventId === deletingEventId) setSelectedEventId('');
        setDeletingEventId(null);
        showSnackbar(t('Event gelöscht', 'Event deleted'), 'success');
      },
      onError: (error) => showSnackbar(error instanceof Error ? error.message : t('Event konnte nicht gelöscht werden', 'Could not delete event'), 'error'),
    });
  }

  const completedReports = reports?.filter((report) => report.status === 'completed') ?? [];
  const lastCompleted = completedReports[0];
  const selectedEvent = reports?.find((report) => report.id === selectedEventId) ?? reports?.find((report) => report.status === 'planned') ?? reports?.[0];
  const currentEvent = selectedEvent;
  const eventItems = items?.filter((item) => item.eventTypes?.includes(eventType)) ?? [];
  const usageReports = [...completedReports].sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const usageItemIds = (() => {
    const ids = new Set<string>();
    usageReports.forEach((report) => Object.entries(report.usedQuantities ?? {})
      .filter(([, quantity]) => quantity > 0)
      .forEach(([itemId]) => ids.add(itemId)));
    const names = new Map(items?.map((item) => [item.id, item.name]) ?? []);
    return [...ids].sort((left, right) => (names.get(left) ?? left).localeCompare(names.get(right) ?? right));
  })();

  useEffect(() => {
    setPlanned(toQuantityInputs(selectedEvent?.plannedQuantities ?? lastCompleted?.usedQuantities ?? lastCompleted?.plannedQuantities));
    setNotes('');
  }, [eventType, selectedEvent?.id, selectedEvent?.plannedQuantities, lastCompleted?.plannedQuantities, lastCompleted?.usedQuantities]);

  useEffect(() => {
    setEventDate(currentEvent?.eventDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setEventEndDate(currentEvent?.endDate?.slice(0, 10) ?? currentEvent?.eventDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  }, [eventType, currentEvent?.id, currentEvent?.eventDate, currentEvent?.endDate]);

  function createEvent() {
    if (!newName.trim() || !newDate || !newEndDate || newEndDate < newDate) return;
    createReport.mutate({
      eventType,
      name: newName.trim(),
      eventDate: `${newDate}T12:00:00.000Z`,
      startDate: newDate,
      endDate: newEndDate,
      status: 'planned',
      itemIds: [],
      plannedQuantities: {},
      usedQuantities: {},
    }, {
      onSuccess: (created) => {
        setSelectedEventId(created.id);
        setCreateOpen(false);
        showSnackbar(t('Event erstellt', 'Event created'), 'success');
      },
      onError: () => showSnackbar(t('Event konnte nicht erstellt werden', 'Could not create event'), 'error'),
    });
  }

  function itemName(itemId: string, report?: { itemNames?: Record<string, string> }): string {
    return items?.find((item) => item.id === itemId)?.name ?? report?.itemNames?.[itemId] ?? usageReports.find((entry) => entry.itemNames?.[itemId])?.itemNames?.[itemId] ?? itemId;
  }

  function stockFor(item: Item) {
    return getItemStock(item).remaining;
  }

  function save(status: EventReportStatus) {
    if (!selectedEvent || !eventDate || !eventEndDate || eventEndDate < eventDate) return;
    const plannedQuantities = toNonNegativeQuantities(planned);

    const data = {
      eventType,
      eventDate: new Date(`${eventDate}T12:00:00.000Z`).toISOString(),
      name: selectedEvent?.name,
      startDate: eventDate,
      endDate: eventEndDate,
      status,
      itemIds: [],
      plannedQuantities,
      usedQuantities: {},
      notes: notes.trim(),
    };
    const existing = selectedEvent;
    const callbacks = {
      onSuccess: () => {
        showSnackbar(
          status === 'completed'
            ? t('Eventbericht gespeichert', 'Event report saved')
            : t('Eventplanung gespeichert', 'Event plan saved'),
          'success',
        );
        setNotes('');
        setPlanOpen(false);
      },
      onError: () => showSnackbar(t('Event konnte nicht gespeichert werden', 'Could not save event'), 'error'),
    };
    if (existing) updateReport.mutate({ id: existing.id, data }, callbacks);
  }

  const isLoading = itemsLoading || reportsLoading;

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4">{t('Eventplanung', 'Event planning')}</Typography>
        <Typography color="text.secondary">
          {t(
            'Verfügbare Artikel planen und den Verbrauch vergangener Events vergleichen.',
            'Plan available items and compare usage from previous events.',
          )}
        </Typography>
      </Box>

      <ToggleButtonGroup
        exclusive
        value={eventType}
        onChange={(_event, value: EventType | null) => value && setEventType(value)}
        sx={{ mb: 3, flexWrap: 'wrap' }}
      >
        {EVENT_TYPES.map((type) => <ToggleButton key={type} value={type}>{type}</ToggleButton>)}
      </ToggleButtonGroup>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, alignItems: { sm: 'center' } }}>
        <TextField select label={t('Event auswählen', 'Select event')} value={selectedEvent?.id ?? ''}
          onChange={(event) => setSelectedEventId(event.target.value)} sx={{ minWidth: 260 }}>
          {reports?.map((report) => <MenuItem key={report.id} value={report.id}>
            {report.name || `${report.eventType} ${report.eventDate.slice(0, 4)}`} · {report.startDate}{report.endDate !== report.startDate ? ` – ${report.endDate}` : ''}
          </MenuItem>)}
        </TextField>
        <Button variant="contained" onClick={() => {
          setNewName(`${eventType} ${new Date().getFullYear().toString().slice(-2)}`);
          setNewDate(new Date().toISOString().slice(0, 10));
          setNewEndDate(new Date().toISOString().slice(0, 10));
          setCreateOpen(true);
        }}>{t('Event erstellen', 'Create event')}</Button>
        {selectedEvent?.status === 'planned' && <Button variant="outlined" onClick={() => setPlanOpen(true)}>{t('Plan bearbeiten', 'Edit plan')}</Button>}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="overline" color="text.secondary">{t('Letztes abgeschlossenes Event', 'Last completed event')}</Typography>
          {lastCompleted ? (
            <>
              <Typography variant="h6">
                {new Date(lastCompleted.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}
              </Typography>
              <Typography color="text.secondary">
                {t('Verwendete Artikel', 'Items used')}: {Object.values(lastCompleted.usedQuantities ?? {}).filter((value) => value > 0).length}
              </Typography>
              {lastCompleted.notes && <Typography sx={{ mt: 1 }}>{lastCompleted.notes}</Typography>}
              <Button
                size="small"
                endIcon={<ArrowForwardIcon />}
                onClick={() => navigate(`/events/${lastCompleted.id}`)}
                sx={{ mt: 1.5 }}
              >
                {t('Event öffnen', 'Open event')}
              </Button>
            </>
          ) : (
            <Typography color="text.secondary">{t('Noch kein abgeschlossener Bericht vorhanden.', 'No completed report yet.')}</Typography>
          )}
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="overline" color="text.secondary">{t('Für diesen Eventtyp markiert', 'Tagged for this event type')}</Typography>
          <Typography variant="h6">{eventItems.length} {t('Artikel', 'items')}</Typography>
          <Typography color="text.secondary">
            {eventItems.filter((item) => stockFor(item) > 0).length} {t('aktuell verfügbar', 'currently available')}
          </Typography>
        </Paper>
      </Stack>

      {!isLoading && eventItems.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t(
            'Noch keine Artikel für diesen Eventtyp markiert. Bearbeiten Sie einen Artikel und wählen Sie die passenden Events aus.',
            'No items are tagged for this event type yet. Edit an item and select its applicable events.',
          )}
        </Alert>
      )}

      {/* used items table */}
      <TableContainer component={Paper} sx={{ mb: 3, overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('Artikel', 'Item')}</TableCell>
              <TableCell>{t('Kategorie', 'Category')}</TableCell>
              <TableCell align="right">{t('Verfügbar', 'Available')}</TableCell>
              <TableCell align="right">{t('Geplant', 'Planned')}</TableCell>
              <TableCell align="right">{t('Über Bestellungen verwendet', 'Used through orders')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.entries(selectedEvent?.usedQuantities ?? {}).filter(([, quantity]) => quantity > 0).map(([itemId]) => {
              const item = items?.find((entry) => entry.id === itemId);
              if (!item) return <TableRow key={itemId}><TableCell>{itemName(itemId, selectedEvent)}</TableCell><TableCell>—</TableCell><TableCell align="right">—</TableCell><TableCell align="right">—</TableCell><TableCell align="right">{selectedEvent?.usedQuantities[itemId]}</TableCell></TableRow>;
              const available = stockFor(item);
              return (
                <TableRow key={item.id} hover>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.category || '—'}</TableCell>
                  <TableCell align="right">
                    <Chip size="small" color={available > 0 ? 'success' : 'error'} label={available} />
                  </TableCell>
                  <TableCell align="right">{selectedEvent?.plannedQuantities?.[item.id] ?? 0}</TableCell>
                  <TableCell align="right">{selectedEvent?.usedQuantities?.[item.id] ?? 0}</TableCell>
                </TableRow>
              );
            })}
            {!Object.values(selectedEvent?.usedQuantities ?? {}).some((quantity) => quantity > 0) &&
              <TableRow><TableCell colSpan={5}>{t('Für dieses Event wurden noch keine Artikel über Bestellungen ausgegeben.', 'No items have been picked up through orders for this event yet.')}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>{t('Verbrauch des aktuellen Events', 'Current event usage')}</Typography>
        {currentEvent && Object.entries(currentEvent.usedQuantities ?? {}).some(([, quantity]) => quantity > 0) ? (
          <Stack spacing={0.5}>
            {Object.entries(currentEvent.usedQuantities).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => (
              <Typography key={id}>{itemName(id, currentEvent)}: {quantity}</Typography>
            ))}
          </Stack>
        ) : <Typography color="text.secondary">{t('Noch keine Artikel über Bestellungen ausgegeben.', 'No items have been picked up through orders yet.')}</Typography>}
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t('Plan oder Bericht speichern', 'Save plan or report')}</Typography>
          <TextField
            label={t('Startdatum', 'Start date')}
            type="date"
            value={eventDate}
            onChange={(event) => setEventDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField label={t('Enddatum', 'End date')} type="date" value={eventEndDate} onChange={(event) => setEventEndDate(event.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: eventDate } }} error={Boolean(eventEndDate && eventEndDate < eventDate)} />
          <TextField
            label={t('Anmerkungen', 'Notes')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            multiline
            minRows={2}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button startIcon={<SaveIcon />} variant="outlined" disabled={!selectedEvent || !eventDate || !eventEndDate || eventEndDate < eventDate || createReport.isPending || updateReport.isPending} onClick={() => save('planned')}>
              {t('Als Planung speichern', 'Save as plan')}
            </Button>
            <Button startIcon={<EventAvailableIcon />} variant="contained" disabled={!selectedEvent || !eventDate || !eventEndDate || eventEndDate < eventDate || createReport.isPending || updateReport.isPending} onClick={() => save('completed')}>
              {t('Als abgeschlossen speichern', 'Save as completed')}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {usageReports.length > 1 && usageItemIds.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>{t('Verbrauchsentwicklung', 'Usage over time')}</Typography>
          <Typography color="text.secondary" sx={{ mb: 1.5 }}>
            {t(
              'Tatsächlich verwendete Mengen je abgeschlossenem Event. Nicht verwendete, nur für den Eventtyp markierte Artikel werden nicht angezeigt.',
              'Actual quantities used per completed event. Items that are only tagged for this event type are not shown.',
            )}
          </Typography>
          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('Artikel', 'Item')}</TableCell>
                  {usageReports.map((report) => (
                    <TableCell key={report.id} align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {new Date(report.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {usageItemIds.map((itemId) => (
                  <TableRow key={itemId} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{itemName(itemId)}</TableCell>
                    {usageReports.map((report) => (
                      <TableCell key={report.id} align="right">
                        {report.usedQuantities?.[itemId] ?? '—'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>{t('Eventverlauf', 'Event history')}</Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('Datum', 'Date')}</TableCell>
              <TableCell>{t('Status', 'Status')}</TableCell>
              <TableCell align="right">{t('Details', 'Details')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {reports?.map((report) => (
              <TableRow key={report.id}>
                <TableCell>{report.name || report.eventType} · {report.startDate}{report.endDate !== report.startDate ? ` – ${report.endDate}` : ''}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={report.status === 'completed' ? 'success' : 'info'}
                    label={report.status === 'completed' ? t('Abgeschlossen', 'Completed') : t('Geplant', 'Planned')}
                  />
                </TableCell>
                <TableCell align="right">
                  <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(`/events/${report.id}`)}>
                    {t('Öffnen', 'Open')}
                  </Button>
                  <Button size="small" startIcon={<EditIcon />} onClick={() => navigate(`/events/${report.id}?edit=1`)}>
                    {t('Bearbeiten', 'Edit')}
                  </Button>
                  <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => setDeletingEventId(report.id)}>
                    {t('Löschen', 'Delete')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!reports?.length && (
              <TableRow><TableCell colSpan={3}>{t('Noch keine Eventberichte vorhanden.', 'No event reports yet.')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <ConfirmDialog
        open={Boolean(deletingEventId)}
        title={t('Event löschen', 'Delete event')}
        message={t('Dieses Event dauerhaft löschen? Events mit verknüpften Bestellungen können nicht gelöscht werden.', 'Permanently delete this event? Events with linked orders cannot be deleted.')}
        actionLabel={t('Löschen', 'Delete')}
        actionColor="error"
        pending={deleteReport.isPending}
        onClose={() => setDeletingEventId(null)}
        onConfirm={deleteEvent}
      />
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('Event erstellen', 'Create event')}</DialogTitle>
        <DialogContent sx={{ pt: '20px !important' }}>
          <Stack spacing={2}>
            <TextField required autoFocus label={t('Eventname', 'Event name')} value={newName} onChange={(event) => setNewName(event.target.value)} />
            <TextField required type="date" label={t('Eventdatum', 'Event date')} value={newDate} onChange={(event) => setNewDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField required type="date" label={t('Enddatum', 'End date')} value={newEndDate} onChange={(event) => setNewEndDate(event.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: newDate } }} error={Boolean(newEndDate && newEndDate < newDate)} />
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setCreateOpen(false)}>{t('Abbrechen', 'Cancel')}</Button><Button variant="contained" disabled={!newName.trim() || !newDate || !newEndDate || newEndDate < newDate || createReport.isPending} onClick={createEvent}>{t('Erstellen', 'Create')}</Button></DialogActions>
      </Dialog>
      <Dialog open={planOpen} onClose={() => setPlanOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('Event planen', 'Plan event')}: {selectedEvent?.name}</DialogTitle>
        <DialogContent dividers><Stack spacing={1}>
          {eventItems.map((item) => <Stack key={item.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography sx={{ flex: 1 }}>{item.name}</Typography>
            <TextField type="number" size="small" label={t('Menge', 'Quantity')} value={planned[item.id] ?? ''}
              onChange={(event) => setPlanned((current) => ({ ...current, [item.id]: event.target.value }))}
              slotProps={{ htmlInput: { min: 0, step: 1 } }} sx={{ width: 100 }} />
          </Stack>)}
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setPlanOpen(false)}>{t('Abbrechen', 'Cancel')}</Button><Button variant="contained" disabled={updateReport.isPending} onClick={() => save('planned')}>{t('Plan speichern', 'Save plan')}</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
