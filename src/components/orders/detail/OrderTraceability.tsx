import { useMemo } from 'react';
import { Alert, Box, Button, Chip, Divider, Paper, Stack, Typography } from '@mui/material';
import type { Assembly, FactionOrder, FactionOrderHistoryAction, FactionOrderHistoryEntry, Item } from '../../../types';
import { useAppLanguage, useLocalizedText } from '../../../utils/naming';
import { factionOrderAssemblyBaseline, factionOrderItemBaseline, findPreviousFactionOrder } from '../../../utils/factionOrderHistory';

interface OrderTraceabilityProps {
  order: FactionOrder;
  allOrders: FactionOrder[];
  itemMap: Map<string, Item>;
  assemblyMap: Map<string, Assembly>;
  onOpenOrder: (id: string) => void;
}

function relationName(value: { name?: string; username?: string; email?: string } | undefined, fallback?: string) {
  return value?.name || value?.username || value?.email || fallback || '—';
}

export function OrderTraceability({ order, allOrders, itemMap, assemblyMap, onOpenOrder }: OrderTraceabilityProps) {
  const t = useLocalizedText();
  const language = useAppLanguage();
  const locale = language === 'de' ? 'de-DE' : 'en-US';
  const previousOrder = useMemo(() => findPreviousFactionOrder(allOrders, {
    eventType: order.eventType,
    faction: order.faction,
    eventDate: order.eventDate,
    excludeId: order.id,
  }), [allOrders, order]);

  const comparison = useMemo(() => {
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
  }, [assemblyMap, itemMap, order, previousOrder]);

  const labels: Record<FactionOrderHistoryAction, string> = {
    created: t('Liste erstellt', 'List created'),
    updated: t('Liste geändert', 'List updated'),
    historical_correction: t('Historische Verwendung korrigiert', 'Historical usage corrected'),
    submitted: t('Bedarf freigegeben', 'Request submitted'),
    submission_reopened: t('Freigabe zurückgenommen', 'Submission reopened'),
    preparation_started: t('Vorbereitung begonnen', 'Preparation started'),
    preparation_saved: t('Vorbereitung gespeichert', 'Preparation saved'),
    preparation_reopened: t('Vorbereitung wieder geöffnet', 'Preparation reopened'),
    ready: t('Abholbereit markiert', 'Marked ready'),
    picked_up: t('Liste ausgegeben', 'Order checked out'),
    partially_returned: t('Teilrückgabe erfasst', 'Partial return recorded'),
    returned: t('Liste zurückgegeben', 'Order returned'),
    closed: t('Liste abgeschlossen', 'Order closed'),
    cancelled: t('Liste storniert', 'Order cancelled'),
  };

  function deltaChips(entry: FactionOrderHistoryEntry) {
    const snapshot = entry.deltaSnapshot;
    const chips: Array<{ key: string; label: string; color: 'success' | 'error' | 'default' }> = [];
    const add = (kind: string, values: Record<string, number> | undefined, lookup: Map<string, Item | Assembly>, color: 'success' | 'error') => {
      Object.entries(values ?? {}).forEach(([id, quantity]) => chips.push({
        key: `${kind}-${id}`,
        label: `${kind === 'added' ? t('Hinzugefügt', 'Added') : t('Entfernt', 'Removed')}: ${quantity}× ${lookup.get(id)?.name ?? id}`,
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

  const metadata = [
    [t('Erstellt von', 'Created by'), relationName(order.expand?.createdBy, createdHistory?.userName), createdHistory?.timestamp ?? order.created],
    [t('Vorbereitet von', 'Prepared by'), relationName(order.expand?.preparedBy, preparedHistory?.userName), preparedHistory?.timestamp],
    [t('Abholbereit durch', 'Made ready by'), relationName(order.expand?.readyBy, readyHistory?.userName), readyHistory?.timestamp],
    [t('Ausgegeben von', 'Checked out by'), relationName(order.expand?.pickedUpBy, pickupHistory?.userName), pickupHistory?.timestamp],
    [t('Zurückgenommen von', 'Returned by'), relationName(order.expand?.returnedBy, returnedHistory?.userName), returnedHistory?.timestamp],
  ];

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>{t('Nachvollziehbarkeit', 'Traceability')}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1, mb: 2 }}>
        {metadata.map(([label, actor, timestamp]) => (
          <Paper key={label} variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', overflowWrap: 'anywhere' }}>{actor}</Typography>
            <Typography variant="caption">{timestamp ? new Date(timestamp).toLocaleString(locale) : '—'}</Typography>
          </Paper>
        ))}
      </Box>

      {previousOrder && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('Änderungen zur vorherigen Liste', 'Changes from the previous list')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('Vergleichsbasis', 'Comparison baseline')}: {previousOrder.orderCode} · {new Date(previousOrder.eventDate).toLocaleDateString(locale)}
          </Typography>
          {comparison.length ? (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {comparison.map((change) => <Chip key={change.key} color={change.after > change.before ? 'primary' : 'default'} label={`${change.name}: ${change.before} → ${change.after}`} />)}
            </Stack>
          ) : <Alert severity="success">{t('Keine Mengenänderungen.', 'No quantity changes.')}</Alert>}
          <Button size="small" sx={{ mt: 1.5 }} onClick={() => onOpenOrder(previousOrder.id)}>{t('Vorherige Liste öffnen', 'Open previous list')}</Button>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{t('Unveränderlicher Listenverlauf', 'Immutable order history')}</Typography>
        {!order.history?.length ? <Alert severity="warning">{t('Für diese Liste liegt kein Verlauf vor.', 'No history is available for this order.')}</Alert> : (
          <Stack divider={<Divider flexItem />}>
            {[...order.history].reverse().map((entry, index) => (
              <Stack key={`${entry.timestamp}-${entry.action}-${index}`} direction="row" spacing={1.5} sx={{ py: 1.25 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: index === 0 ? 'primary.main' : 'text.disabled', mt: 0.75, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }}>{labels[entry.action]}</Typography>
                  <Typography variant="body2" color="text.secondary">{entry.userName} · {new Date(entry.timestamp).toLocaleString(locale)}</Typography>
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
