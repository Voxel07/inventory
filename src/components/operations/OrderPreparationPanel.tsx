import { formatDate } from '../../utils/dateFormat';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { OperationDetail, OperationListEntry } from './OperationListEntry';
import { GeneralOrderWorkflow } from '../orders/GeneralOrderWorkflow';
import { useFactionOrders } from '../../hooks/useFactionOrders';
import { useOrders } from '../../hooks/useOrders';
import { useEventReports } from '../../hooks/useEvents';
import { useItems } from '../../hooks/useItems';
import type { FactionOrder, GeneralOrderSummary } from '../../types';
import { translate, useLocalizedText } from '../../utils/naming';

/** Final orders the warehouse still has to pick: submitted (not started) and preparing (in progress). */
const TO_PREPARE = ['submitted', 'preparing'];

type Entry =
  | { kind: 'faction'; order: FactionOrder; due: string }
  | { kind: 'general'; order: GeneralOrderSummary; due: string };

function sum(values?: Record<string, number>) {
  return Object.values(values ?? {}).reduce((total, value) => total + value, 0);
}

export function OrderPreparationPanel() {
  const t = useLocalizedText();
  const navigate = useNavigate();
  const factionOrders = useFactionOrders();
  const generalOrders = useOrders();
  const { data: events = [] } = useEventReports();
  const { data: items = [] } = useItems();
  const [preparing, setPreparing] = useState<GeneralOrderSummary | null>(null);
  const eventMap = new Map(events.map((event) => [event.id, event]));

  const entries: Entry[] = [
    ...(factionOrders.data ?? []).filter((order) => TO_PREPARE.includes(order.status))
      .map((order): Entry => ({ kind: 'faction', order, due: order.requestedPickupDate ?? order.eventDate })),
    ...(generalOrders.data ?? []).filter((order) => TO_PREPARE.includes(order.status))
      .map((order): Entry => ({ kind: 'general', order, due: (order.eventOccurrenceId && eventMap.get(order.eventOccurrenceId)?.startDate) || '' })),
  ].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));

  const loading = factionOrders.isLoading || generalOrders.isLoading;
  const error = factionOrders.error || generalOrders.error;
  const statusChip = (status: string) => status === 'preparing'
    ? <Chip size="small" color="warning" variant="outlined" label={t('In Vorbereitung', 'Preparing')} />
    : <Chip size="small" color="info" variant="outlined" label={t('Eingereicht', 'Submitted')} />;

  return <Stack spacing={1.5}>
    <Typography variant="body2" color="text.secondary">
      {t('Eingereichte Fraktions- und allgemeine Bestellungen, die noch vorbereitet werden müssen. Sortiert nach Abhol- bzw. Eventdatum.',
        'Submitted faction and general orders that still need to be prepared, sorted by pickup or event date.')}
    </Typography>
    {loading && <LinearProgress />}
    {error && <Alert severity="error">{error.message}</Alert>}
    {!loading && !error && !entries.length && <Alert severity="success">{t('Keine Bestellungen zur Vorbereitung offen.', 'No orders waiting for preparation.')}</Alert>}
    {entries.map((entry) => entry.kind === 'faction'
      ? <OperationListEntry key={`faction-${entry.order.id}`}
          title={<Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}><span>{entry.order.orderCode}</span>{statusChip(entry.order.status)}</Stack>}
          actions={<Button title={translate('Die Bestellliste zur Vorbereitung öffnen', 'Open the order list to prepare it')} size="small" variant="contained"
            onClick={() => navigate(`/orders/faction/${entry.order.id}`)}>{entry.order.status === 'preparing' ? t('Weiter vorbereiten', 'Continue') : t('Vorbereiten', 'Prepare')}</Button>}>
          <Typography>{t('Fraktion', 'Faction')} {entry.order.faction} · {entry.order.eventType === 'LS' ? 'LightSim' : entry.order.eventType} · {formatDate(entry.order.eventDate)}</Typography>
          <OperationDetail label={t('Gewünschte Abholung', 'Requested pickup')}>{entry.order.requestedPickupDate ? formatDate(entry.order.requestedPickupDate) : undefined}</OperationDetail>
          <OperationDetail label={t('Fortschritt', 'Progress')}>
            {`${sum(entry.order.preparedQuantities) + sum(entry.order.preparedAssemblyQuantities)}/${sum(entry.order.requestedQuantities) + sum(entry.order.requestedAssemblyQuantities)} ${t('Listeneinheiten', 'list units')}`}
          </OperationDetail>
        </OperationListEntry>
      : <OperationListEntry key={`general-${entry.order.id}`}
          title={<Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}><span>{entry.order.name}</span>{statusChip(entry.order.status)}</Stack>}
          actions={<Button title={translate('Vorbereitete Mengen und Gerätezuordnungen erfassen', 'Enter prepared quantities and asset assignments')} size="small" variant="contained"
            onClick={() => setPreparing(entry.order)}>{t('Vorbereiten', 'Prepare')}</Button>}>
          <Typography>{t('Allgemeine Bestellung', 'General order')} · {(() => {
            const event = entry.order.eventOccurrenceId ? eventMap.get(entry.order.eventOccurrenceId) : undefined;
            return event ? `${event.name} · ${formatDate(event.startDate)}` : t('Kein Event', 'No event');
          })()}</Typography>
          <OperationDetail label={t('Zweck', 'Purpose')}>{entry.order.purpose}</OperationDetail>
          <OperationDetail label={t('Artikel', 'Items')}>
            {Object.entries(entry.order.requestedQuantities ?? {}).map(([id, quantity]) => `${entry.order.itemNames?.[id] ?? items.find((item) => item.id === id)?.name ?? id} × ${quantity}`).join(', ')}
          </OperationDetail>
        </OperationListEntry>)}
    {preparing && <GeneralOrderWorkflow order={preparing} action="prepare" items={items} onClose={() => setPreparing(null)} />}
  </Stack>;
}
