import { Button } from '../components/shared/ActionButtons';
import { useFactionCatalog } from '../hooks/useFactionCatalog';
import { useAuth } from '../hooks/useAuth';
import { canEditEvents } from '../utils/access';
import { EventQuantities } from '../components/events/EventQuantities';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
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
  Typography,
} from '@mui/material';
import { DateRangeField, TextField } from '../components/shared/DateTextField';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import { useEventReport, useUpdateEventReport } from '../hooks/useEvents';
import { useItemsByIds, usePagedItems } from '../hooks/useItems';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { LoadMore } from '../components/shared/LoadMore';
import type { EventReportStatus, EventType } from '../types';
import { translate, useT } from '../utils/naming';
import { useUIStore } from '../store/uiStore';
import { toNonNegativeQuantities, toQuantityInputs, type QuantityInputs } from '../utils/quantityMaps';
import { formatDate } from '../utils/dateFormat';

export function EventDetail() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const t = useT();
  const { eventTypes } = useFactionCatalog();
  const { user } = useAuth();
  const canEdit = canEditEvents(user);
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const { data: report, isLoading, isError } = useEventReport(reportId);
  const updateReport = useUpdateEventReport();
  const [editing, setEditing] = useState(() => canEdit && searchParams.get('edit') === '1');
  const [eventType, setEventType] = useState<EventType>('DE');
  const [eventDate, setEventDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<EventReportStatus>('completed');
  const [planned, setPlanned] = useState<QuantityInputs>({});
  const [used, setUsed] = useState<QuantityInputs>({});
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');

  const resetForm = () => {
    if (!report) return;
    setEventType(report.eventType);
    setEventDate(report.eventDate.slice(0, 10));
    setEndDate(report.endDate?.slice(0, 10) ?? report.eventDate.slice(0, 10));
    setName(report.name);
    setStatus(report.status);
    setPlanned(toQuantityInputs(report.plannedQuantities));
    setUsed(toQuantityInputs(report.usedQuantities));
    setNotes(report.notes ?? '');
    setSearch('');
  };

  const [formSource, setFormSource] = useState(report);
  if (formSource !== report) {
    setFormSource(report);
    resetForm();
  }

  const recordedIds = new Set([
    ...Object.keys(planned),
    ...Object.keys(used),
  ]);
  // Recorded items by id; while editing, server matches for the search (or the event type's tagged items).
  const recorded = useItemsByIds([...recordedIds]);
  const term = useDebouncedValue(search.trim());
  const candidates = usePagedItems(term ? { search: term, sort: 'name' } : { eventType, sort: 'name' }, { enabled: editing });
  const items = [...new Map([...(recorded.data ?? []), ...(editing ? candidates.data ?? [] : [])].map((item) => [item.id, item])).values()];
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const missingItemIds = [...recordedIds].filter((id) => !itemMap.has(id) && (
      Number(used[id]) > 0 || Number(planned[id]) > 0
    ));
  const visibleItems = (() => {
    return items
      .filter((item) => {
        const isRecorded = Number(used[item.id]) > 0
          || Number(planned[item.id]) > 0;
        if (isRecorded) return true;
        if (!editing) return false;
        return candidates.data?.some((candidate) => candidate.id === item.id) ?? false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  const plannedQuantities = toNonNegativeQuantities(planned);
  const usedQuantities = toNonNegativeQuantities(used);
  const plannedTotal = Object.values(plannedQuantities).reduce((sum, value) => sum + value, 0);
  const usedTotal = Object.values(usedQuantities).reduce((sum, value) => sum + value, 0);
  const usedLines = Object.values(usedQuantities).filter((value) => value > 0).length;

  function cancelEditing() {
    resetForm();
    setEditing(false);
  }

  function save() {
    if (!report || !eventDate || !endDate || endDate < eventDate || !name.trim()) return;
    const knownItemIds = [...new Set([
      ...Object.keys(plannedQuantities),
      ...Object.keys(usedQuantities),
    ])].filter((id) => itemMap.has(id));
    updateReport.mutate({
      id: report.id,
      data: {
        eventType,
        eventDate: new Date(`${eventDate}T12:00:00.000Z`).toISOString(),
        startDate: eventDate,
        endDate,
        name: name.trim(),
        status,
        itemIds: knownItemIds,
        plannedQuantities,
        usedQuantities,
        notes: notes.trim(),
      },
    }, {
      onSuccess: () => {
        setEditing(false);
        showSnackbar(t('pages.eventDetail.eventReportCorrected'), 'success');
      },
      onError: (error) => showSnackbar(
        error instanceof Error ? error.message : t('pages.eventDetail.couldNotSaveEventReport'),
        'error',
      ),
    });
  }

  if (isLoading) return <LinearProgress />;
  if (isError || !report) {
    return (
      <Alert severity="error" action={<Button title={translate('pages.eventDetail.returnToTheEventOverview')} color="inherit" onClick={() => navigate('/events')}>{t('pages.eventDetail.backToOverview')}</Button>}>
        {t('pages.eventDetail.eventReportNotFound')}
      </Alert>
    );
  }


  return (
    <Box>
      <Button title={translate('pages.eventDetail.returnToTheEventHistory')} startIcon={<ArrowBackIcon />} onClick={() => navigate('/events')} sx={{ mb: 1 }}>
        {t('pages.eventDetail.backToEventHistory')}
      </Button>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between' }}>
        <Box>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h4">{report.name || (report.eventType === 'LS' ? 'LightSim' : report.eventType)}</Typography>
            <Chip
              size="small"
              color={report.status === 'completed' ? 'success' : 'info'}
              label={report.status === 'completed' ? t('common.completed') : t('common.planned')}
            />
          </Stack>
          <Typography color="text.secondary">{formatDate(report.eventDate)}{report.endDate !== report.startDate ? ` – ${formatDate(report.endDate)}` : ''}</Typography>
        </Box>
        {!editing ? (
          <Button title={translate('pages.eventDetail.editThisEventSDetails')} disabled={!canEdit} variant="contained" startIcon={<EditIcon />} onClick={() => setEditing(true)} sx={{ alignSelf: { sm: 'flex-start' } }}>
            {t('pages.eventDetail.correctEvent')}
          </Button>
        ) : (
          <Stack direction="row" spacing={1}>
            <Button title={translate('common.discardChangesAndClose')} startIcon={<CloseIcon />} onClick={cancelEditing}>{t('common.cancel')}</Button>
            <Button title={translate('pages.eventDetail.saveChangesToThisEvent')} variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={updateReport.isPending || !eventDate || !endDate || endDate < eventDate || !name.trim()}>
              {t('pages.eventDetail.saveChanges')}
            </Button>
          </Stack>
        )}
      </Stack>

      {!editing && <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', mb: 3 }}>
        <Button variant="outlined" onClick={() => navigate(`/events/attendees?eventId=${report.id}`)}>{t('pages.eventDetail.attendeesFoodStamps')}</Button>
        <Button variant="outlined" onClick={() => navigate(`/events/timeline?eventId=${report.id}`)}>{t('common.eventTimeline')}</Button>
      </Stack>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, mb: 3 }}>
        <Paper sx={{ p: 2 }}><Typography variant="caption" color="text.secondary">{t('pages.eventDetail.linesUsed')}</Typography><Typography variant="h5" component="p">{usedLines}</Typography></Paper>
        <Paper sx={{ p: 2 }}><Typography variant="caption" color="text.secondary">{t('pages.eventDetail.totalPlanned')}</Typography><Typography variant="h5" component="p">{plannedTotal}</Typography></Paper>
        <Paper sx={{ p: 2 }}><Typography variant="caption" color="text.secondary">{t('pages.eventDetail.totalUsed')}</Typography><Typography variant="h5" component="p">{usedTotal}</Typography></Paper>
      </Box>

      {editing && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('pages.eventDetail.plannedQuantitiesCanBeCorrectedUsedQuantitiesAreCalculatedFrom')}
        </Alert>
      )}

      {editing && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack spacing={2}>
            <TextField fullWidth label={t('pages.eventDetail.eventName')} value={name} onChange={(event) => setName(event.target.value)} required />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField select fullWidth label={t('nav.event')} value={eventType} onChange={(event) => setEventType(event.target.value as EventType)}>
                {eventTypes.map((type) => <MenuItem key={type} value={type}>{type === 'LS' ? 'LightSim' : type}</MenuItem>)}
              </TextField>
              <DateRangeField required startLabel={t('common.startDate')} endLabel={t('common.endDate')} start={eventDate} end={endDate}
                onChange={(range) => { setEventDate(range.start); setEndDate(range.end); }} />
              <TextField select fullWidth label={t('common.status')} value={status} onChange={(event) => setStatus(event.target.value as EventReportStatus)}>
                <MenuItem value="planned">{t('common.planned')}</MenuItem>
                <MenuItem value="completed">{t('common.completed')}</MenuItem>
              </TextField>
            </Stack>
            <TextField
              fullWidth
              label={t('pages.eventDetail.addAnItemToTheEvent')}
              placeholder={t('pages.eventDetail.searchNameCategoryOrSubcategory')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Stack>
        </Paper>
      )}

      {!editing && <EventQuantities event={report} />}
      {editing && (<TableContainer component={Paper} sx={{ mb: 3, overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('common.item')}</TableCell>
              <TableCell>{t('common.category')}</TableCell>
              <TableCell align="right">{t('common.planned')}</TableCell>
              <TableCell align="right">{t('common.used')}</TableCell>
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
                  {usedQuantities[item.id] ?? 0}
                </TableCell>
              </TableRow>
            ))}
            {missingItemIds.map((itemId) => (
              <TableRow key={itemId}>
                <TableCell>
                  <Typography sx={{ fontWeight: 600 }}>{report.itemNames?.[itemId] ?? itemId}</Typography>
                </TableCell>
                <TableCell>—</TableCell>
                <TableCell align="right">{plannedQuantities[itemId] ?? 0}</TableCell>
                <TableCell align="right">{usedQuantities[itemId] ?? 0}</TableCell>
              </TableRow>
            ))}
            {!visibleItems.length && !missingItemIds.length && (
              <TableRow><TableCell colSpan={4}>{t('pages.eventDetail.noItemsWereRecordedForThisEvent')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>)}
      {editing && <LoadMore list={candidates} />}

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>{t('common.notes')}</Typography>
        {editing ? (
          <TextField fullWidth multiline minRows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        ) : (
          <Typography color={report.notes ? 'text.primary' : 'text.secondary'}>{report.notes || t('pages.eventDetail.noNotes')}</Typography>
        )}
      </Paper>
    </Box>
  );
}
