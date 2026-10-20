import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Box, Stack, TextField, Typography } from '@mui/material';
import { DialogForm, FormDialog } from '../shared/FormDialog';
import { QuantityControl } from './QuantityControl';
import { restockOrder } from '../../services/orderCommands';
import { useUIStore } from '../../store/uiStore';
import { formatQuantity } from '../../utils/stock';
import { restockQuantities, restockableItems } from '../../utils/restock';
import { useT } from '../../utils/naming';
import type { Item } from '../../types';
import type { OrderKind } from '../../types/orderCommands';

/**
 * Optional "restock unused consumables": leaving it empty keeps everything issued consumed. Each amount is capped at
 * what the order still books as consumed for that item.
 */
export function RestockUnusedFields({ items, consumed, value, onChange, heading = true }: {
  items: Item[];
  /** Off inside the restock dialog, whose title already says it. */
  heading?: boolean;
  consumed: Record<string, number> | undefined;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}) {
  const t = useT();
  const rows = restockableItems(items, consumed);
  if (!rows.length) return null;
  return <Box sx={heading ? { p: 1.5, border: '1px dashed', borderColor: 'divider' } : undefined}>
    {heading && <Typography sx={{ fontWeight: 800 }}>{t('orders.restockUnused.title')}</Typography>}
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('orders.restockUnused.help')}</Typography>
    <Stack spacing={1}>
      {rows.map((item) => <Stack key={item.id} direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('orders.restockUnused.consumed', { quantity: formatQuantity(item, consumed?.[item.id] ?? 0) })}
          </Typography>
        </Box>
        <QuantityControl label={`${item.name} ${t('orders.restockUnused.unused')}`} item={item} max={consumed?.[item.id] ?? 0}
          value={value[item.id] ?? ''} onChange={(next) => onChange({ ...value, [item.id]: next })} />
      </Stack>)}
    </Stack>
  </Box>;
}

/** Restocking on its own, also once the order is returned or closed. Mount it only while open: each opening is one command. */
export function RestockUnusedDialog({ kind, orderId, items, consumed, onClose }: {
  kind: OrderKind;
  orderId: string;
  items: Item[];
  consumed: Record<string, number> | undefined;
  onClose: () => void;
}) {
  const t = useT();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const [value, setValue] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  // One key per opening: resending after a lost response cannot restock twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const restock = useMutation({ mutationFn: () => restockOrder(kind, orderId, { quantities: restockQuantities(value), idempotencyKey, notes: notes.trim() || undefined }) });
  const quantities = restockQuantities(value);
  const rows = restockableItems(items, consumed);
  return <FormDialog open onClose={onClose} maxWidth="sm">
    <DialogForm title={t('orders.restockUnused.title')} onCancel={onClose} pending={restock.isPending} noValidate
      submitLabel={t('orders.restockUnused.restock')} submitDisabled={!Object.keys(quantities).length}
      onSubmit={() => restock.mutate(undefined, {
        onSuccess: () => { showSnackbar(t('orders.restockUnused.restocked'), 'success'); onClose(); },
        onError: (error) => showSnackbar(error.message, 'error'),
      })}>
      {rows.length ? <Stack spacing={2}>
        <RestockUnusedFields items={items} consumed={consumed} value={value} onChange={setValue} heading={false} />
        <TextField label={t('common.notes')} value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={1} fullWidth />
      </Stack> : <Alert severity="info">{t('orders.restockUnused.nothingConsumed')}</Alert>}
    </DialogForm>
  </FormDialog>;
}
