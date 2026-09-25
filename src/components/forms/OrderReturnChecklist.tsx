import { useEffect, useEffectEvent, useState } from 'react';
import { Alert, Box, Button, DialogActions, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { AssetInstance, FactionOrder, Item } from '../../types';
import type { AssetReturnOutcome } from '../../services/factionOrderService';
import { useLocalizedText } from '../../utils/naming';

type Outcome = { returned: number; consumed: number; missing: number; damaged: number; operatingHours?: number; notes?: string };

export function OrderReturnChecklist({ order, items, busy, onCancel, onSubmit }: {
  order: FactionOrder;
  items: Item[];
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (lines: Record<string, Outcome>, assets: Record<string, AssetReturnOutcome>) => void;
}) {
  const t = useLocalizedText();
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
  const [assetOutcomes, setAssetOutcomes] = useState<Record<string, AssetReturnOutcome>>(() => Object.fromEntries(
    Object.values(outstandingAssets).flatMap((assets) => assets
      .filter((asset) => asset.availabilityStatus !== 'lost')
      .map((asset) => [asset.id, { outcome: 'returned_good' as const }])),
  ));
  const [lines, setLines] = useState<Record<string, Outcome>>(() => Object.fromEntries(
    Object.entries(outstanding).map(([itemId, quantity]) => {
      const assets = outstandingAssets[itemId] ?? [];
      if (assets.length) {
        return [itemId, {
          returned: assets.filter((asset) => asset.availabilityStatus !== 'lost').length,
          consumed: 0,
          missing: assets.filter((asset) => asset.availabilityStatus === 'lost').length,
          damaged: 0,
        }];
      }
      const existingMissing = Math.min(Number(quantity), order.missingQuantities?.[itemId] ?? 0);
      return [itemId, {
        returned: Number(quantity) - existingMissing,
        consumed: 0,
        missing: existingMissing,
        damaged: 0,
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
  const invalid = Object.entries(lines).some(([itemId, value]) =>
    value.returned < 0 || value.consumed < 0 || value.missing < 0 || value.damaged < 0
    || value.returned + value.consumed + value.missing + value.damaged > Number(outstanding[itemId]));

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
        (i.sku && i.sku.toLowerCase() === scannedCode) ||
        (i.barcode && i.barcode.toLowerCase() === scannedCode)
      );
      if (matchedItem && outstanding[matchedItem.id]) {
        e.preventDefault();
        const max = outstanding[matchedItem.id];
        setLines((prev) => {
          const currentLine = prev[matchedItem.id] || { returned: 0, consumed: 0, missing: 0, damaged: 0 };
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
      <Alert severity="info" sx={{ mb: 2 }}>{t('Jede Komponente einzeln prüfen. Fehlende Teile bleiben der Fraktion zugeordnet.', 'Inspect every component. Missing units remain assigned to the faction.')}</Alert>
      <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          color="success"
          size="small"
          onClick={markAllReturned}
        >
          {t('Alles vollständig & intakt zurücknehmen', 'All returned complete & intact')}
        </Button>
        {items.some((i) => i.isConsumable && (outstanding[i.id] ?? 0) > 0) && (
          <Button
            variant="outlined"
            color="warning"
            size="small"
            onClick={markAllConsumablesConsumed}
          >
            {t('Verbrauchsmaterial als verbraucht buchen', 'Record consumables as consumed')}
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
                <Typography sx={{ fontWeight: 800 }}>{item?.name ?? itemId} · {quantity} {t('offen', 'outstanding')}</Typography>
                <Stack direction="row" spacing={0.5}>
                  {item?.isConsumable ? (
                    <>
                      <Button
                        size="small"
                        variant="text"
                        color="success"
                        onClick={() => markItemComplete(itemId, Number(quantity), false)}
                      >
                        {t('Vollständig zurück', 'All returned')}
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        color="warning"
                        onClick={() => markItemComplete(itemId, Number(quantity), true)}
                      >
                        {t('Alles verbraucht', 'All consumed')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="small"
                      variant="text"
                      color="success"
                      onClick={() => markItemComplete(itemId, Number(quantity), false)}
                    >
                      {t('Vollständig zurück', 'All returned')}
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
                          label={t('Ergebnis', 'Outcome')}
                          value={assetOutcomes[asset.id]?.outcome ?? 'unchanged_missing'}
                          onChange={(event) => setAssetOutcome(itemId, asset.id, event.target.value)}
                          sx={{ minWidth: 210 }}
                        >
                          {asset.availabilityStatus === 'lost' && <MenuItem value="unchanged_missing">{t('Weiterhin fehlend', 'Still missing')}</MenuItem>}
                          <MenuItem value="returned_good">{t('Intakt zurück', 'Returned good')}</MenuItem>
                          <MenuItem value="returned_damaged">{t('Beschädigt zurück', 'Returned damaged')}</MenuItem>
                          {asset.availabilityStatus !== 'lost' && <MenuItem value="missing">{t('Fehlend', 'Missing')}</MenuItem>}
                        </TextField>
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                  <>
                    <TextField size="small" type="number" label={item?.isConsumable ? t('Ungeöffnet zurück', 'Returned unopened') : t('Zurück', 'Returned')} value={value.returned} onChange={(e) => setValue(itemId, 'returned', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />
                    {item?.isConsumable && <TextField size="small" type="number" label={t('Verbraucht', 'Consumed')} value={value.consumed} onChange={(e) => setValue(itemId, 'consumed', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />}
                    <TextField size="small" type="number" label={t('Fehlt', 'Missing')} value={value.missing} onChange={(e) => setValue(itemId, 'missing', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />
                    <TextField size="small" type="number" label={t('Beschädigt', 'Damaged')} value={value.damaged} onChange={(e) => setValue(itemId, 'damaged', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />
                    {(item?.maintenanceIntervalDays || Number(item?.currentOperatingHours) > 0) && <TextField size="small" type="number" label={t('Betriebsstunden', 'Operating hours')} value={value.operatingHours ?? ''} onChange={(e) => setValue(itemId, 'operatingHours', e.target.value)} />}
                  </>
                )}
              </Stack>
              {(value.damaged > 0 || value.missing > 0) && <TextField fullWidth size="small" sx={{ mt: 1 }} label={t('Notiz zu Schaden/Fehlteil', 'Damage/missing note')} value={value.notes ?? ''} onChange={(e) => setValue(itemId, 'notes', e.target.value)} />}
            </Box>
          );
        })}
      </Stack>
      {invalid && <Alert severity="error" sx={{ mt: 2 }}>{t('Die Summe darf die offene Menge nicht überschreiten.', 'The outcome total cannot exceed the outstanding quantity.')}</Alert>}
      <DialogActions sx={{ px: 0, pb: 0, pt: 2 }}>
        <Button onClick={onCancel}>{t('Abbrechen', 'Cancel')}</Button>
        <Button variant="contained" disabled={invalid || busy || !Object.keys(lines).length} onClick={() => onSubmit(lines, assetOutcomes)}>{t('Rückgabe buchen', 'Record return')}</Button>
      </DialogActions>
    </>
  );
}
