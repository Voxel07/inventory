import { Button, IconButton } from '../components/shared/ActionButtons';
import { ActionBar } from '../components/shared/ActionBar';
import { useAuth } from '../hooks/useAuth';
import { canEditEvents } from '../utils/access';
import { EventQuantities } from '../components/events/EventQuantities';
import { AddEventItemsDialog } from '../components/events/AddEventItemsDialog';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Chip,
  LinearProgress,
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
import { TextField } from '../components/shared/DateTextField';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import { useEventReport, useUpdateEventReport } from '../hooks/useEvents';
import { useItemsByIds } from '../hooks/useItems';
import { translate, useT } from '../utils/naming';
import { useUIStore } from '../store/uiStore';
import { toNonNegativeQuantities, toQuantityInputs, type QuantityInputs } from '../utils/quantityMaps';
import { formatDate } from '../utils/dateFormat';

export function EventDetail() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const t = useT();
  const { user } = useAuth();
  const canEdit = canEditEvents(user);
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const { data: report, isLoading, isError } = useEventReport(reportId);
  const updateReport = useUpdateEventReport();
  const [editing, setEditing] = useState(() => canEdit && searchParams.get('edit') === '1');
  const [adding, setAdding] = useState(false);
  const [planned, setPlanned] = useState<QuantityInputs>({});
  const [used, setUsed] = useState<QuantityInputs>({});

  const resetForm = () => {
    if (!report) return;
    setPlanned(toQuantityInputs(report.plannedQuantities));
    setUsed(toQuantityInputs(report.usedQuantities));
  };

  const [formSource, setFormSource] = useState(report);
  if (formSource !== report) {
    setFormSource(report);
    resetForm();
  }

  // A closed event's usage is its frozen report and is corrected here; an open event's usage comes from orders.
  const closed = report?.status === 'completed';
  const rowIds = [...new Set([...Object.keys(planned), ...Object.keys(used)])];
  const recorded = useItemsByIds(rowIds);
  const itemMap = new Map((recorded.data ?? []).map((item) => [item.id, item]));
  const itemName = (id: string) => itemMap.get(id)?.name ?? report?.itemNames?.[id] ?? id;
  const rows = rowIds.map((id) => ({ id, name: itemName(id), category: itemMap.get(id)?.category }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const plannedQuantities = toNonNegativeQuantities(planned);
  const usedQuantities = toNonNegativeQuantities(used);
  const plannedTotal = Object.values(plannedQuantities).reduce((sum, value) => sum + value, 0);
  const usedTotal = Object.values(usedQuantities).reduce((sum, value) => sum + value, 0);
  const usedLines = Object.values(usedQuantities).filter((value) => value > 0).length;

  function cancelEditing() {
    resetForm();
    setEditing(false);
  }

  /** New items land in the usage of a closed event and in the plan of an open one. */
  function addItems(quantities: Record<string, number>) {
    const add = (current: QuantityInputs) => {
      const next = { ...current };
      Object.entries(quantities).forEach(([id, quantity]) => { next[id] = String((Number(next[id]) || 0) + quantity); });
      return next;
    };
    if (closed) setUsed(add); else setPlanned(add);
  }

  function removeItem(id: string) {
    const without = (current: QuantityInputs) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id));
    setPlanned(without);
    setUsed(without);
  }

  // Event details stay as they are; this page only corrects the item quantities.
  function save() {
    if (!report) return;
    const positive = (values: Record<string, number>) => Object.fromEntries(Object.entries(values).filter(([, value]) => value > 0));
    updateReport.mutate({
      id: report.id,
      data: {
        eventType: report.eventType,
        eventDate: report.eventDate,
        startDate: report.startDate.slice(0, 10),
        endDate: (report.endDate ?? report.startDate).slice(0, 10),
        name: report.name,
        status: report.status,
        itemIds: [],
        plannedQuantities: positive(plannedQuantities),
        usedQuantities: closed ? positive(usedQuantities) : undefined,
        notes: report.notes ?? '',
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

  const quantityInput = (values: QuantityInputs, setValues: (update: (current: QuantityInputs) => QuantityInputs) => void, id: string) =>
    <TextField type="number" size="small" value={values[id] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [id]: event.target.value }))}
      slotProps={{ htmlInput: { min: 0, step: 1, inputMode: 'numeric', 'aria-label': itemName(id) } }} sx={{ width: { xs: 72, sm: 100 } }} />;

  return (
    <Box>
      <Button title={translate('pages.eventDetail.returnToTheEventHistory')} startIcon={<ArrowBackIcon />} onClick={() => navigate('/events')} sx={{ mb: 1 }}>
        {t('pages.eventDetail.backToEventHistory')}
      </Button>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: { sm: 200 }, flex: { sm: '1 1 0' } }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h4">{report.name || (report.eventType === 'LS' ? 'LightSim' : report.eventType)}</Typography>
            <Chip
              size="small"
              color={closed ? 'success' : 'info'}
              label={closed ? t('common.completed') : t('common.planned')}
            />
          </Stack>
          <Typography color="text.secondary">{formatDate(report.eventDate)}{report.endDate !== report.startDate ? ` – ${formatDate(report.endDate)}` : ''}</Typography>
        </Box>
        <ActionBar sx={{ alignSelf: { sm: 'flex-start' } }} actions={editing ? [
          { key: 'cancel', label: t('common.cancel'), title: translate('common.discardChangesAndClose'), icon: <CloseIcon />, variant: 'text', onClick: cancelEditing },
          { key: 'save', label: t('pages.eventDetail.saveChanges'), title: translate('pages.eventDetail.saveChangesToThisEvent'), icon: <SaveIcon />,
            variant: 'contained', pinned: true, disabled: updateReport.isPending, onClick: save },
        ] : [
          { key: 'attendees', label: t('pages.eventDetail.attendeesFoodStamps'), onClick: () => navigate(`/events/attendees?eventId=${report.id}`) },
          { key: 'timeline', label: t('common.eventTimeline'), onClick: () => navigate(`/events/timeline?eventId=${report.id}`) },
          { key: 'edit', label: t('pages.eventDetail.editItems'), title: translate('pages.eventDetail.correctTheItemsAndQuantitiesOfThisEvent'), icon: <EditIcon />,
            variant: 'contained', pinned: true, disabled: !canEdit, onClick: () => setEditing(true) },
        ]} />
      </Stack>

      {!editing && <>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 1, sm: 1.5 }, mb: 3 }}>
          <Paper sx={{ p: { xs: 1.25, sm: 2 } }}><Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>{t('pages.eventDetail.linesUsed')}</Typography><Typography variant="h5" component="p">{usedLines}</Typography></Paper>
          <Paper sx={{ p: { xs: 1.25, sm: 2 } }}><Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>{t('pages.eventDetail.totalPlanned')}</Typography><Typography variant="h5" component="p">{plannedTotal}</Typography></Paper>
          <Paper sx={{ p: { xs: 1.25, sm: 2 } }}><Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>{t('pages.eventDetail.totalUsed')}</Typography><Typography variant="h5" component="p">{usedTotal}</Typography></Paper>
        </Box>
        <EventQuantities event={report} />
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>{t('common.notes')}</Typography>
          <Typography color={report.notes ? 'text.primary' : 'text.secondary'}>{report.notes || t('pages.eventDetail.noNotes')}</Typography>
        </Paper>
      </>}

      {editing && <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="h6">{t('pages.eventDetail.itemsUsed')}</Typography>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setAdding(true)}>{t('pages.eventDetail.addItems')}</Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {closed ? t('pages.eventDetail.thisEventIsClosedUsedQuantitiesAreItsReport') : t('pages.eventDetail.usedQuantitiesComeFromOrdersUntilTheEventIsClosed')}
        </Typography>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ '& .MuiTableCell-root:not(.MuiTableCell-paddingNone)': { px: { xs: 0.75, sm: 2 } } }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('common.item')}</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('common.category')}</TableCell>
                <TableCell align="right">{t('common.planned')}</TableCell>
                <TableCell align="right">{t('common.used')}</TableCell>
                <TableCell align="right" padding="none" sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ fontWeight: 600, overflowWrap: 'break-word', hyphens: 'auto' }}>{row.name}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{row.category || '—'}</TableCell>
                  <TableCell align="right">{quantityInput(planned, setPlanned, row.id)}</TableCell>
                  <TableCell align="right">{closed ? quantityInput(used, setUsed, row.id) : usedQuantities[row.id] ?? 0}</TableCell>
                  <TableCell align="right" padding="none">
                    <IconButton size="small" title={t('pages.eventDetail.removeItem')} disabled={!closed && (usedQuantities[row.id] ?? 0) > 0} onClick={() => removeItem(row.id)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow><TableCell colSpan={5}>{t('pages.eventDetail.noItemsWereRecordedForThisEvent')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>}
      <AddEventItemsDialog open={adding} onClose={() => setAdding(false)} onAdd={addItems} />
    </Box>
  );
}
