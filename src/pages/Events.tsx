import { formatDate } from '../utils/dateFormat';
import { useFactionCatalog } from '../hooks/useFactionCatalog';
import { ToggleButton, Button } from '../components/shared/ActionButtons';
import { useAuth } from '../hooks/useAuth';
import { canEditEvents } from '../utils/access';
import { EventQuantities } from '../components/events/EventQuantities';
import { Dialog } from '../components/shared/ClosableDialog';
import { PageHeader } from '../components/shared/PageHeader';
import { ActionBar } from '../components/shared/ActionBar';
import { useOverflowCollapse } from '../hooks/useOverflowCollapse';
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
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { DateRangeField, TextField } from '../components/shared/DateTextField';
import AddIcon from '@mui/icons-material/Add';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import EditIcon from '@mui/icons-material/Edit';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import DeleteIcon from '@mui/icons-material/Delete';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { itemApi } from '../services/inventoryService';
import { useQuery } from '@tanstack/react-query';
import { useCreateEventReport, useDeleteEventReport, useEventReports, useUpdateEventReport } from '../hooks/useEvents';
import type { EventReport, EventType, Item } from '../types';
import { getItemStock } from '../utils/stock';
import { translate, useAppLanguage, useT } from '../utils/naming';
import { useUIStore } from '../store/uiStore';
import { catalogGridSx } from '../components/lists/catalogGrid';

const today = () => new Date().toISOString().slice(0, 10);

type UsageRow = { id: string; name: string };

export function Events() {
  const navigate = useNavigate();
  const { ref: historyRef, collapsed: historyCollapsed } = useOverflowCollapse<HTMLDivElement>();
  const t = useT();
  const language = useAppLanguage();
  const { eventTypes } = useFactionCatalog();
  const { user } = useAuth();
  const canEdit = canEditEvents(user);
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const eventType = useUIStore((state) => state.activeEventType);
  const setEventType = useUIStore((state) => state.setActiveEventType);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(today());
  const [newEndDate, setNewEndDate] = useState(today());
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [usageSearch, setUsageSearch] = useState('');
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
  const eventItems = items?.filter((item) => item.eventTypes?.includes(eventType)) ?? [];
  const usageReports = [...completedReports].sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  // A planned event can be closed from its last day on; closing locks its report.
  const eventOver = Boolean(selectedEvent && (selectedEvent.endDate ?? selectedEvent.startDate).slice(0, 10) <= today());

  function itemName(itemId: string): string {
    return items?.find((item) => item.id === itemId)?.name ?? usageReports.find((entry) => entry.itemNames?.[itemId])?.itemNames?.[itemId] ?? itemId;
  }

  const usageRows: UsageRow[] = (() => {
    const ids = new Set<string>();
    usageReports.forEach((report) => Object.entries(report.usedQuantities ?? {})
      .filter(([, quantity]) => quantity > 0)
      .forEach(([itemId]) => ids.add(itemId)));
    const query = usageSearch.trim().toLocaleLowerCase();
    return [...ids].map((id) => ({ id, name: itemName(id) }))
      .filter((row) => row.name.toLocaleLowerCase().includes(query))
      .sort((left, right) => left.name.localeCompare(right.name));
  })();
  const usageColumns: GridColDef<UsageRow>[] = [
    { field: 'name', headerName: t('common.item'), flex: 1, minWidth: 200 },
    ...usageReports.map((report): GridColDef<UsageRow> => ({
      field: `report:${report.id}`, headerName: report.name || formatDate(report.eventDate), description: `${formatDate(report.startDate)} – ${formatDate(report.endDate)}`,
      type: 'number', width: 130, valueGetter: (_value, row) => report.usedQuantities?.[row.id] ?? null,
      valueFormatter: (value: number | null) => value ?? '—',
    })),
  ];

  function stockFor(item: Item) {
    return getItemStock(item).remaining;
  }

  function openCreate() {
    setNewName(`${eventType} ${new Date().getFullYear().toString().slice(-2)}`);
    setNewDate(today());
    setNewEndDate(today());
    setCreateOpen(true);
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

  /** Event details only; item quantities are corrected on the event's own page. */
  function openEdit(event: EventReport) {
    setEditName(event.name);
    setEditStart(event.startDate.slice(0, 10));
    setEditEnd((event.endDate ?? event.startDate).slice(0, 10));
    setNotes(event.notes ?? '');
    setEditOpen(true);
  }

  // usedQuantities is omitted so updates keep the usage recorded through orders.
  function update(event: EventReport, changes: { name: string; startDate: string; endDate: string; status: EventReport['status']; plannedQuantities: Record<string, number>; notes: string }, onSuccess: () => void) {
    updateReport.mutate({ id: event.id, data: {
      eventType: event.eventType,
      eventDate: new Date(`${changes.startDate}T12:00:00.000Z`).toISOString(),
      itemIds: [],
      ...changes,
    } }, {
      onSuccess,
      onError: () => showSnackbar(t('pages.events.couldNotSaveEvent'), 'error'),
    });
  }

  function saveEdit() {
    if (!selectedEvent || !editName.trim() || !editStart || !editEnd || editEnd < editStart) return;
    update(selectedEvent, { name: editName.trim(), startDate: editStart, endDate: editEnd, status: 'planned', plannedQuantities: selectedEvent.plannedQuantities, notes: notes.trim() }, () => {
      setEditOpen(false);
      showSnackbar(t('pages.events.eventPlanSaved'), 'success');
    });
  }

  function closeEvent() {
    if (!selectedEvent) return;
    update(selectedEvent, {
      name: selectedEvent.name,
      startDate: selectedEvent.startDate.slice(0, 10),
      endDate: (selectedEvent.endDate ?? selectedEvent.startDate).slice(0, 10),
      status: 'completed',
      plannedQuantities: selectedEvent.plannedQuantities,
      notes: selectedEvent.notes ?? '',
    }, () => {
      setCloseOpen(false);
      showSnackbar(t('pages.events.eventClosed'), 'success');
    });
  }

  const isLoading = itemsLoading || reportsLoading;
  const editInvalid = !editName.trim() || !editStart || !editEnd || editEnd < editStart;

  return (
    <Box>
      <PageHeader title={t('common.eventPlanning')} description={t('pages.events.planAvailableItemsAndCompareUsageFromPreviousEvents')}
        actions={<Button title={translate('pages.events.createANewEvent')} variant="contained" startIcon={<AddIcon />} disabled={!canEdit} onClick={openCreate}>
          {t('pages.events.createEvent')}
        </Button>} />

      <ToggleButtonGroup
        exclusive
        value={eventType}
        onChange={(_event, value: EventType | null) => value && setEventType(value)}
        sx={{ mb: 3, flexWrap: 'wrap' }}
      >
        {eventTypes.map((type) => <ToggleButton title={translate('pages.events.filterEventsByThisEventType')} key={type} value={type}>{type}</ToggleButton>)}
      </ToggleButtonGroup>

      {/* Wrapping only in rows: a wrapping column sizes to its widest item and would push the select off screen. */}
      <Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap sx={{ mb: 3, gap: 2, alignItems: { sm: 'center' }, flexWrap: { sm: 'wrap' } }}>
        <TextField select label={t('pages.events.selectEvent')} value={selectedEvent?.id ?? ''}
          onChange={(event) => setSelectedEventId(event.target.value)} sx={{ minWidth: { sm: 260 }, maxWidth: '100%' }}>
          {reports?.map((report) => <MenuItem key={report.id} value={report.id}>
            {report.name || `${report.eventType} ${report.eventDate.slice(0, 4)}`} · {formatDate(report.startDate)}{report.endDate !== report.startDate ? ` – ${formatDate(report.endDate)}` : ''}
          </MenuItem>)}
        </TextField>
        {canEdit && selectedEvent && <ActionBar align="start" actions={[
          selectedEvent.status === 'planned' && { key: 'edit', label: t('pages.events.editEvent'), title: translate('pages.events.editTheEventNameDatesAndNotes'),
            icon: <EditIcon />, pinned: true, onClick: () => openEdit(selectedEvent) },
          selectedEvent.status === 'planned' && { key: 'close', label: t('pages.events.closeEvent'),
            title: translate(eventOver ? 'pages.events.closeTheEventAndLockItsReport' : 'pages.events.theEventCanBeClosedOnItsLastDay'),
            icon: <EventAvailableIcon />, disabled: !eventOver, onClick: () => setCloseOpen(true) },
          { key: 'items', label: t('pages.events.editItems'), title: translate('pages.events.correctTheItemsAndQuantitiesOfThisEvent'),
            icon: <Inventory2OutlinedIcon />, onClick: () => navigate(`/events/${selectedEvent.id}?edit=1`) },
        ]} />}
        {selectedEvent?.status === 'completed' && <Chip color="success" icon={<EventAvailableIcon />} label={t('pages.events.closedReportLocked')} />}
      </Stack>

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

      {usageReports.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>{t('pages.events.usageOverTime')}</Typography>
          <Typography color="text.secondary" sx={{ mb: 1.5 }}>
            {t('pages.events.actualQuantitiesUsedPerCompletedEventItemsThatAreOnly')}
          </Typography>
          <TextField type="search" label={t('lists.itemsList.searchByName')} value={usageSearch}
            onChange={(event) => setUsageSearch(event.target.value)} size="small" fullWidth sx={{ mb: 1.5 }} />
          <DataGrid rows={usageRows} columns={usageColumns} density="compact" autoHeight disableRowSelectionOnClick
            onRowClick={({ row }) => navigate(`/items/${row.id}`)}
            initialState={{ pagination: { paginationModel: { page: 0, pageSize: 25 } } }} pageSizeOptions={[25, 50, 100]}
            localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
            sx={catalogGridSx} />
        </Box>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>{t('pages.events.eventHistory')}</Typography>
      <TableContainer component={Paper} ref={historyRef}>
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
                  <ActionBar size="small" collapsed={historyCollapsed} actions={[
                    { key: 'open', label: t('common.open'), title: translate('pages.events.openThisEventSDetails'), variant: 'text', pinned: true, onClick: () => navigate(`/events/${report.id}`) },
                    { key: 'edit', label: t('common.edit'), title: translate('pages.events.editThisEventSDetails'), icon: <EditIcon />,
                      variant: 'text', disabled: !canEdit, onClick: () => navigate(`/events/${report.id}?edit=1`) },
                    { key: 'delete', label: t('common.delete'), title: translate('pages.events.reviewDeletionOfThisEvent'), icon: <DeleteIcon />,
                      variant: 'text', color: 'error', disabled: !canEdit, onClick: () => setDeletingEventId(report.id) },
                  ]} />
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
      <ConfirmDialog
        open={closeOpen}
        title={t('pages.events.closeEvent')}
        message={t('pages.events.closeNameTheReportIsLockedAndCanNoLongerBeEdited', { name: selectedEvent?.name ?? '' })}
        actionLabel={t('pages.events.closeEvent')}
        pending={updateReport.isPending}
        onClose={() => setCloseOpen(false)}
        onConfirm={closeEvent}
      />
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('pages.events.createEvent')}</DialogTitle>
        <DialogContent sx={{ pt: '20px !important' }}>
          <Stack spacing={2}>
            <TextField required autoFocus label={t('pages.events.eventName')} value={newName} onChange={(event) => setNewName(event.target.value)} />
            <DateRangeField required startLabel={t('common.startDate')} endLabel={t('common.endDate')} start={newDate} end={newEndDate}
              onChange={(range) => { setNewDate(range.start); setNewEndDate(range.end); }} />
          </Stack>
        </DialogContent>
        <DialogActions><Button title={translate('common.discardChangesAndClose')} onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button><Button title={translate('pages.events.saveTheNewEvent')} variant="contained" disabled={!newName.trim() || !newDate || !newEndDate || newEndDate < newDate || createReport.isPending} onClick={createEvent}>{t('pages.events.create')}</Button></DialogActions>
      </Dialog>
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('pages.events.editEvent')}: {selectedEvent?.name}</DialogTitle>
        <DialogContent dividers><Stack spacing={2}>
          <TextField required label={t('pages.events.eventName')} value={editName} onChange={(event) => setEditName(event.target.value)} />
          <DateRangeField required startLabel={t('common.startDate')} endLabel={t('common.endDate')} start={editStart} end={editEnd}
            onChange={(range) => { setEditStart(range.start); setEditEnd(range.end); }} />
          <TextField label={t('common.notes')} value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={2} />
        </Stack></DialogContent>
        <DialogActions><Button title={translate('common.discardChangesAndClose')} onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button><Button title={translate('pages.events.saveTheEventChanges')} variant="contained" disabled={editInvalid || updateReport.isPending} onClick={saveEdit}>{t('common.save')}</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
