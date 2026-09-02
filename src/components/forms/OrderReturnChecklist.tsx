import { useMemo, useState } from 'react';
import { Alert, Box, Button, DialogActions, Stack, TextField, Typography } from '@mui/material';
import type { FactionOrder, Item } from '../../types';
import { useTranslate } from '../../utils/naming';

type Outcome = { returned: number; missing: number; damaged: number; operatingHours?: number; notes?: string };

export function OrderReturnChecklist({ order, items, busy, onCancel, onSubmit }: {
  order: FactionOrder;
  items: Item[];
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (lines: Record<string, Outcome>) => void;
}) {
  const t = useTranslate();
  const outstanding = useMemo<Record<string, number>>(() => Object.fromEntries(items.map((item) => {
    const picked = order.pickedUpQuantities?.[item.id] ?? 0;
    const reconciled = (order.returnedQuantities?.[item.id] ?? 0) + (order.damagedQuantities?.[item.id] ?? 0);
    return [item.id, Math.max(0, picked - reconciled)];
  }).filter(([, quantity]) => Number(quantity) > 0)), [items, order]);
  const [lines, setLines] = useState<Record<string, Outcome>>(() => Object.fromEntries(
    Object.entries(outstanding).map(([itemId, quantity]) => [itemId, { returned: Number(quantity), missing: 0, damaged: 0 }]),
  ));

  function setValue(itemId: string, field: keyof Outcome, raw: string) {
    setLines((current) => ({ ...current, [itemId]: { ...current[itemId], [field]: field === 'notes' ? raw : raw === '' ? undefined : Number(raw) } }));
  }
  const invalid = Object.entries(lines).some(([itemId, value]) =>
    value.returned < 0 || value.missing < 0 || value.damaged < 0 || value.returned + value.missing + value.damaged > Number(outstanding[itemId]));

  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>{t('Jede Komponente einzeln prüfen. Fehlende Teile bleiben der Fraktion zugeordnet.', 'Inspect every component. Missing units remain assigned to the faction.')}</Alert>
      <Stack spacing={1.5}>
        {Object.entries(outstanding).map(([itemId, quantity]) => {
          const item = items.find((candidate) => candidate.id === itemId);
          const value = lines[itemId];
          return (
            <Box key={itemId} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontWeight: 800 }}>{item?.name ?? itemId} · {quantity} {t('offen', 'outstanding')}</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                <TextField size="small" type="number" label={t('Zurück', 'Returned')} value={value.returned} onChange={(e) => setValue(itemId, 'returned', e.target.value)} slotProps={{ htmlInput: { min: 0, max: quantity } }} />
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
