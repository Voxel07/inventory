import { HandoverEvidencePanel } from './detail/HandoverEvidencePanel';
import { parseHoursRun, readingAfter } from '../../utils/runtimeHours';
import { useEventReports } from '../../hooks/useEvents';
import { formatDateTime } from '../../utils/dateFormat';
import { useEquipmentAvailability } from '../../hooks/useEquipment';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Stack, Typography } from '@mui/material';
import type { GeneralOrderSummary } from '../../types';
import type { OrderReturnInput } from '../../types/orderCommands';
import { optionalText } from '../../utils/inputValues';
import { getAllItemAssets } from '../../services/inventoryService';
import { useItemsByIds } from '../../hooks/useItems';
import { generalOrderCommand, generalOrderApi } from '../../services/orderService';
import { OperationForm } from '../operations/OperationForm';
import type { Field, Values } from '../../types/operationForm';
import { useT } from '../../utils/naming';
import { useAuth } from '../../hooks/useAuth';
import { canManageUsers } from '../../utils/access';
import { CustodyEvidence } from './CustodyEvidence';
import { restockOrder } from '../../services/orderCommands';
import { formatQuantity, fromSteps, toSteps, usesPercentage } from '../../utils/stock';

/**
 * `itemIds` limits the form to some of the order's items, e.g. a quick return of one checked-out line. `restock` brings
 * unused consumables back on its own, also once the order is returned or closed; the return offers the same rows.
 */
export function GeneralOrderWorkflow({ order, action, itemIds, onClose }: { order: GeneralOrderSummary; action: 'prepare' | 'pickup' | 'return' | 'restock' | 'history'; itemIds?: string[]; onClose: () => void }) {
  // Only this order's items are read, never the catalog.
  const { data: items = [], isSuccess: itemsLoaded } = useItemsByIds(Object.keys(order.requestedQuantities));
  const history = useQuery({ queryKey: ['general-orders', 'detail', order.id], queryFn: () => generalOrderApi.getById(order.id), enabled: action === 'history' });
  const equipment = useEquipmentAvailability(order.eventOccurrenceId);
  const t = useT(); const { user } = useAuth(); const [key] = useState(() => crypto.randomUUID());
  // Its own command key: the return's key is already recorded on the order history.
  const [restockKey] = useState(() => crypto.randomUUID());
  const assets = useQuery({ queryKey: ['items', 'general-assets', order.id], queryFn: async () => {
    const ids = Object.keys(order.requestedQuantities).filter((id) => items.find((item) => item.id === id)?.trackingMode === 'serialized');
    return Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await getAllItemAssets(id)] as const)));
  }, enabled: action !== 'history' && itemsLoaded });
  const ids = Object.keys(action === 'return' || action === 'restock' ? order.handedOverQuantities : order.requestedQuantities).filter((id) => !itemIds || itemIds.includes(id));
  // Unused consumables: optional, capped at what the order still books as consumed.
  const restockable = (id: string) => Boolean(items.find((item) => item.id === id)?.isConsumable) && (order.consumedQuantities[id] ?? 0) > 0;
  const outstanding = (id: string) => (order.handedOverQuantities[id] ?? 0) - (order.returnedQuantities[id] ?? 0) - (order.consumedQuantities[id] ?? 0) - (order.damagedQuantities?.[id] ?? 0) - (order.writtenOffQuantities?.[id] ?? 0);
  const eventName = useEventReports().data?.find((event) => event.id === order.eventOccurrenceId)?.name;
  const hoursHelp = eventName ? t('items.runtimeReturnField.bookedToEvent', { event: eventName }) : t('items.runtimeReturnField.bookedWithoutEvent');
  const hoursField = (key: string, label: string): Field => ({ key, label: `${label} · ${t('items.runtimeReturnField.hoursRun')}`, type: 'number', min: 0, step: 0.1, required: true, help: hoursHelp });
  const fields = (values: Values): Field[] => ids.flatMap((id): Field[] => {
    const item = items.find((value) => value.id === id); const name = order.itemNames?.[id] ?? item?.name ?? id;
    // No source choice: the backend takes the item's default location, or the location with free stock.
    if (action === 'prepare') return [
      { key: `prepare:${id}`, label: `${name} · ${t('common.prepared')}${usesPercentage(item) ? ' (%)' : ''}`, type: 'number', min: 0, max: order.requestedQuantities[id], required: true,
        help: [usesPercentage(item) && t('forms.itemForm.percentageCapacity', { quantity: formatQuantity(item, 100) }), `${t('orders.generalOrderWorkflow.requested')}: ${formatQuantity(item, order.requestedQuantities[id])}`].filter(Boolean).join(' ') },
      ...(assets.data?.[id] ?? []).filter((asset) => (asset.availabilityStatus === 'available' && (!equipment.data?.[id] || equipment.data[id].assetIds.includes(asset.id))) || order.assetAssignments[id]?.includes(asset.id)).map((asset): Field => ({ key: `asset:${asset.id}`, label: `${asset.assetCode} · ${asset.currentLocationName ?? ''}`, type: 'checkbox' })),
    ];
    if ((action === 'return' || action === 'restock') && restockable(id) && item) {
      const consumed = order.consumedQuantities[id] ?? 0;
      return [{ key: `restock:${id}`, label: `${name} · ${t('orders.restockUnused.unusedAmount')}${usesPercentage(item) ? ' (%)' : item.unit ? ` (${item.unit})` : ''}`, type: 'number',
        min: 0, step: 1, max: usesPercentage(item) ? consumed : fromSteps(item, consumed),
        help: [usesPercentage(item) && t('forms.itemForm.percentageCapacity', { quantity: formatQuantity(item, 100) }), t('orders.restockUnused.consumed', { quantity: formatQuantity(item, consumed) })].filter(Boolean).join(' ') }];
    }
    if (action !== 'return' || outstanding(id) <= 0) return [];
    if (item?.trackingMode === 'serialized') return (order.assetAssignments[id] ?? []).filter((assetId) => !order.reconciledAssets?.[id]?.includes(assetId)).flatMap((assetId): Field[] => {
      const label = `${name} · ${assets.data?.[id]?.find((asset) => asset.id === assetId)?.assetCode ?? assetId}`;
      const backInStock = ['returned', 'damaged'].includes(String(values[`outcome:${assetId}`] ?? ''));
      return [{ key: `outcome:${assetId}`, label, options: [{ value: 'missing', label: t('orders.generalOrderWorkflow.missingRemainsOutstanding') }, { value: 'returned', label: t('orders.generalOrderWorkflow.returnedGood') }, { value: 'damaged', label: t('orders.generalOrderWorkflow.returnedDamaged') }, ...(canManageUsers(user) ? [{ value: 'writtenOff', label: t('common.writeOff') }] : [])], help: t('orders.generalOrderWorkflow.leaveEmptyIfStillOutstanding') },
        ...(item.tracksRuntime && backInStock ? [hoursField(`hours:${assetId}`, label)] : [])];
    });
    return [
      { key: `returned:${id}`, label: `${name} · ${t('orders.generalOrderWorkflow.returnedGood')}`, type: 'number', min: 0, max: outstanding(id) },
      { key: `damaged:${id}`, label: t('orders.generalOrderWorkflow.returnedDamaged'), type: 'number', min: 0, max: outstanding(id) },
      { key: `missing:${id}`, label: t('orders.generalOrderWorkflow.currentlyMissingTotal'), type: 'number', min: 0, max: outstanding(id) },
      ...(canManageUsers(user) ? [{ key: `writtenOff:${id}`, label: t('common.writeOff'), type: 'number' as const, min: 0, max: outstanding(id) }] : []),
      ...(item?.tracksRuntime && Number(values[`returned:${id}`] || 0) + Number(values[`damaged:${id}`] || 0) > 0 ? [hoursField(`hours:${id}`, name)] : []),
    ];
  });
  const initial: Values = {};
  if (action === 'prepare') {
    ids.forEach((id) => { initial[`prepare:${id}`] = order.preparedQuantities?.[id] ?? 0; });
    Object.values(order.assetAssignments).flat().forEach((asset) => { initial[`asset:${asset}`] = true; });
  }
  if (action === 'return') ids.forEach((id) => { initial[`missing:${id}`] = order.missingQuantities[id] ?? 0; });
  return <OperationForm title={`${order.name} · ${action}`} initial={initial} fields={action === 'history' ? [] : (values) => [...fields(values), { key: 'notes', label: t('orders.generalOrderWorkflow.notesReason'), multiline: true, required: action === 'return' && ids.some((id) => outstanding(id) > 0) }]} onClose={onClose} onSave={async (values) => {
    if (action === 'history') return;
    // Percentage inputs already represent the integer steps of one full unit.
    const restock = Object.fromEntries(ids.filter(restockable).map((id) => {
      const item = items.find((item) => item.id === id);
      return [id, toSteps(item, String(values[`restock:${id}`] || 0), usesPercentage(item))];
    })
      .filter(([, steps]) => Number(steps) > 0));
    const restockUnused = () => restockOrder('general', order.id, { quantities: restock, idempotencyKey: restockKey, notes: optionalText(values.notes) });
    if (action === 'restock') return Object.keys(restock).length ? restockUnused() : undefined;
    if (action === 'prepare') {
      const preparedQuantities = Object.fromEntries(ids.map((id) => [id, Number(values[`prepare:${id}`] || 0)]));
      const assetAssignments = Object.fromEntries(ids.map((id) => [id, (assets.data?.[id] ?? []).filter((asset) => values[`asset:${asset.id}`]).map((asset) => asset.id)]));
      return generalOrderCommand(order.id, action, { preparedQuantities, assetAssignments, notes: optionalText(values.notes), idempotencyKey: key });
    }
    if (action === 'return') {
      const data: OrderReturnInput = { lines: {}, assets: {}, idempotencyKey: key, notes: optionalText(values.notes) };
      const outcomeNames = { returned: 'returned_good', damaged: 'returned_damaged', missing: 'missing', writtenOff: 'written_off' } as const;
      for (const id of ids.filter((id) => outstanding(id) > 0)) {
        const line = { returned: 0, damaged: 0, missing: 0, writtenOff: 0, notes: optionalText(values.notes) ?? undefined };
        if (items.find((item) => item.id === id)?.trackingMode === 'serialized') {
          for (const assetId of (order.assetAssignments[id] ?? []).filter((asset) => !order.reconciledAssets[id]?.includes(asset))) {
            const outcome = values[`outcome:${assetId}`];
            const wasMissing = assets.data?.[id]?.find((asset) => asset.id === assetId)?.availabilityStatus === 'lost';
            if (outcome === 'returned' || outcome === 'damaged' || outcome === 'writtenOff' || outcome === 'missing') {
              line[outcome]++;
              const asset = assets.data?.[id]?.find((candidate) => candidate.id === assetId);
              const hours = outcome === 'returned' || outcome === 'damaged' ? parseHoursRun(String(values[`hours:${assetId}`] ?? '')) : undefined;
              if (outcome !== 'missing' || !wasMissing) data.assets![assetId] = { outcome: outcomeNames[outcome], operatingHours: readingAfter(asset?.operatingHours, hours) };
            } else if (wasMissing) line.missing++;
          }
        } else {
          for (const outcome of ['returned', 'damaged', 'missing', 'writtenOff'] as const)
            line[outcome] = Number(values[`${outcome}:${id}`] || 0);
          const item = items.find((candidate) => candidate.id === id);
          if (item?.tracksRuntime) Object.assign(line, { operatingHours: readingAfter(item.currentOperatingHours, parseHoursRun(String(values[`hours:${id}`] ?? ''))) });
        }
        data.lines[id] = line;
      }
      const returned = Object.keys(data.lines).length ? await generalOrderCommand(order.id, 'return', data) : undefined;
      return Object.keys(restock).length ? restockUnused() : returned;
    }
    return generalOrderCommand(order.id, action, { notes: optionalText(values.notes), idempotencyKey: key });
  }}>
    {history.error && <Alert severity="error">{history.error.message}</Alert>}
    {history.isLoading && <Typography>{t('orders.generalOrderWorkflow.loadingHistory')}</Typography>}
    {assets.error && <Alert severity="error">{assets.error.message}</Alert>}
    {action === 'pickup' && <Alert severity="info">{t('orders.generalOrderWorkflow.theReservedItemsWillNowBeHandedOver')}{Object.entries(order.preparedQuantities ?? {}).map(([id, quantity]) => <Typography key={id}>{order.itemNames?.[id]}: {quantity}</Typography>)}</Alert>}
    {action === 'history' && <Stack spacing={2}>{history.data?.history.map((entry) => <Stack key={entry.id}><Typography>{entry.action} · {entry.userName} · {formatDateTime(entry.timestamp)}</Typography><Typography>{entry.note}</Typography></Stack>)}</Stack>}
    {action === 'history' && <><HandoverEvidencePanel orderId={order.id} /><CustodyEvidence orderId={order.id} kind={order.kind} /></>}
  </OperationForm>;
}
