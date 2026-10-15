import { Button } from '../shared/ActionButtons';
import { useEffect, useEffectEvent, useState } from 'react';
import { Alert, Box, DialogActions, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { AssetInstance, FactionOrder, Item } from '../../types';
import type { AssetReturnOutcome, ReturnLineInput } from '../../services/factionOrderService';
import { translate, useT } from '../../utils/naming';

type Outcome = ReturnLineInput;

export function OrderReturnChecklist({ order, items, busy, canWriteOff = false, onCancel, onSubmit }: {
  order: FactionOrder;
  items: Item[];
  busy?: boolean;
  /** inventory admins may write off units that will not come back, which lets the order close. */
  canWriteOff?: boolean;
  onCancel: () => void;
  onSubmit: (lines: Record<string, Outcome>, assets: Record<string, AssetReturnOutcome>) => void;
}) {
  const t = useT();
  const outstanding: Record<string, number> = Object.fromEntries(items.map((item) => {
    const handedOver = order.handedOverQuantities?.[item.id] ?? 0;
    const reconciled = (order.returnedQuantities?.[item.id] ?? 0)
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
  const [lines, setLines] = useState<Record<string, Outcome>>(() => Object.fromEntries(
    Object.entries(outstanding).map(([itemId, quantity]) => {
      const assets = outstandingAssets[itemId] ?? [];
      if (assets.length) {
        return [itemId, {
          returned: 0,
          consumed: 0,
          missing: assets.filter((asset) => asset.availabilityStatus === 'lost').length,
          damaged: 0,
          writtenOff: 0,
        }];
      }
      const existingMissing = Math.min(Number(quantity), order.missingQuantities?.[itemId] ?? 0);
      return [itemId, {
        returned: 0,
        consumed: 0,
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
      consumed: 0,
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
    value.returned < 0 || value.consumed < 0 || value.missing < 0 || value.damaged < 0 || value.writtenOff < 0
    || value.returned + value.consumed + value.missing + value.damaged + value.writtenOff > Number(outstanding[itemId]));
  const writeOffWithoutReason = Object.values(lines).some((value) => value.writtenOff > 0 && !value.notes?.trim());
  const invalid = exceedsOutstanding || writeOffWithoutReason;

  function markAllReturned() {
    setAssetOutcomes(Object.fromEntries(Object.values(outstandingAssets).flatMap((assets) =>
      assets.map((asset) => [asset.id, { outcome: 'returned_good' as const }]))));
    setLines(Object.fromEntries(
      Object.entries(outstanding).map(([itemId, quantity]) => [
        itemId,
        {
          returned: Number(quantity),
          consumed: 0,
          missing: 0,
          damaged: 0,
          writtenOff: 0,
        },
      ])
    ));
  }

  function markAllConsumablesConsumed() {
    setLines((current) => {
      const next = { ...current };
      for (const [itemId, quantity] of Object.entries(outstanding)) {
        const item = items.find((candidate) => candidate.id === itemId);
        if (item?.isConsumable) {
          next[itemId] = {
            returned: 0,
            consumed: Number(quantity),
            missing: 0,
            damaged: 0,
            writtenOff: 0,
            notes: current[itemId]?.notes,
          };
        }
      }
      return next;
    });
  }

  function markItemComplete(itemId: string, quantity: number, isConsumable?: boolean) {
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
        returned: isConsumable ? 0 : quantity,
        consumed: isConsumable ? quantity : 0,
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
          const currentLine = prev[matchedItem.id] || { returned: 0, consumed: 0, missing: 0, damaged: 0, writtenOff: 0 };
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
        {items.some((i) => i.isConsumable && (outstanding[i.id] ?? 0) > 0) && (
          <Button title={translate('forms.orderReturnChecklist.markAllConsumableQuantitiesAsConsumed')}
            variant="outlined"
            color="warning"
            size="small"
            onClick={markAllConsumablesConsumed}
          >
            {t('forms.orderReturnChecklist.recordConsumablesAsConsumed')}
          </Button>
        )}
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
                  {item?.isConsumable ? (
                    <>
                      <Button title={translate('forms.orderReturnChecklist.markAllOutstandingUnitsOfThisItemAsReturnedIntact')}
                        size="small"
                        variant="text"
                        color="success"
                        onClick={() => markItemComplete(itemId, Number(quantity), false)}
                      >
                        {t('forms.orderReturnChecklist.allReturned')}
                      </Button>
                      <Button title={translate('forms.orderReturnChecklist.markAllOutstandingUnitsOfThisItemAsConsumed')}
                        size="small"
                        variant="text"
                        color="warning"
                        onClick={() => markItemComplete(itemId, Number(quantity), true)}
                      >
                        {t('forms.orderReturnChecklist.allConsumed')}
                      </Button>
                    </>
                  ) : (
                    <Button title={translate('forms.orderReturnChecklist.markAllOutstandingUnitsOfThisItemAsReturnedIntact')}
                      size="small"
                      variant="text"
                      color="success"
                      onClick={() => markItemComplete(itemId, Number(quantity), false)}
                    >
                      {t('forms.orderReturnChecklist.allReturned')}
                    </Button>
                  )}
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
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                  <>
                    <TextField size="small" type="number" label={item?.isConsumable ? t('forms.orderReturnChecklist.returnedUnopened') : t('forms.orderReturnChecklist.returned')} value={value.returned} onChange={(e) => setValue(itemId, 'returned', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />
                    {item?.isConsumable && <TextField size="small" type="number" label={t('enum.transactionType.consumed')} value={value.consumed} onChange={(e) => setValue(itemId, 'consumed', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />}
                    <TextField size="small" type="number" label={t('forms.orderReturnChecklist.missing')} value={value.missing} onChange={(e) => setValue(itemId, 'missing', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />
                    <TextField size="small" type="number" label={t('enum.itemStatus.damaged')} value={value.damaged} onChange={(e) => setValue(itemId, 'damaged', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />
                    {canWriteOff && <TextField size="small" type="number" label={t('common.writeOff')} value={value.writtenOff} onChange={(e) => setValue(itemId, 'writtenOff', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} helperText={t('forms.orderReturnChecklist.missingUnitsFirst')} />}
                    {(item?.maintenanceIntervalDays || Number(item?.currentOperatingHours) > 0) && <TextField size="small" type="number" label={t('enum.value.operating_hours')} value={value.operatingHours ?? ''} onChange={(e) => setValue(itemId, 'operatingHours', e.target.value)} />}
                  </>
                )}
              </Stack>
              {(value.damaged > 0 || value.missing > 0 || value.writtenOff > 0) && <TextField fullWidth size="small" sx={{ mt: 1 }} required={value.writtenOff > 0} error={value.writtenOff > 0 && !value.notes?.trim()} label={value.writtenOff > 0 ? t('forms.orderReturnChecklist.writeOffReason') : t('forms.orderReturnChecklist.damageMissingNote')} value={value.notes ?? ''} onChange={(e) => setValue(itemId, 'notes', e.target.value)} />}
            </Box>
          );
        })}
      </Stack>
      {exceedsOutstanding && <Alert severity="error" sx={{ mt: 2 }}>{t('forms.orderReturnChecklist.theOutcomeTotalCannotExceedTheOutstandingQuantityWrittenOff')}</Alert>}
      {writeOffWithoutReason && <Alert severity="error" sx={{ mt: 2 }}>{t('forms.orderReturnChecklist.aReasonIsRequiredForWriteOffs')}</Alert>}
      <DialogActions sx={{ px: 0, pb: 0, pt: 2 }}>
        <Button title={translate('common.discardChangesAndClose')} onClick={onCancel}>{t('common.cancel')}</Button>
        <Button title={translate('forms.orderReturnChecklist.recordTheReviewedReturnQuantities')} variant="contained" disabled={invalid || busy || !Object.keys(lines).length} onClick={() => onSubmit(lines, assetOutcomes)}>{t('forms.orderReturnChecklist.recordReturn')}</Button>
      </DialogActions>
    </>
  );
}
