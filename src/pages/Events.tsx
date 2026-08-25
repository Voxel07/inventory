import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import SaveIcon from '@mui/icons-material/Save';
import { useItems } from '../hooks/useItems';
import { useTransactions } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';
import { useCreateEventReport, useEventReports } from '../hooks/useEvents';
import { EVENT_TYPES, type EventReportStatus, type EventType, type Item } from '../types';
import { calculateItemStock } from '../utils/stock';
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

export function Events() {
  const t = useTranslate();
  const language = useAppLanguage();
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const [eventType, setEventType] = useState<EventType>('DE');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [planned, setPlanned] = useState<QuantityInputs>({});
  const [used, setUsed] = useState<QuantityInputs>({});
  const [notes, setNotes] = useState('');
  const { data: items, isLoading: itemsLoading } = useItems();
  const { data: transactions } = useTransactions();
  const { data: damageReports } = useDamageReports();
  const { data: reports, isLoading: reportsLoading } = useEventReports(eventType);
  const createReport = useCreateEventReport();

  const completedReports = useMemo(
    () => reports?.filter((report) => report.status === 'completed') ?? [],
    [reports],
  );
  const lastCompleted = completedReports[0];
  const eventItems = useMemo(
    () => items?.filter((item) => item.eventTypes?.includes(eventType)) ?? [],
    [eventType, items],
  );

  useEffect(() => {
    setPlanned(toInputs(lastCompleted?.usedQuantities ?? lastCompleted?.plannedQuantities));
    setUsed({});
    setNotes('');
  }, [eventType, lastCompleted?.id]);

  function itemName(itemId: string): string {
    return items?.find((item) => item.id === itemId)?.name ?? itemId;
  }

  function stockFor(item: Item) {
    return calculateItemStock(item.id, transactions, damageReports).remaining;
  }

  function save(status: EventReportStatus) {
    const plannedQuantities = toQuantities(planned);
    const usedQuantities = toQuantities(used);
    const itemIds = [...new Set([
      ...eventItems.map((item) => item.id),
      ...Object.keys(plannedQuantities),
      ...Object.keys(usedQuantities),
    ])];

    createReport.mutate({
      eventType,
      eventDate: new Date(`${eventDate}T12:00:00.000Z`).toISOString(),
      status,
      itemIds,
      plannedQuantities,
      usedQuantities,
      notes: notes.trim(),
    }, {
      onSuccess: () => {
        showSnackbar(
          status === 'completed'
            ? t('Eventbericht gespeichert', 'Event report saved')
            : t('Eventplanung gespeichert', 'Event plan saved'),
          'success',
        );
        setUsed({});
        setNotes('');
      },
      onError: () => showSnackbar(t('Event konnte nicht gespeichert werden', 'Could not save event'), 'error'),
    });
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

      <TableContainer component={Paper} sx={{ mb: 3, overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('Artikel', 'Item')}</TableCell>
              <TableCell>{t('Kategorie', 'Category')}</TableCell>
              <TableCell align="right">{t('Verfügbar', 'Available')}</TableCell>
              <TableCell align="right">{t('Zuletzt geplant', 'Last planned')}</TableCell>
              <TableCell align="right">{t('Zuletzt verwendet', 'Last used')}</TableCell>
              <TableCell align="right">{t('Nächstes Event', 'Next event')}</TableCell>
              <TableCell align="right">{t('Tatsächlich verwendet', 'Actually used')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {eventItems.map((item) => {
              const available = stockFor(item);
              return (
                <TableRow key={item.id} hover>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.category || '—'}</TableCell>
                  <TableCell align="right">
                    <Chip size="small" color={available > 0 ? 'success' : 'error'} label={available} />
                  </TableCell>
                  <TableCell align="right">{lastCompleted?.plannedQuantities?.[item.id] ?? 0}</TableCell>
                  <TableCell align="right">{lastCompleted?.usedQuantities?.[item.id] ?? 0}</TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={planned[item.id] ?? ''}
                      onChange={(event) => setPlanned((current) => ({ ...current, [item.id]: event.target.value }))}
                      slotProps={{ htmlInput: { min: 0, step: 1, 'aria-label': t(`Geplante Menge ${item.name}`, `Planned quantity ${item.name}`) } }}
                      sx={{ width: 100 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={used[item.id] ?? ''}
                      onChange={(event) => setUsed((current) => ({ ...current, [item.id]: event.target.value }))}
                      slotProps={{ htmlInput: { min: 0, step: 1, 'aria-label': t(`Verwendete Menge ${item.name}`, `Used quantity ${item.name}`) } }}
                      sx={{ width: 100 }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t('Plan oder Bericht speichern', 'Save plan or report')}</Typography>
          <TextField
            label={t('Eventdatum', 'Event date')}
            type="date"
            value={eventDate}
            onChange={(event) => setEventDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label={t('Anmerkungen', 'Notes')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            multiline
            minRows={2}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button startIcon={<SaveIcon />} variant="outlined" disabled={createReport.isPending} onClick={() => save('planned')}>
              {t('Als Planung speichern', 'Save as plan')}
            </Button>
            <Button startIcon={<EventAvailableIcon />} variant="contained" disabled={createReport.isPending} onClick={() => save('completed')}>
              {t('Als abgeschlossen speichern', 'Save as completed')}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Typography variant="h6" sx={{ mb: 1 }}>{t('Eventverlauf', 'Event history')}</Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('Datum', 'Date')}</TableCell>
              <TableCell>{t('Status', 'Status')}</TableCell>
              <TableCell>{t('Geplant', 'Planned')}</TableCell>
              <TableCell>{t('Verwendet', 'Used')}</TableCell>
              <TableCell>{t('Anmerkungen', 'Notes')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {reports?.map((report) => (
              <TableRow key={report.id}>
                <TableCell>{new Date(report.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={report.status === 'completed' ? 'success' : 'info'}
                    label={report.status === 'completed' ? t('Abgeschlossen', 'Completed') : t('Geplant', 'Planned')}
                  />
                </TableCell>
                <TableCell>{Object.entries(report.plannedQuantities ?? {}).filter(([, value]) => value > 0).map(([id, value]) => `${itemName(id)}: ${value}`).join(', ') || '—'}</TableCell>
                <TableCell>{Object.entries(report.usedQuantities ?? {}).filter(([, value]) => value > 0).map(([id, value]) => `${itemName(id)}: ${value}`).join(', ') || '—'}</TableCell>
                <TableCell>{report.notes || '—'}</TableCell>
              </TableRow>
            ))}
            {!reports?.length && (
              <TableRow><TableCell colSpan={5}>{t('Noch keine Eventberichte vorhanden.', 'No event reports yet.')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
