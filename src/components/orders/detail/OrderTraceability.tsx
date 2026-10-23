import { HandoverEvidencePanel } from './HandoverEvidencePanel';
import { CopyOrderDraft } from './CopyOrderDraft';
import { formatDate, formatDateTime } from '../../../utils/dateFormat';
import { Button } from '../../shared/ActionButtons';
import { useState } from 'react';
import { Alert, Box, Chip, Divider, Paper, Stack, Typography } from '@mui/material';
import type { Assembly, FactionOrder, FactionOrderSummary, FactionOrderHistoryAction, FactionOrderHistoryEntry, Item } from '../../../types';
import { translate, useT } from '../../../utils/naming';
import { factionOrderAssemblyBaseline, factionOrderItemBaseline, findPreviousFactionOrder } from '../../../utils/factionOrderHistory';

interface OrderTraceabilityProps {
  order: FactionOrder;
  /** Orders of the same faction and event type; the previous one is compared. */
  allOrders: FactionOrderSummary[];
  itemMap: Map<string, Item>;
  assemblyMap: Map<string, Assembly>;
  onOpenOrder: (id: string) => void;
}

function relationName(value: { name?: string; username?: string; email?: string } | undefined, fallback?: string) {
  return value?.name || value?.username || value?.email || fallback || '—';
}

export function OrderTraceability({ order, allOrders, itemMap, assemblyMap, onOpenOrder }: OrderTraceabilityProps) {
  const t = useT();
  const [comparePrevious, setComparePrevious] = useState(false);
  const previousOrder = findPreviousFactionOrder(allOrders, {
    eventType: order.eventType,
    faction: order.faction,
    eventDate: order.eventDate,
    excludeId: order.id,
  });

  const comparison = (() => {
    if (!previousOrder) return [];
    const changes: Array<{ key: string; name: string; before: number; after: number }> = [];
    const currentItems = factionOrderItemBaseline(order);
    const previousItems = factionOrderItemBaseline(previousOrder);
    for (const id of new Set([...Object.keys(currentItems), ...Object.keys(previousItems)])) {
      const before = previousItems[id] ?? 0;
      const after = currentItems[id] ?? 0;
      if (before !== after) changes.push({ key: `item-${id}`, name: itemMap.get(id)?.name ?? id, before, after });
    }
    const currentAssemblies = factionOrderAssemblyBaseline(order);
    const previousAssemblies = factionOrderAssemblyBaseline(previousOrder);
    for (const id of new Set([...Object.keys(currentAssemblies), ...Object.keys(previousAssemblies)])) {
      const before = previousAssemblies[id] ?? 0;
      const after = currentAssemblies[id] ?? 0;
      if (before !== after) changes.push({ key: `assembly-${id}`, name: assemblyMap.get(id)?.name ?? id, before, after });
    }
    return changes;
  })();

  const labels: Record<FactionOrderHistoryAction, string> = {
    created: t('orders.detail.orderTraceability.listCreated'),
    updated: t('orders.detail.orderTraceability.listUpdated'),
    historical_correction: t('orders.detail.orderTraceability.historicalUsageCorrected'),
    submitted: t('orders.detail.orderTraceability.requestSubmitted'),
    submission_reopened: t('orders.detail.orderTraceability.submissionReopened'),
    preparation_started: t('orders.detail.orderTraceability.preparationStarted'),
    preparation_saved: t('orders.detail.orderTraceability.preparationSaved'),
    preparation_reopened: t('orders.detail.orderTraceability.preparationReopened'),
    ready: t('orders.detail.orderTraceability.markedReady'),
    picked_up: t('orders.detail.orderTraceability.orderCheckedOut'),
    partially_returned: t('orders.detail.orderTraceability.partialReturnRecorded'),
    returned: t('orders.detail.orderTraceability.orderReturned'),
    closed: t('orders.detail.orderTraceability.orderClosed'),
    cancelled: t('orders.detail.orderTraceability.orderCancelled'),
  };

  function deltaChips(entry: FactionOrderHistoryEntry) {
    const snapshot = entry.deltaSnapshot;
    const chips: Array<{ key: string; label: string; color: 'success' | 'error' | 'default' }> = [];
    const add = (kind: string, values: Record<string, number> | undefined, lookup: Map<string, Item | Assembly>, color: 'success' | 'error') => {
      Object.entries(values ?? {}).forEach(([id, quantity]) => chips.push({
        key: `${kind}-${id}`,
        label: `${kind === 'added' ? t('orders.detail.orderTraceability.added') : t('orders.detail.orderTraceability.removed')}: ${quantity}× ${lookup.get(id)?.name ?? id}`,
        color,
      }));
    };
    add('added', snapshot?.addedItems, itemMap, 'success');
    add('removed', snapshot?.removedItems, itemMap, 'error');
    add('added', snapshot?.addedAssemblies, assemblyMap, 'success');
    add('removed', snapshot?.removedAssemblies, assemblyMap, 'error');
    Object.entries(snapshot?.changedItems ?? {}).forEach(([id, value]) => chips.push({ key: `item-${id}`, label: `${itemMap.get(id)?.name ?? id}: ${value.before} → ${value.after}`, color: 'default' }));
    Object.entries(snapshot?.changedAssemblies ?? {}).forEach(([id, value]) => chips.push({ key: `assembly-${id}`, label: `${assemblyMap.get(id)?.name ?? id}: ${value.before} → ${value.after}`, color: 'default' }));
    return chips.length ? (
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
        {chips.map((chip, index) => <Chip key={`${chip.key}-${index}`} size="small" color={chip.color} variant="outlined" label={chip.label} />)}
      </Stack>
    ) : null;
  }

  function latestHistory(...actions: FactionOrderHistoryAction[]) {
    return [...(order.history ?? [])].reverse().find((entry) => actions.includes(entry.action));
  }

  const createdHistory = order.history?.find((entry) => entry.action === 'created');
  const preparedHistory = latestHistory('preparation_saved', 'preparation_started');
  const readyHistory = latestHistory('ready');
  const pickupHistory = latestHistory('picked_up');
  const returnedHistory = latestHistory('returned', 'partially_returned', 'closed');

  const metadata: [string, string, number | undefined][] = [
    [t('orders.detail.orderTraceability.createdBy'), relationName(order.expand?.createdBy, createdHistory?.userName), createdHistory?.timestamp ?? order.created],
    [t('orders.detail.orderTraceability.preparedBy'), relationName(order.expand?.preparedBy, preparedHistory?.userName), preparedHistory?.timestamp],
    [t('orders.detail.orderTraceability.madeReadyBy'), relationName(order.expand?.readyBy, readyHistory?.userName), readyHistory?.timestamp],
    [t('orders.detail.orderTraceability.checkedOutBy'), relationName(order.expand?.pickedUpBy, pickupHistory?.userName), pickupHistory?.timestamp],
    [t('orders.detail.orderTraceability.returnedBy'), relationName(order.expand?.returnedBy, returnedHistory?.userName), returnedHistory?.timestamp],
  ];

  return (
    <Box sx={{ mt: 3 }}>
      <CopyOrderDraft orderId={order.id} eventType={order.eventType} />
      <HandoverEvidencePanel orderId={order.id} />
      <Typography variant="h6" sx={{ mb: 1 }}>{t('orders.detail.orderTraceability.traceability')}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1, mb: 2 }}>
        {metadata.map(([label, actor, timestamp]) => (
          <Paper key={label} variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', overflowWrap: 'anywhere' }}>{actor}</Typography>
            <Typography variant="caption">{timestamp ? formatDateTime(timestamp) : '—'}</Typography>
          </Paper>
        ))}
      </Box>

      {previousOrder && <Button size="small" aria-pressed={comparePrevious} sx={{ mb: 2 }} onClick={() => setComparePrevious(value => !value)}>
        {comparePrevious ? t('orders.detail.orderTraceability.hideComparison') : t('orders.detail.orderTraceability.compareWithPreviousList')}
      </Button>}
      {comparePrevious && previousOrder && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('orders.detail.orderTraceability.changesFromThePreviousList')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('orders.detail.orderTraceability.comparisonBaseline')}: {previousOrder.orderCode} · {formatDate(previousOrder.eventDate)}
          </Typography>
          {comparison.length ? (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {comparison.map((change) => <Chip key={change.key} color={change.after > change.before ? 'primary' : 'default'} label={`${change.name}: ${change.before} → ${change.after}`} />)}
            </Stack>
          ) : <Alert severity="success">{t('orders.detail.orderTraceability.noQuantityChanges')}</Alert>}
          <Button title={translate('orders.detail.orderTraceability.openThePreviousOrderList')} size="small" sx={{ mt: 1.5 }} onClick={() => onOpenOrder(previousOrder.id)}>{t('orders.detail.orderTraceability.openPreviousList')}</Button>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{t('orders.detail.orderTraceability.immutableOrderHistory')}</Typography>
        {!order.history?.length ? <Alert severity="warning">{t('orders.detail.orderTraceability.noHistoryIsAvailableForThisOrder')}</Alert> : (
          <Stack divider={<Divider flexItem />}>
            {[...order.history].reverse().map((entry, index) => (
              <Stack key={`${entry.timestamp}-${entry.action}-${index}`} direction="row" spacing={1.5} sx={{ py: 1.25 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: index === 0 ? 'primary.main' : 'text.disabled', mt: 0.75, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }}>{labels[entry.action]}</Typography>
                  <Typography variant="body2" color="text.secondary">{entry.userName} · {formatDateTime(entry.timestamp)}</Typography>
                  {entry.note && <Typography variant="body2">{entry.note}</Typography>}
                  {deltaChips(entry)}
                </Box>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
