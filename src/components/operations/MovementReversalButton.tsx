import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { Dialog } from '../shared/ClosableDialog';
import { Button } from '../shared/ActionButtons';
import { apiRequest } from '../../services/apiClient';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../utils/naming';
import type { StockTransaction } from '../../types';
export function MovementReversalButton({ movement }: { movement: StockTransaction }) {
  const t = useT(); const { user } = useAuth(); const client = useQueryClient();
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(''); const [commandId] = useState(() => crypto.randomUUID());
  const reverse = useMutation({ mutationFn: () => apiRequest(`/api/transactions/${movement.id}/reversal`, { method: 'POST', body: { commandId, reason } }), onSuccess: async () => { setOpen(false); await client.invalidateQueries({ queryKey: ['transactions'] }); } });
  if (movement.reversesId) return <Typography variant="caption">{t('review.reverse')}: {movement.reversesId}</Typography>;
  if (user?.role !== 'admin' || movement.orderId || movement.damageReportId || movement.quantityChanged <= 0 || !['added', 'adjusted', 'checkout', 'checkin'].includes(movement.transactionType)) return null;
  return <><Button size="small" onClick={() => setOpen(true)}>{t('review.reverse')}</Button><Dialog open={open} onClose={reverse.isPending ? undefined : () => setOpen(false)} fullWidth maxWidth="sm">
    <DialogTitle>{t('review.reverse')}</DialogTitle><DialogContent>
      <Typography sx={{ mb: 2 }}>{movement.itemName} · {movement.transactionType} · {movement.quantityChanged}</Typography>
      <TextField fullWidth required label={t('review.reversalReason')} value={reason} onChange={e => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 255 } }} />
      {reverse.error && <Alert severity="error">{reverse.error.message}</Alert>}
    </DialogContent><DialogActions><Button onClick={() => setOpen(false)} disabled={reverse.isPending}>{t('common.cancel')}</Button><Button color="error" disabled={!reason.trim() || reverse.isPending} onClick={() => reverse.mutate()}>{t('review.reverse')}</Button></DialogActions>
  </Dialog></>;
}
