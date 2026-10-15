import { formatDate } from '../utils/dateFormat';
import { useFactionCatalog } from '../hooks/useFactionCatalog';
import { ToggleButton, Button } from '../components/shared/ActionButtons';
import { useAuth } from '../hooks/useAuth';
import { canEditEvents } from '../utils/access';
import { EventQuantities } from '../components/events/EventQuantities';
import { Dialog } from '../components/shared/ClosableDialog';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
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
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { itemApi } from '../services/inventoryService';
import { useQuery } from '@tanstack/react-query';
import { useCreateEventReport, useDeleteEventReport, useEventReports, useUpdateEventReport } from '../hooks/useEvents';
import type { EventReportStatus, EventType, Item } from '../types';
import { getItemStock } from '../utils/stock';
import { translate, useT } from '../utils/naming';
import { useUIStore } from '../store/uiStore';
import { toNonNegativeQuantities, toQuantityInputs, type QuantityInputs } from '../utils/quantityMaps';

export function Events() {
  const navigate = useNavigate();
  const t = useT();
  const { eventTypes } = useFactionCatalog();
  const { user } = useAuth();
  const canEdit = canEditEvents(user);
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
  // Planning an event type needs every item tagged for it: an explicit complete read of that subset only.
  const { data: items, isLoading: itemsLoading } = useQuery({ queryKey: ['items', 'all', 'event-type', eventType],
    queryFn: () => itemApi.getAll({ eventType, sort: 'name' }), networkMode: 'offlineFirst' });
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
        showSnackbar(t('pages.events.eventDeleted'), 'success');
      },
      onError: (error) => showSnackbar(error instanceof Error ? error.message : t('pages.events.couldNotDeleteEvent'), 'error'),
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

  const planningKey = JSON.stringify([eventType, selectedEvent?.id, selectedEvent?.notes, selectedEvent?.plannedQuantities, lastCompleted?.plannedQuantities, lastCompleted?.usedQuantities]);
  const [planningSource, setPlanningSource] = useState<string | undefined>(undefined);
  if (planningSource !== planningKey) {
    setPlanningSource(planningKey);
    setPlanned(toQuantityInputs(selectedEvent?.plannedQuantities ?? lastCompleted?.usedQuantities ?? lastCompleted?.plannedQuantities));
    setNotes(selectedEvent?.notes ?? '');
  }

  const datesKey = JSON.stringify([eventType, currentEvent?.id, currentEvent?.eventDate, currentEvent?.endDate]);
  const [datesSource, setDatesSource] = useState<string | undefined>(undefined);
  if (datesSource !== datesKey) {
    setDatesSource(datesKey);
    setEventDate(currentEvent?.eventDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setEventEndDate(currentEvent?.endDate?.slice(0, 10) ?? currentEvent?.eventDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  }

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
        showSnackbar(t('pages.events.eventCreated'), 'success');
      },
      onError: () => showSnackbar(t('pages.events.couldNotCreateEvent'), 'error'),
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
            ? t('pages.events.eventReportSaved')
            : t('pages.events.eventPlanSaved'),
          'success',
        );
        setNotes('');
        setPlanOpen(false);
      },
      onError: () => showSnackbar(t('pages.events.couldNotSaveEvent'), 'error'),
    };
    if (existing) updateReport.mutate({ id: existing.id, data }, callbacks);
  }

  const isLoading = itemsLoading || reportsLoading;

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4">{t('common.eventPlanning')}</Typography>
        <Typography color="text.secondary">
          {t('pages.events.planAvailableItemsAndCompareUsageFromPreviousEvents')}
        </Typography>
      </Box>

      <ToggleButtonGroup
        exclusive
        value={eventType}
        onChange={(_event, value: EventType | null) => value && setEventType(value)}
        sx={{ mb: 3, flexWrap: 'wrap' }}
      >
        {eventTypes.map((type) => <ToggleButton title={translate('pages.events.filterEventsByThisEventType')} key={type} value={type}>{type}</ToggleButton>)}
      </ToggleButtonGroup>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, alignItems: { sm: 'center' } }}>
        <TextField select label={t('pages.events.selectEvent')} value={selectedEvent?.id ?? ''}
          onChange={(event) => setSelectedEventId(event.target.value)} sx={{ minWidth: 260 }}>
          {reports?.map((report) => <MenuItem key={report.id} value={report.id}>
            {report.name || `${report.eventType} ${report.eventDate.slice(0, 4)}`} · {formatDate(report.startDate)}{report.endDate !== report.startDate ? ` – ${formatDate(report.endDate)}` : ''}
          </MenuItem>)}
        </TextField>
        <Button title={translate('pages.events.createANewEvent')} variant="contained" disabled={!canEdit} onClick={() => {
          setNewName(`${eventType} ${new Date().getFullYear().toString().slice(-2)}`);
          setNewDate(new Date().toISOString().slice(0, 10));
          setNewEndDate(new Date().toISOString().slice(0, 10));
          setCreateOpen(true);
        }}>{t('pages.events.createEvent')}</Button>
        {canEdit && selectedEvent?.status === 'planned' && <Button title={translate('pages.events.editThePlannedItemQuantities')} variant="outlined" onClick={() => setPlanOpen(true)}>{t('pages.events.editPlan')}</Button>}
      </Stack>

      {selectedEvent && <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', mb: 3 }}>
        <Button variant="outlined" onClick={() => navigate(`/events/attendees?eventId=${selectedEvent.id}`)}>{t('pages.events.attendeesFoodStamps')}</Button>
        <Button variant="outlined" onClick={() => navigate(`/events/timeline?eventId=${selectedEvent.id}`)}>{t('common.eventTimeline')}</Button>
      </Stack>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="overline" color="text.secondary">{t('pages.events.lastCompletedEvent')}</Typography>
          {lastCompleted ? (
            <>
              <Typography variant="h6">
                {formatDate(lastCompleted.eventDate)}
              </Typography>
              <Typography color="text.secondary">
                {t('pages.events.itemsUsed')}: {Object.values(lastCompleted.usedQuantities ?? {}).filter((value) => value > 0).length}
              </Typography>
              {lastCompleted.notes && <Typography sx={{ mt: 1 }}>{lastCompleted.notes}</Typography>}
              <Button title={translate('pages.events.openDetailsOfTheLastCompletedEvent')}
                size="small"
                endIcon={<ArrowForwardIcon />}
                onClick={() => navigate(`/events/${lastCompleted.id}`)}
                sx={{ mt: 1.5 }}
              >
                {t('pages.events.openEvent')}
              </Button>
            </>
          ) : (
            <Typography color="text.secondary">{t('pages.events.noCompletedReportYet')}</Typography>
          )}
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="overline" color="text.secondary">{t('pages.events.taggedForThisEventType')}</Typography>
          <Typography variant="h6">{eventItems.length} {t('common.items')}</Typography>
          <Typography color="text.secondary">
            {eventItems.filter((item) => stockFor(item) > 0).length} {t('pages.events.currentlyAvailable')}
          </Typography>
        </Paper>
      </Stack>

      {!isLoading && eventItems.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('pages.events.noItemsAreTaggedForThisEventTypeYetEdit')}
        </Alert>
      )}

      <EventQuantities event={selectedEvent} />

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>{t('pages.events.currentEventUsage')}</Typography>
        {currentEvent && Object.entries(currentEvent.usedQuantities ?? {}).some(([, quantity]) => quantity > 0) ? (
          <Stack spacing={0.5}>
            {Object.entries(currentEvent.usedQuantities).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => (
              <Typography key={id}>{itemName(id, currentEvent)}: {quantity}</Typography>
            ))}
          </Stack>
        ) : <Typography color="text.secondary">{t('pages.events.noItemsHaveBeenPickedUpThroughOrdersYet')}</Typography>}
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t('pages.events.savePlanOrReport')}</Typography>
          <TextField
            label={t('common.startDate')}
            type="date"
            value={eventDate}
            onChange={(event) => setEventDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField label={t('common.endDate')} type="date" value={eventEndDate} onChange={(event) => setEventEndDate(event.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: eventDate } }} error={Boolean(eventEndDate && eventEndDate < eventDate)} />
          <TextField
            label={t('common.notes')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            multiline
            minRows={2}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button title={translate('pages.events.saveThisEventAndItsQuantitiesAsAPlan')} startIcon={<SaveIcon />} variant="outlined" disabled={!canEdit || !selectedEvent || !eventDate || !eventEndDate || eventEndDate < eventDate || createReport.isPending || updateReport.isPending} onClick={() => save('planned')}>
              {t('pages.events.saveAsPlan')}
            </Button>
            <Button title={translate('pages.events.saveThisEventAsCompleted')} startIcon={<EventAvailableIcon />} variant="contained" disabled={!canEdit || !selectedEvent || !eventDate || !eventEndDate || eventEndDate < eventDate || createReport.isPending || updateReport.isPending} onClick={() => save('completed')}>
              {t('pages.events.saveAsCompleted')}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {usageReports.length > 1 && usageItemIds.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>{t('pages.events.usageOverTime')}</Typography>
          <Typography color="text.secondary" sx={{ mb: 1.5 }}>
            {t('pages.events.actualQuantitiesUsedPerCompletedEventItemsThatAreOnly')}
          </Typography>
          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('common.item')}</TableCell>
                  {usageReports.map((report) => (
                    <TableCell key={report.id} align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatDate(report.eventDate)}
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

      <Typography variant="h6" sx={{ mb: 1 }}>{t('pages.events.eventHistory')}</Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('common.date')}</TableCell>
              <TableCell>{t('common.status')}</TableCell>
              <TableCell align="right">{t('common.details')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {reports?.map((report) => (
              <TableRow key={report.id}>
                <TableCell>{report.name || report.eventType} · {formatDate(report.startDate)}{report.endDate !== report.startDate ? ` – ${formatDate(report.endDate)}` : ''}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={report.status === 'completed' ? 'success' : 'info'}
                    label={report.status === 'completed' ? t('common.completed') : t('common.planned')}
                  />
                </TableCell>
                <TableCell align="right">
                  <Button title={translate('pages.events.openThisEventSDetails')} size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(`/events/${report.id}`)}>
                    {t('common.open')}
                  </Button>
                  <Button title={translate('pages.events.editThisEventSDetails')} disabled={!canEdit} size="small" startIcon={<EditIcon />} onClick={() => navigate(`/events/${report.id}?edit=1`)}>
                    {t('common.edit')}
                  </Button>
                  <Button title={translate('pages.events.reviewDeletionOfThisEvent')} disabled={!canEdit} size="small" color="error" startIcon={<DeleteIcon />} onClick={() => setDeletingEventId(report.id)}>
                    {t('common.delete')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!reports?.length && (
              <TableRow><TableCell colSpan={3}>{t('pages.events.noEventReportsYet')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <ConfirmDialog
        open={Boolean(deletingEventId)}
        title={t('pages.events.deleteEvent')}
        message={t('pages.events.permanentlyDeleteThisEventThisIsOnlyPossibleWhileNo')}
        actionLabel={t('common.delete')}
        actionColor="error"
        pending={deleteReport.isPending}
        onClose={() => setDeletingEventId(null)}
        onConfirm={deleteEvent}
      />
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('pages.events.createEvent')}</DialogTitle>
        <DialogContent sx={{ pt: '20px !important' }}>
          <Stack spacing={2}>
            <TextField required autoFocus label={t('pages.events.eventName')} value={newName} onChange={(event) => setNewName(event.target.value)} />
            <TextField required type="date" label={t('pages.events.eventDate')} value={newDate} onChange={(event) => setNewDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField required type="date" label={t('common.endDate')} value={newEndDate} onChange={(event) => setNewEndDate(event.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: newDate } }} error={Boolean(newEndDate && newEndDate < newDate)} />
          </Stack>
        </DialogContent>
        <DialogActions><Button title={translate('common.discardChangesAndClose')} onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button><Button title={translate('pages.events.saveTheNewEvent')} variant="contained" disabled={!newName.trim() || !newDate || !newEndDate || newEndDate < newDate || createReport.isPending} onClick={createEvent}>{t('pages.events.create')}</Button></DialogActions>
      </Dialog>
      <Dialog open={planOpen} onClose={() => setPlanOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('pages.events.planEvent')}: {selectedEvent?.name}</DialogTitle>
        <DialogContent dividers><Stack spacing={1}>
          {eventItems.map((item) => <Stack key={item.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography sx={{ flex: 1 }}>{item.name}</Typography>
            <TextField type="number" size="small" label={t('common.quantity')} value={planned[item.id] ?? ''}
              onChange={(event) => setPlanned((current) => ({ ...current, [item.id]: event.target.value }))}
              slotProps={{ htmlInput: { min: 0, step: 1 } }} sx={{ width: 100 }} />
          </Stack>)}
        </Stack></DialogContent>
        <DialogActions><Button title={translate('common.discardChangesAndClose')} onClick={() => setPlanOpen(false)}>{t('common.cancel')}</Button><Button title={translate('pages.events.saveThePlannedItemQuantities')} variant="contained" disabled={updateReport.isPending} onClick={() => save('planned')}>{t('pages.events.savePlan')}</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
