import { formatDate } from '../../utils/dateFormat';
import { useState } from 'react';
import { Alert, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import { OperationDetail, OperationListEntry } from './OperationListEntry';
import { GeneralOrderWorkflow } from '../orders/GeneralOrderWorkflow';
import { useFactionOrders } from '../../hooks/useFactionOrders';
import { useOrders } from '../../hooks/useOrders';
import { useEventReports } from '../../hooks/useEvents';
import { LoadMore } from '../shared/LoadMore';
import type { FactionOrderSummary, GeneralOrderSummary } from '../../types';
import { translate, useT } from '../../utils/naming';
import { TaskToolbar } from './TaskToolbar';
import { taskStatusFilter, useTaskFilters } from '../../hooks/useWarehouseTasks';

/** Final orders the warehouse still has to pick: submitted (not started) and preparing (in progress). */
const TO_PREPARE = ['submitted', 'preparing'] as const;

type Entry =
  | { kind: 'faction'; order: FactionOrderSummary; due?: number }
  | { kind: 'general'; order: GeneralOrderSummary; due?: number };

function sum(values?: Record<string, number>) {
  return Object.values(values ?? {}).reduce((total, value) => total + value, 0);
}

export function OrderPreparationPanel() {
  const t = useT();
  const filters = useTaskFilters('picking');
  const statuses = filters.values.status === 'preparing' ? ['preparing'] as const : filters.values.status === 'submitted' ? ['submitted'] as const : TO_PREPARE;
  const factionOrders = useFactionOrders(undefined, undefined, statuses, filters.query.eventId, filters.query.search);
  const generalOrders = useOrders({ status: statuses, eventId: filters.query.eventId, search: filters.query.search });
  const { data: events = [] } = useEventReports();
  const [preparing, setPreparing] = useState<GeneralOrderSummary | null>(null);
  const eventMap = new Map(events.map((event) => [event.id, event]));

  const entries: Entry[] = [
    ...(factionOrders.data ?? [])
      .map((order): Entry => ({ kind: 'faction', order, due: order.requestedPickupDate ?? order.eventDate })),
    ...(generalOrders.data ?? [])
      .map((order): Entry => ({ kind: 'general', order, due: order.eventOccurrenceId ? eventMap.get(order.eventOccurrenceId)?.startDate : undefined })),
  ].filter(entry => !filters.values.kind || entry.kind === filters.values.kind)
    .sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));

  const loading = factionOrders.isLoading || generalOrders.isLoading;
  const error = factionOrders.error || generalOrders.error;
  const statusChip = (status: string) => status === 'preparing'
    ? <Chip size="small" color="warning" variant="outlined" label={t('enum.value.preparing')} />
    : <Chip size="small" color="info" variant="outlined" label={t('enum.value.submitted')} />;

  return <Stack spacing={1.5}>
    <TaskToolbar state={filters} count={entries.length} more={(filters.values.kind !== 'general' && factionOrders.hasNextPage) || (filters.values.kind !== 'faction' && generalOrders.hasNextPage)} loading={factionOrders.isFetching || generalOrders.isFetching}
      filters={[taskStatusFilter(t, ['submitted', 'preparing'], false),
        { key: 'eventId', label: t('operations.reportsPanel.event'), options: [{ value: '', label: t('operations.tasks.allEvents') }, ...events.map(event => ({ value: event.id, label: event.name }))] },
        { key: 'kind', label: t('operations.tasks.origin'), options: [{ value: '', label: t('operations.tasks.allTypes') }, { value: 'faction', label: t('common.faction') }, { value: 'general', label: t('operations.orderPreparationPanel.generalOrder') }] }]} />
    <Typography variant="body2" color="text.secondary">
      {t('operations.orderPreparationPanel.submittedFactionAndGeneralOrdersThatStillNeedToBe')}
    </Typography>
    {loading && <LinearProgress />}
    {error && <Alert severity="error">{error.message}</Alert>}
    {!loading && !error && !entries.length && <Alert severity="info">{t(filters.changed ? 'operations.tasks.noMatches' : 'operations.orderPreparationPanel.noOrdersWaitingForPreparation')}</Alert>}
    {entries.map((entry) => entry.kind === 'faction'
      ? <OperationListEntry key={`faction-${entry.order.id}`}
          title={<Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}><span>{entry.order.orderCode}</span>{statusChip(entry.order.status)}</Stack>}
          actions={[{ key: 'prepare', label: entry.order.status === 'preparing' ? t('operations.orderPreparationPanel.continue') : t('operations.orderPreparationPanel.prepare'),
            title: translate('operations.orderPreparationPanel.openTheOrderListToPrepareIt'), variant: 'contained', pinned: true, to: `/orders/faction/${entry.order.id}` }]}>
          <Typography>{t('common.faction')} {entry.order.faction} · {entry.order.eventType} · {formatDate(entry.order.eventDate)}</Typography>
          <OperationDetail label={t('common.requestedPickup')}>{entry.order.requestedPickupDate != null ? formatDate(entry.order.requestedPickupDate) : undefined}</OperationDetail>
          <OperationDetail label={t('operations.orderPreparationPanel.progress')}>
            {`${sum(entry.order.preparedQuantities) + sum(entry.order.preparedAssemblyQuantities)}/${sum(entry.order.requestedQuantities) + sum(entry.order.requestedAssemblyQuantities)} ${t('operations.orderPreparationPanel.listUnits')}`}
          </OperationDetail>
        </OperationListEntry>
      : <OperationListEntry key={`general-${entry.order.id}`}
          title={<Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}><span>{entry.order.name}</span>{statusChip(entry.order.status)}</Stack>}
          actions={[{ key: 'prepare', label: t('operations.orderPreparationPanel.prepare'), title: translate('operations.orderPreparationPanel.enterPreparedQuantitiesAndAssetAssignments'),
            variant: 'contained', pinned: true, onClick: () => setPreparing(entry.order) }]}>
          <Typography>{t('operations.orderPreparationPanel.generalOrder')} · {(() => {
            const event = entry.order.eventOccurrenceId ? eventMap.get(entry.order.eventOccurrenceId) : undefined;
            return event ? `${event.name} · ${formatDate(event.startDate)}` : t('operations.orderPreparationPanel.noEvent');
          })()}</Typography>
          <OperationDetail label={t('operations.orderPreparationPanel.purpose')}>{entry.order.purpose}</OperationDetail>
          <OperationDetail label={t('nav.items')}>
            {Object.entries(entry.order.requestedQuantities ?? {}).map(([id, quantity]) => `${entry.order.itemNames?.[id] ?? id} × ${quantity}`).join(', ')}
          </OperationDetail>
        </OperationListEntry>)}
    {filters.values.kind !== 'general' && <LoadMore list={factionOrders} />}{filters.values.kind !== 'faction' && <LoadMore list={generalOrders} />}
    {preparing && <GeneralOrderWorkflow order={preparing} action="prepare" onClose={() => setPreparing(null)} />}
  </Stack>;
}
