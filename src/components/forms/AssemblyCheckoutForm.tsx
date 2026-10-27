import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@mui/material';
import type { Assembly, Item, TransactionFormData } from '../../types';
import type { Field, Values } from '../../types/operationForm';
import { useEventReports } from '../../hooks/useEvents';
import { useFactionCatalog } from '../../hooks/useFactionCatalog';
import { useStockLookups } from '../../hooks/useStockLookups';
import { getAllItemAssets } from '../../services/inventoryService';
import { operationsApi } from '../../services/operationsService';
import { loadAllPages } from '../../services/apiPagination';
import { apiRequest } from '../../services/apiClient';
import { OperationForm } from '../operations/OperationForm';
import { QueryFeedback } from '../common/QueryFeedback';
import { Dialog } from '../shared/ClosableDialog';
import { formatQuantity } from '../../utils/stock';
import { useT } from '../../utils/naming';

/** One reviewable allocation per physical source/unit, posted atomically with stable retry keys. */
export function AssemblyCheckoutForm({ assembly, items, onClose }: { assembly: Assembly; items: Item[]; onClose: () => void }) {
  const t = useT(); const events = useEventReports(); const factions = useFactionCatalog();
  const lookup = useStockLookups(); const keys = useRef(new Map<string, string>());
  const sources = useQuery({ queryKey: ['assemblies', assembly.id, 'checkout-sources'], queryFn: async () =>
    Promise.all(items.map(async item => ({ item,
      assets: item.trackingMode === 'serialized' ? await getAllItemAssets(item.id) : [],
      positions: item.trackingMode === 'serialized' ? [] : await loadAllPages(operationsApi.positions({ itemId: item.id })),
    }))) });
  const error = sources.error || lookup.error;
  if (!sources.data || lookup.loading || error) return <Dialog open onClose={onClose}><QueryFeedback isLoading={!error} error={error} /></Dialog>;
  const initial: Values = { amount: 1, eventId: '', faction: '', notes: '' };
  for (const { item, positions } of sources.data) {
    let left = assembly.itemQuantities[item.id] ?? 1;
    for (const position of positions) {
      const quantity = Math.min(left, position.availableQuantity);
      initial[`position:${position.id}`] = quantity; left -= quantity;
    }
    if (!positions.length && item.trackingMode !== 'serialized') initial[`unlocated:${item.id}`] = left;
  }
  function keyFor(source: string) {
    if (!keys.current.has(source)) keys.current.set(source, crypto.randomUUID());
    return keys.current.get(source)!;
  }
  return <OperationForm title={t('pages.assemblyDetail.checkOutAssembly')} initial={initial} onClose={onClose} fields={(values): Field[] => {
    const event = events.data?.find(event => event.id === values.eventId);
    return [
      { key: 'amount', label: t('pages.assemblyDetail.quantityToCheckOut'), type: 'number', min: 1, required: true },
      { key: 'eventId', label: t('operations.purchasingOperations.eventOptional'), options: (events.data ?? []).filter(event => event.status !== 'completed').map(event => ({ value: event.id, label: event.name })), reset: { faction: '' } },
      ...(event ? [{ key: 'faction', label: t('common.faction'), required: true, options: factions.factionNames(event.eventType).map(name => ({ value: name, label: name })) }] : []),
      ...sources.data!.flatMap(({ item, assets, positions }): Field[] => {
        const needed = (assembly.itemQuantities[item.id] ?? 1) * Number(values.amount || 0);
        const help = `${t('enum.value.requested')}: ${formatQuantity(item, needed)}`;
        if (item.trackingMode === 'serialized') return assets.filter(asset => asset.active && asset.availabilityStatus === 'available'
          && !['damaged', 'unsafe', 'lost'].includes(asset.conditionStatus) && !['overdue', 'in_service'].includes(asset.serviceStatus))
          .map(asset => ({ key: `asset:${asset.id}`, label: `${item.name} · ${asset.assetCode} · ${asset.currentLocationName ?? ''}`, type: 'checkbox', help }));
        if (!positions.length) return [{ key: `unlocated:${item.id}`, label: item.name, type: 'quantity', measure: item, min: 0, help }];
        return positions.filter(position => position.availableQuantity > 0).map(position => ({ key: `position:${position.id}`,
          label: `${item.name} · ${lookup.locationOptions.find(location => location.value === position.locationId)?.label ?? position.locationId}`,
          type: 'quantity', measure: item, min: 0, max: position.availableQuantity, help }));
      }),
      { key: 'notes', label: t('common.notes2'), multiline: true },
    ];
  }} onSave={async values => {
    const event = events.data?.find(event => event.id === values.eventId);
    const rows: (TransactionFormData & { idempotencyKey: string })[] = [];
    const amount = Number(values.amount);
    if (!Number.isSafeInteger(amount) || amount < 1 || event && !values.faction) throw new Error(t('enum.value.requested'));
    for (const { item, assets, positions } of sources.data!) {
      const common = { itemId: item.id, transactionType: 'checkout' as const, reason: `Assembly checkout: ${assembly.name}`,
        notes: String(values.notes || ''), eventOccurrenceId: event?.id, eventType: event?.eventType, faction: event ? String(values.faction) : undefined };
      const needed = (assembly.itemQuantities[item.id] ?? 1) * amount;
      const selected = item.trackingMode === 'serialized'
        ? assets.filter(asset => values[`asset:${asset.id}`]).map(asset => ({ ...common, quantityChanged: 1, assetInstanceId: asset.id, idempotencyKey: '' }))
        : positions.length ? positions.filter(position => Number(values[`position:${position.id}`]) > 0).map(position => ({ ...common,
          quantityChanged: Number(values[`position:${position.id}`]), locationId: position.locationId, lotId: position.lotId,
          idempotencyKey: '' }))
          : [{ ...common, quantityChanged: Number(values[`unlocated:${item.id}`] || 0), idempotencyKey: '' }];
      if (!Number.isSafeInteger(needed) || selected.some(row => !Number.isSafeInteger(row.quantityChanged) || row.quantityChanged < 1)
        || selected.reduce((sum, row) => sum + row.quantityChanged, 0) !== needed)
        throw new Error(`${item.name}: ${t('enum.value.requested')} ${formatQuantity(item, needed)}`);
      rows.push(...selected.map(row => ({ ...row, idempotencyKey: keyFor(JSON.stringify(row)) })));
    }
    await apiRequest('/api/transactions/batch', { method: 'POST', body: rows });
  }}><Alert severity="info">{t('pages.assemblyDetail.thisChecksOutEveryItemInNameInTheSpecified', { name: assembly.name })}</Alert></OperationForm>;
}
