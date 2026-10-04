import { useSourceLocationOptions } from '../../hooks/useStockLookups';
import { useEquipmentAvailability } from '../../hooks/useEquipment';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Stack, Typography } from '@mui/material';
import type { GeneralOrderSummary, Item } from '../../types';
import type { GeneralOrderReturnInput } from '../../types/order';
import { optionalText } from '../../utils/inputValues';
import { getItemAssets } from '../../services/inventoryService';
import { generalOrderCommand, generalOrderApi } from '../../services/orderService';
import { OperationForm, type Field, type Values } from '../operations/OperationForm';
import { useLocalizedText } from '../../utils/naming';
import { useAuth } from '../../hooks/useAuth';
import { canManageUsers } from '../../utils/access';

/** `itemIds` limits the form to some of the order's items, e.g. a quick return of one checked-out line. */
export function GeneralOrderWorkflow({ order, action, items, itemIds, onClose }: { order: GeneralOrderSummary; action: 'prepare' | 'pickup' | 'return' | 'history'; items: Item[]; itemIds?: string[]; onClose: () => void }) {
  const history = useQuery({ queryKey: ['general-orders', 'detail', order.id], queryFn: () => generalOrderApi.getById(order.id), enabled: action === 'history' });
  const sourceOptions = useSourceLocationOptions(action === 'prepare');
  const equipment = useEquipmentAvailability(order.eventOccurrenceId);
  const t = useLocalizedText(); const { user } = useAuth(); const [key] = useState(() => crypto.randomUUID());
  const assets = useQuery({ queryKey: ['items', 'general-assets', order.id], queryFn: async () => {
    const ids = Object.keys(order.requestedQuantities).filter((id) => items.find((item) => item.id === id)?.trackingMode === 'serialized');
    return Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await getItemAssets(id)] as const)));
  }, enabled: action !== 'history' });
  const ids = Object.keys(action === 'return' ? order.handedOverQuantities : order.requestedQuantities).filter((id) => !itemIds || itemIds.includes(id));
  const outstanding = (id: string) => (order.handedOverQuantities[id] ?? 0) - (order.returnedQuantities[id] ?? 0) - (order.consumedQuantities[id] ?? 0) - (order.damagedQuantities?.[id] ?? 0) - (order.writtenOffQuantities?.[id] ?? 0);
  const fields: Field[] = ids.flatMap((id): Field[] => {
    const item = items.find((value) => value.id === id); const name = order.itemNames?.[id] ?? item?.name ?? id;
    // Only items stored in several places need a source choice.
    const sources = action === 'prepare' && item?.trackingMode !== 'serialized' ? sourceOptions(id, order.sourceLocations?.[id]) : undefined;
    if (action === 'prepare') return [
      ...(sources ? [{ key: `source:${id}`, label: `${name} · ${t('Quelllager', 'Source location')}`, options: sources, help: t('Leer = Standardlager des Artikels.', 'Empty = item default location.') }] : []),
      { key: `prepare:${id}`, label: `${name} · ${t('Vorbereitet', 'Prepared')}`, type: 'number', min: 0, max: order.requestedQuantities[id], required: true, help: `${t('Angefragt', 'Requested')}: ${order.requestedQuantities[id]}` },
      ...(assets.data?.[id] ?? []).filter((asset) => (asset.availabilityStatus === 'available' && (!equipment.data?.[id] || equipment.data[id].assetIds.includes(asset.id))) || order.assetAssignments[id]?.includes(asset.id)).map((asset): Field => ({ key: `asset:${asset.id}`, label: `${asset.assetCode} · ${asset.currentLocationName ?? ''}`, type: 'checkbox' })),
    ];
    if (action !== 'return' || outstanding(id) <= 0) return [];
    if (item?.trackingMode === 'serialized') return (order.assetAssignments[id] ?? []).filter((assetId) => !order.reconciledAssets?.[id]?.includes(assetId)).map((assetId): Field => ({ key: `outcome:${assetId}`, label: `${name} · ${assets.data?.[id]?.find((asset) => asset.id === assetId)?.assetCode ?? assetId}`, options: [{ value: 'missing', label: t('Vermisst (bleibt ausstehend)', 'Missing (remains outstanding)') }, { value: 'returned', label: t('Intakt zurück', 'Returned good') }, { value: 'damaged', label: t('Beschädigt zurück', 'Returned damaged') }, ...(canManageUsers(user) ? [{ value: 'writtenOff', label: t('Abschreiben', 'Write off') }] : [])], help: t('Leer lassen, wenn weiterhin ausstehend.', 'Leave empty if still outstanding.') }));
    return [
      { key: `returned:${id}`, label: `${name} · ${t('Intakt zurück', 'Returned good')}`, type: 'number', min: 0, max: outstanding(id) },
      ...(item?.isConsumable ? [{ key: `consumed:${id}`, label: t('Verbraucht', 'Consumed'), type: 'number' as const, min: 0, max: outstanding(id) }] : []),
      { key: `damaged:${id}`, label: t('Beschädigt zurück', 'Returned damaged'), type: 'number', min: 0, max: outstanding(id) },
      { key: `missing:${id}`, label: t('Aktuell vermisst (Gesamtmenge)', 'Currently missing (total)'), type: 'number', min: 0, max: outstanding(id) },
      ...(canManageUsers(user) ? [{ key: `writtenOff:${id}`, label: t('Abschreiben', 'Write off'), type: 'number' as const, min: 0, max: outstanding(id) }] : []),
    ];
  });
  const initial: Values = {};
  if (action === 'prepare') {
    ids.forEach((id) => { initial[`prepare:${id}`] = order.preparedQuantities?.[id] ?? 0; initial[`source:${id}`] = order.sourceLocations?.[id] ?? ''; });
    Object.values(order.assetAssignments).flat().forEach((asset) => { initial[`asset:${asset}`] = true; });
  }
  return <OperationForm title={`${order.name} · ${action}`} initial={initial} fields={action === 'history' ? [] : [...fields, { key: 'notes', label: t('Notiz / Begründung', 'Notes / reason'), multiline: true, required: action === 'return' }]} onClose={onClose} onSave={async (values) => {
    if (action === 'history') return;
    if (action === 'prepare') {
      const preparedQuantities = Object.fromEntries(ids.map((id) => [id, Number(values[`prepare:${id}`] || 0)]));
      const assetAssignments = Object.fromEntries(ids.map((id) => [id, (assets.data?.[id] ?? []).filter((asset) => values[`asset:${asset.id}`]).map((asset) => asset.id)]));
      return generalOrderCommand(order.id, action, { preparedQuantities, assetAssignments, sourceLocations: Object.fromEntries(ids.filter((id) => values[`source:${id}`]).map((id) => [id, String(values[`source:${id}`])])), notes: optionalText(values.notes), idempotencyKey: key });
    }
    if (action === 'return') {
      const data: GeneralOrderReturnInput = { idempotencyKey: key, notes: optionalText(values.notes) };
      for (const outcome of ['returned', 'consumed', 'damaged', 'missing', 'writtenOff'] as const) {
        const quantities: Record<string, number> = {}; const selections: Record<string, string[]> = {};
        for (const id of ids) {
          if (items.find((item) => item.id === id)?.trackingMode === 'serialized') {
            const selected = (order.assetAssignments[id] ?? []).filter((asset) => values[`outcome:${asset}`] === outcome);
            if (selected.length) { quantities[id] = selected.length; selections[id] = selected; }
          } else if (values[`${outcome}:${id}`] !== undefined && values[`${outcome}:${id}`] !== '') quantities[id] = Number(values[`${outcome}:${id}`]);
        }
        data[`${outcome}Quantities`] = quantities;
        if (outcome !== 'consumed') data[`${outcome}Assets`] = selections;
      }
      return generalOrderCommand(order.id, 'return', data);
    }
    return generalOrderCommand(order.id, action, { notes: optionalText(values.notes), idempotencyKey: key });
  }}>
    {history.error && <Alert severity="error">{history.error.message}</Alert>}
    {history.isLoading && <Typography>{t('Verlauf wird geladen…', 'Loading history…')}</Typography>}
    {assets.error && <Alert severity="error">{assets.error.message}</Alert>}
    {action === 'pickup' && <Alert severity="info">{t('Reservierte Artikel werden jetzt übergeben.', 'The reserved items will now be handed over.')}{Object.entries(order.preparedQuantities ?? {}).map(([id, quantity]) => <Typography key={id}>{order.itemNames?.[id]}: {quantity}</Typography>)}</Alert>}
    {action === 'history' && <Stack spacing={2}>{history.data?.history.map((entry) => <Stack key={entry.id}><Typography>{entry.action} · {entry.actorName} · {new Date(entry.timestamp).toLocaleString()}</Typography><Typography>{entry.notes}</Typography></Stack>)}</Stack>}
  </OperationForm>;
}
