import { Button } from '../shared/ActionButtons';
import { useEffect, useEffectEvent, useState } from 'react';
import { Alert, Box, DialogActions, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { AssetInstance, FactionOrder, Item } from '../../types';
import type { AssetReturnOutcome, ReturnLineInput } from '../../services/factionOrderService';
import { translate, useT } from '../../utils/naming';
import { RuntimeReturnField } from '../items/RuntimeReturnField';
import { parseHoursRun, readingAfter } from '../../utils/runtimeHours';
import { useEventReports } from '../../hooks/useEvents';
import { RestockUnusedFields } from '../orders/RestockUnused';
import { restockQuantities } from '../../utils/restock';

type Outcome = ReturnLineInput;

export function OrderReturnChecklist({ order, items, busy, canWriteOff = false, onCancel, onSubmit }: {
  order: FactionOrder;
  items: Item[];
  busy?: boolean;
  /** inventory admins may write off units that will not come back, which lets the order close. */
  canWriteOff?: boolean;
  onCancel: () => void;
  /** `restock`: unused consumables (item steps) going back to stock; empty keeps everything issued consumed. */
  onSubmit: (lines: Record<string, Outcome>, assets: Record<string, AssetReturnOutcome>, restock: Record<string, number>) => void;
}) {
  const t = useT();
  const outstanding: Record<string, number> = Object.fromEntries(items.map((item) => {
    const handedOver = order.handedOverQuantities?.[item.id] ?? 0;
    const reconciled = (order.returnedQuantities?.[item.id] ?? 0)
      // Consumables are consumed at pickup and never outstanding.
      + (order.consumedQuantities?.[item.id] ?? 0)
      + (order.damagedQuantities?.[item.id] ?? 0)
      + (order.writtenOffQuantities?.[item.id] ?? 0);
    return [item.id, Math.max(0, handedOver - reconciled)];
  }).filter(([, quantity]) => Number(quantity) > 0));
  const outstandingAssets: Record<string, AssetInstance[]> = Object.fromEntries(
    Object.entries(order.assetAssignments ?? {}).map(([itemId, assets]) => [
      itemId,
      assets.filter((asset) => ['in_field', 'in_custody', 'lost'].includes(asset.availabilityStatus)),
    ]).filter(([, assets]) => (assets as AssetInstance[]).length > 0),
  ) as Record<string, AssetInstance[]>;
  const [assetOutcomes, setAssetOutcomes] = useState<Record<string, AssetReturnOutcome>>({});
  const [restock, setRestock] = useState<Record<string, string>>({});
  // Hours run per returned unit (asset id) or per runtime-tracked bulk item (item id), booked to the order's event.
  const [hoursRun, setHoursRun] = useState<Record<string, string>>({});
  const { data: events = [] } = useEventReports();
  const eventName = events.find((event) => event.id === order.eventOccurrenceId)?.name;
  const tracksRuntime = (itemId: string) => Boolean(items.find((candidate) => candidate.id === itemId)?.tracksRuntime);
  const assetBackInStock = (assetId: string) => ['returned_good', 'returned_damaged'].includes(assetOutcomes[assetId]?.outcome ?? '');
  const [lines, setLines] = useState<Record<string, Outcome>>(() => Object.fromEntries(
    Object.entries(outstanding).map(([itemId, quantity]) => {
      const assets = outstandingAssets[itemId] ?? [];
      if (assets.length) {
        return [itemId, {
          returned: 0,
          missing: assets.filter((asset) => asset.availabilityStatus === 'lost').length,
          damaged: 0,
          writtenOff: 0,
        }];
      }
      const existingMissing = Math.min(Number(quantity), order.missingQuantities?.[itemId] ?? 0);
      return [itemId, {
        returned: 0,
        missing: existingMissing,
        damaged: 0,
        writtenOff: 0,
      }];
    }),
  ));

  function setValue(itemId: string, field: keyof Outcome, raw: string) {
    setLines((current) => ({ ...current, [itemId]: { ...current[itemId], [field]: field === 'notes' ? raw : raw === '' ? undefined : Number(raw) } }));
  }
  const summarizeAssets = (itemId: string, next: Record<string, AssetReturnOutcome>) => {
    const assets = outstandingAssets[itemId] ?? [];
    return {
      returned: assets.filter((asset) => next[asset.id]?.outcome === 'returned_good').length,
      damaged: assets.filter((asset) => next[asset.id]?.outcome === 'returned_damaged').length,
      writtenOff: assets.filter((asset) => next[asset.id]?.outcome === 'written_off').length,
      missing: assets.filter((asset) => next[asset.id]?.outcome === 'missing'
        || (asset.availabilityStatus === 'lost' && !next[asset.id])).length,
    };
  };
  const setAssetOutcome = (itemId: string, assetId: string, outcome: string) => {
    setAssetOutcomes((current) => {
      const next = { ...current };
      if (outcome === 'unchanged_missing') delete next[assetId];
      else next[assetId] = { ...next[assetId], outcome: outcome as AssetReturnOutcome['outcome'] };
      setLines((currentLines) => ({ ...currentLines, [itemId]: { ...currentLines[itemId], ...summarizeAssets(itemId, next) } }));
      return next;
    });
  };
  const exceedsOutstanding = Object.entries(lines).some(([itemId, value]) =>
    value.returned < 0 || value.missing < 0 || value.damaged < 0 || value.writtenOff < 0
    || value.returned + value.missing + value.damaged + value.writtenOff > Number(outstanding[itemId]));
  const writeOffWithoutReason = Object.values(lines).some((value) => value.writtenOff > 0 && !value.notes?.trim());
  const runtimeMissing = Object.keys(lines).some((itemId) => tracksRuntime(itemId) && ((outstandingAssets[itemId] ?? []).length
    ? outstandingAssets[itemId].some((asset) => assetBackInStock(asset.id) && parseHoursRun(hoursRun[asset.id]) == null)
    : lines[itemId].returned + lines[itemId].damaged > 0 && parseHoursRun(hoursRun[itemId]) == null));
  const invalid = exceedsOutstanding || writeOffWithoutReason || runtimeMissing;

  /** Converts the entered hours into the meter readings the return command books against the event. */
  function submit() {
    const withRuntime = Object.fromEntries(Object.entries(lines).map(([itemId, value]) => {
      const item = items.find((candidate) => candidate.id === itemId);
      return [itemId, tracksRuntime(itemId) && !(outstandingAssets[itemId] ?? []).length
        ? { ...value, operatingHours: readingAfter(item?.currentOperatingHours, parseHoursRun(hoursRun[itemId])) } : value];
    }));
    const assets = Object.fromEntries(Object.entries(assetOutcomes).map(([assetId, outcome]) => {
      const entry = Object.entries(outstandingAssets).find(([, list]) => list.some((asset) => asset.id === assetId));
      const asset = entry?.[1].find((candidate) => candidate.id === assetId);
      return [assetId, entry && tracksRuntime(entry[0]) && assetBackInStock(assetId)
        ? { ...outcome, operatingHours: readingAfter(asset?.operatingHours, parseHoursRun(hoursRun[assetId])) } : outcome];
    }));
    onSubmit(withRuntime, assets, restockQuantities(restock));
  }

  function markAllReturned() {
    setAssetOutcomes(Object.fromEntries(Object.values(outstandingAssets).flatMap((assets) =>
      assets.map((asset) => [asset.id, { outcome: 'returned_good' as const }]))));
    setLines(Object.fromEntries(
      Object.entries(outstanding).map(([itemId, quantity]) => [
        itemId,
        {
          returned: Number(quantity),
          missing: 0,
          damaged: 0,
          writtenOff: 0,
        },
      ])
    ));
  }

  function markItemComplete(itemId: string, quantity: number) {
    if ((outstandingAssets[itemId] ?? []).length) {
      setAssetOutcomes((current) => ({
        ...current,
        ...Object.fromEntries(outstandingAssets[itemId].map((asset) => [asset.id, { outcome: 'returned_good' as const }])),
      }));
    }
    setLines((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        returned: quantity,
        missing: 0,
        damaged: 0,
        writtenOff: 0,
      },
    }));
  }

  // Consumer for ash-barcode-scanned during return reconciliation.
  // Effect event: the listener is registered once and always sees the latest
  // `items`, `outstanding`, `outstandingAssets` and outcome setter.
  const onBarcodeScanned = useEffectEvent((e: Event) => {
      const detail = (e as CustomEvent<{ code: string }>).detail;
      if (!detail?.code) return;
      let code = detail.code.trim();
      const itemUrlMatch = code.match(/\/items\/([a-zA-Z0-9_-]+)/);
      if (itemUrlMatch?.[1]) {
        code = itemUrlMatch[1];
      }
      const scannedCode = code.toLowerCase();
      const matchedAssetEntry = Object.entries(outstandingAssets).flatMap(([itemId, assets]) =>
        assets.map((asset) => ({ itemId, asset }))).find(({ asset }) =>
          asset.id.toLowerCase() === scannedCode || asset.assetCode.toLowerCase() === scannedCode);
      if (matchedAssetEntry) {
        e.preventDefault();
        setAssetOutcome(matchedAssetEntry.itemId, matchedAssetEntry.asset.id, 'returned_good');
        return;
      }
      const matchedItem = items.find((i) =>
        i.id.toLowerCase() === scannedCode ||
        (i.sku && i.sku.toLowerCase() === scannedCode)
      );
      if (matchedItem && outstanding[matchedItem.id]) {
        e.preventDefault();
        const max = outstanding[matchedItem.id];
        setLines((prev) => {
          const currentLine = prev[matchedItem.id] || { returned: 0, missing: 0, damaged: 0, writtenOff: 0 };
          if (currentLine.returned < max) {
            return {
              ...prev,
              [matchedItem.id]: {
                ...currentLine,
                returned: Math.min(max, currentLine.returned + 1),
              },
            };
          }
          return prev;
        });
      }
  });

  useEffect(() => {
    window.addEventListener('ash-barcode-scanned', onBarcodeScanned);
    return () => window.removeEventListener('ash-barcode-scanned', onBarcodeScanned);
  }, []);

  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>{t('forms.orderReturnChecklist.inspectEveryComponentMissingUnitsRemainAssignedToTheFaction')}</Alert>
      <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button title={translate('forms.orderReturnChecklist.markAllOutstandingUnitsAsReturnedIntact')}
          variant="contained"
          color="success"
          size="small"
          onClick={markAllReturned}
        >
          {t('forms.orderReturnChecklist.allReturnedCompleteIntact')}
        </Button>
      </Box>
      <Stack spacing={1.5}>
        {Object.entries(outstanding).map(([itemId, quantity]) => {
          const item = items.find((candidate) => candidate.id === itemId);
          const value = lines[itemId];
          return (
            <Box key={itemId} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>{item?.name ?? itemId} · {quantity} {t('forms.orderReturnChecklist.outstanding')}</Typography>
                <Stack direction="row" spacing={0.5}>
                  <Button title={translate('forms.orderReturnChecklist.markAllOutstandingUnitsOfThisItemAsReturnedIntact')}
                    size="small"
                    variant="text"
                    color="success"
                    onClick={() => markItemComplete(itemId, Number(quantity))}
                  >
                    {t('forms.orderReturnChecklist.allReturned')}
                  </Button>
                </Stack>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                {(outstandingAssets[itemId] ?? []).length ? (
                  <Stack spacing={1} sx={{ width: '100%' }}>
                    {outstandingAssets[itemId].map((asset) => (
                      <Stack key={asset.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                        <Typography sx={{ minWidth: 180, fontWeight: 700 }}>{asset.assetCode}</Typography>
                        <TextField
                          select
                          size="small"
                          label={t('forms.orderReturnChecklist.outcome')}
                          value={assetOutcomes[asset.id]?.outcome ?? 'unchanged_missing'}
                          onChange={(event) => setAssetOutcome(itemId, asset.id, event.target.value)}
                          sx={{ minWidth: 210 }}
                        >
                          <MenuItem value="unchanged_missing">{asset.availabilityStatus === 'lost' ? t('forms.orderReturnChecklist.stillMissing') : t('forms.orderReturnChecklist.notInspectedYet')}</MenuItem>
                          <MenuItem value="returned_good">{t('forms.orderReturnChecklist.returnedGood')}</MenuItem>
                          <MenuItem value="returned_damaged">{t('forms.orderReturnChecklist.returnedDamaged')}</MenuItem>
                          {asset.availabilityStatus !== 'lost' && <MenuItem value="missing">{t('enum.transactionType.missing')}</MenuItem>}
                          {canWriteOff && <MenuItem value="written_off">{t('common.writeOff')}</MenuItem>}
                        </TextField>
                        {item?.tracksRuntime && assetBackInStock(asset.id) && <RuntimeReturnField value={hoursRun[asset.id] ?? ''}
                          onChange={(next) => setHoursRun((current) => ({ ...current, [asset.id]: next }))} current={asset.operatingHours} eventName={eventName} />}
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                  <>
                    <TextField size="small" type="number" label={t('forms.orderReturnChecklist.returned')} value={value.returned} onChange={(e) => setValue(itemId, 'returned', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />
                    <TextField size="small" type="number" label={t('forms.orderReturnChecklist.missing')} value={value.missing} onChange={(e) => setValue(itemId, 'missing', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />
                    <TextField size="small" type="number" label={t('enum.itemStatus.damaged')} value={value.damaged} onChange={(e) => setValue(itemId, 'damaged', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />
                    {canWriteOff && <TextField size="small" type="number" label={t('common.writeOff')} value={value.writtenOff} onChange={(e) => setValue(itemId, 'writtenOff', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} helperText={t('forms.orderReturnChecklist.missingUnitsFirst')} />}
                    {item?.tracksRuntime && value.returned + value.damaged > 0 && <RuntimeReturnField value={hoursRun[itemId] ?? ''}
                      onChange={(next) => setHoursRun((current) => ({ ...current, [itemId]: next }))} current={item.currentOperatingHours} eventName={eventName} />}
                  </>
                )}
              </Stack>
              {(value.damaged > 0 || value.missing > 0 || value.writtenOff > 0) && <TextField fullWidth size="small" sx={{ mt: 1 }} required={value.writtenOff > 0} error={value.writtenOff > 0 && !value.notes?.trim()} label={value.writtenOff > 0 ? t('forms.orderReturnChecklist.writeOffReason') : t('forms.orderReturnChecklist.damageMissingNote')} value={value.notes ?? ''} onChange={(e) => setValue(itemId, 'notes', e.target.value)} />}
            </Box>
          );
        })}
      </Stack>
      <Box sx={{ mt: 1.5 }}>
        <RestockUnusedFields items={items} consumed={order.consumedQuantities} value={restock} onChange={setRestock} />
      </Box>
      {exceedsOutstanding && <Alert severity="error" sx={{ mt: 2 }}>{t('forms.orderReturnChecklist.theOutcomeTotalCannotExceedTheOutstandingQuantityWrittenOff')}</Alert>}
      {writeOffWithoutReason && <Alert severity="error" sx={{ mt: 2 }}>{t('forms.orderReturnChecklist.aReasonIsRequiredForWriteOffs')}</Alert>}
      {runtimeMissing && <Alert severity="warning" sx={{ mt: 2 }}>{t('items.runtimeReturnField.enterHoursForEveryReturnedUnit')}</Alert>}
      <DialogActions sx={{ px: 0, pb: 0, pt: 2 }}>
        <Button title={translate('common.discardChangesAndClose')} onClick={onCancel}>{t('common.cancel')}</Button>
        <Button title={translate('forms.orderReturnChecklist.recordTheReviewedReturnQuantities')} variant="contained" disabled={invalid || busy || (!Object.keys(lines).length && !Object.keys(restockQuantities(restock)).length)} onClick={submit}>{t('forms.orderReturnChecklist.recordReturn')}</Button>
      </DialogActions>
    </>
  );
}
