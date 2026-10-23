import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, MenuItem, Stack, TextField } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { getRestockableCheckouts } from '../../services/transactionService';
import { formatDateTime } from '../../utils/dateFormat';
import { formatQuantity, fromSteps, toSteps, usesPercentage } from '../../utils/stock';
import { useT } from '../../utils/naming';
import type { Item } from '../../types';

export interface RestockCheckoutData { checkoutId: string; quantity: number; notes?: string }

/**
 * Unused consumables of one earlier direct checkout go back to stock. The checkout keeps who took them; the amount is
 * capped at what that checkout issued minus what was already restocked.
 */
export function RestockCheckoutForm({ item, onSubmit, isLoading }: { item: Item; onSubmit: (data: RestockCheckoutData) => void; isLoading?: boolean }) {
  const t = useT();
  const checkouts = useQuery({ queryKey: ['transactions', 'restockable', item.id], queryFn: () => getRestockableCheckouts(item.id) });
  const [checkoutId, setCheckoutId] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [notes, setNotes] = useState('');
  const rows = checkouts.data ?? [];
  const selected = rows.find((row) => row.checkoutId === checkoutId) ?? rows[0];
  const limit = selected ? selected.issued - selected.restocked : 0;
  const percentage = usesPercentage(item);
  const quantity = toSteps(item, quantityInput, percentage);
  const invalid = !selected || quantityInput === '' || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > limit;

  function submit() {
    if (!invalid && selected) onSubmit({ checkoutId: selected.checkoutId, quantity, notes: notes.trim() || undefined });
  }

  // Rendered inside the transaction form: a plain section with its own button, never a nested form.
  return <Box>
    <Stack spacing={2}>
      {checkouts.error && <Alert severity="error">{checkouts.error.message}</Alert>}
      {!checkouts.isLoading && !checkouts.error && rows.length === 0
        ? <Alert severity="info">{t('forms.transactionForm.noCheckoutToRestock')}</Alert>
        : <TextField select required fullWidth label={t('forms.transactionForm.fromCheckout')} value={selected?.checkoutId ?? ''}
          disabled={checkouts.isLoading} onChange={(event) => setCheckoutId(event.target.value)}
          helperText={checkouts.isLoading ? t('forms.transactionForm.loadingCheckouts') : selected
            ? t('forms.transactionForm.restockableOfIssued', { restockable: formatQuantity(item, limit), issued: formatQuantity(item, selected.issued) }) : undefined}>
          {rows.map((row) => <MenuItem key={row.checkoutId} value={row.checkoutId}>
            {[formatDateTime(row.occurredAt), row.person, row.event, row.faction, formatQuantity(item, row.issued)].filter(Boolean).join(' · ')}
          </MenuItem>)}
        </TextField>}
      <TextField required fullWidth type="number" label={percentage ? `${t('orders.restockUnused.unusedAmount')} (%)` : item.unit ? `${t('orders.restockUnused.unusedAmount')} (${item.unit})` : t('orders.restockUnused.unusedAmount')}
        value={quantityInput} onChange={(event) => setQuantityInput(event.target.value)} error={quantityInput !== '' && invalid}
        helperText={[percentage && t('forms.itemForm.percentageCapacity', { quantity: formatQuantity(item, 100) }), percentage && !invalid && formatQuantity(item, quantity), selected && t('forms.transactionForm.maximumQuantityLimit', { quantityLimit: formatQuantity(item, limit) })].filter(Boolean).join(' ')}
        slotProps={{ htmlInput: { min: 1, step: 1, max: percentage ? limit : fromSteps(item, limit), inputMode: 'numeric' } }} />
      <TextField label={t('common.notes')} value={notes} onChange={(event) => setNotes(event.target.value)} multiline rows={2} fullWidth />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button title={t('forms.transactionForm.recordUnusedConsumablesBackToStock')} type="button" onClick={submit} variant="contained" disabled={isLoading || invalid}
          sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}>
          {t('orders.restockUnused.restock')}
        </Button>
      </Box>
    </Stack>
  </Box>;
}
