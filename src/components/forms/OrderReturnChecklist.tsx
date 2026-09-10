import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, DialogActions, Stack, TextField, Typography } from '@mui/material';
import type { FactionOrder, Item } from '../../types';
import { useLocalizedText } from '../../utils/naming';

type Outcome = { returned: number; consumed: number; missing: number; damaged: number; operatingHours?: number; notes?: string };

export function OrderReturnChecklist({ order, items, busy, onCancel, onSubmit }: {
  order: FactionOrder;
  items: Item[];
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (lines: Record<string, Outcome>) => void;
}) {
  const t = useLocalizedText();
  const outstanding = useMemo<Record<string, number>>(() => Object.fromEntries(items.map((item) => {
    const handedOver = order.handedOverQuantities?.[item.id] ?? 0;
    const reconciled = (order.returnedQuantities?.[item.id] ?? 0)
      + (order.consumedQuantities?.[item.id] ?? 0)
      + (order.damagedQuantities?.[item.id] ?? 0)
      + (order.writtenOffQuantities?.[item.id] ?? 0);
    return [item.id, Math.max(0, handedOver - reconciled)];
  }).filter(([, quantity]) => Number(quantity) > 0)), [items, order]);
  const [lines, setLines] = useState<Record<string, Outcome>>(() => Object.fromEntries(
    Object.entries(outstanding).map(([itemId, quantity]) => {
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
  const invalid = Object.entries(lines).some(([itemId, value]) =>
    value.returned < 0 || value.consumed < 0 || value.missing < 0 || value.damaged < 0
    || value.returned + value.consumed + value.missing + value.damaged > Number(outstanding[itemId]));

  function markAllReturned() {
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

  // Consumer for ash-barcode-scanned during return reconciliation
  useEffect(() => {
    function onBarcodeScanned(e: Event) {
      const detail = (e as CustomEvent<{ code: string }>).detail;
      if (!detail?.code) return;
      let code = detail.code.trim();
      const itemUrlMatch = code.match(/\/items\/([a-zA-Z0-9_-]+)/);
      if (itemUrlMatch?.[1]) {
        code = itemUrlMatch[1];
      }
      const scannedCode = code.toLowerCase();
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
    }
    window.addEventListener('ash-barcode-scanned', onBarcodeScanned);
    return () => window.removeEventListener('ash-barcode-scanned', onBarcodeScanned);
  }, [items, outstanding]);

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
                <TextField size="small" type="number" label={item?.isConsumable ? t('Ungeöffnet zurück', 'Returned unopened') : t('Zurück', 'Returned')} value={value.returned} onChange={(e) => setValue(itemId, 'returned', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />
                {item?.isConsumable && <TextField size="small" type="number" label={t('Verbraucht', 'Consumed')} value={value.consumed} onChange={(e) => setValue(itemId, 'consumed', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />}
                <TextField size="small" type="number" label={t('Fehlt', 'Missing')} value={value.missing} onChange={(e) => setValue(itemId, 'missing', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />
                <TextField size="small" type="number" label={t('Beschädigt', 'Damaged')} value={value.damaged} onChange={(e) => setValue(itemId, 'damaged', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />
                {(item?.maintenanceIntervalDays || Number(item?.currentOperatingHours) > 0) && <TextField size="small" type="number" label={t('Betriebsstunden', 'Operating hours')} value={value.operatingHours ?? ''} onChange={(e) => setValue(itemId, 'operatingHours', e.target.value)} />}
              </Stack>
              {(value.damaged > 0 || value.missing > 0) && <TextField fullWidth size="small" sx={{ mt: 1 }} label={t('Notiz zu Schaden/Fehlteil', 'Damage/missing note')} value={value.notes ?? ''} onChange={(e) => setValue(itemId, 'notes', e.target.value)} />}
            </Box>
          );
        })}
      </Stack>
      {invalid && <Alert severity="error" sx={{ mt: 2 }}>{t('Die Summe darf die offene Menge nicht überschreiten.', 'The outcome total cannot exceed the outstanding quantity.')}</Alert>}
      <DialogActions sx={{ px: 0, pb: 0, pt: 2 }}>
        <Button onClick={onCancel}>{t('Abbrechen', 'Cancel')}</Button>
        <Button variant="contained" disabled={invalid || busy || !Object.keys(lines).length} onClick={() => onSubmit(lines)}>{t('Rückgabe buchen', 'Record return')}</Button>
      </DialogActions>
    </>
  );
}
