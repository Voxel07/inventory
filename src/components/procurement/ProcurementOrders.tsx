import { Dialog } from '../shared/ClosableDialog';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, DialogActions, DialogContent, DialogTitle,
  Link, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import {
  createPurchaseOrder, createVendor, getPurchaseOrders, getVendors, transitionPurchaseOrder,
  type ProcurementDeficit,
} from '../../services/procurementService';
import { useLocalizedText } from '../../utils/naming';
import { useProgressiveList } from '../../hooks/useProgressiveList';
import type { PurchaseOrder, Vendor } from '../../services/procurementService';

type Props = { selected: ProcurementDeficit | null; eventId: string; onClose: () => void };

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function ProcurementOrders({ selected, eventId, onClose }: Props) {
  const t = useLocalizedText();
  const queryClient = useQueryClient();
  const { data: vendors = [], isLoading: vendorsLoading } = useProgressiveList<Vendor>(['vendors'], getVendors);
  const { data: orders = [], error } = useProgressiveList<PurchaseOrder>(['purchase-orders'], getPurchaseOrders);
  const [supplier, setSupplier] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('0');
  const [orderDate, setOrderDate] = useState(localDate);
  const [expectedDate, setExpectedDate] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const effectivePageSize = pageSize === -1 ? orders.length || 1 : pageSize;
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!selected) return;
    setSupplier(selected.supplier === 'Unassigned' ? '' : selected.supplier);
    setQuantity(String(Math.max(1, selected.netDeficit - (selected.orderedStock ?? 0))));
    setPrice('0');
    setReference('');
    setNotes('');
    setExpectedDate('');
    setSaveError('');
  }, [selected]);

  const record = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const existing = vendors.find((vendor) => vendor.active && vendor.name.toLocaleLowerCase() === supplier.trim().toLocaleLowerCase());
      const vendor = existing ?? await createVendor(supplier.trim());
      const draft = await createPurchaseOrder({
        vendorId: vendor.id,
        orderDate,
        expectedDeliveryDate: expectedDate || undefined,
        orderNumber: reference.trim() || undefined,
        eventOccurrenceId: eventId || undefined,
        notes: notes.trim() || undefined,
        lines: [{ itemId: selected.itemId, orderedQuantity: Number(quantity), unitPriceCents: Math.round(Number(price) * 100) }],
      });
      try {
        await transitionPurchaseOrder(draft.id, 'ordered');
      } catch (cause) {
        throw new Error(`${t('Entwurf', 'Draft')} ${draft.orderNumber} ${t('wurde gespeichert, aber nicht als bestellt markiert. Aktivieren Sie ihn in der Liste.', 'was saved but was not marked ordered. Activate it in the list.')}`, { cause });
      }
    },
    onSuccess: () => {
      setSaveError('');
      onClose();
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['vendors'] });
      void queryClient.invalidateQueries({ queryKey: ['procurement-deficits'] });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
    },
    onError: (cause) => {
      setSaveError(cause instanceof Error ? cause.message : t('Bestellung konnte nicht gespeichert werden.', 'Could not save order.'));
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
  });
  const activate = useMutation({
    mutationFn: (id: string) => transitionPurchaseOrder(id, 'ordered'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['procurement-deficits'] });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
  const valid = supplier.trim().length > 0 && Number.isInteger(Number(quantity)) && Number(quantity) > 0
    && Number.isFinite(Number(price)) && Number(price) >= 0 && Boolean(orderDate)
    && (!expectedDate || expectedDate >= orderDate);

  return <>
    <Paper sx={{ mt: 3, p: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>{t('Externe Bestellungen', 'External orders')}</Typography>
      {error && <Alert severity="error">{t('Bestellungen konnten nicht geladen werden.', 'Could not load orders.')}</Alert>}
      {activate.error && <Alert severity="error">{activate.error instanceof Error ? activate.error.message : t('Bestellung konnte nicht aktiviert werden.', 'Could not activate order.')}</Alert>}
      <TableContainer>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>{t('Bestellung / Artikel', 'Order / item')}</TableCell>
            <TableCell>{t('Lieferant', 'Supplier')}</TableCell>
            <TableCell>{t('Bestellt am / von', 'Ordered on / by')}</TableCell>
            <TableCell align="right">{t('Menge unterwegs', 'In transit')}</TableCell>
            <TableCell align="right">{t('Preis', 'Price')}</TableCell>
            <TableCell>{t('Status', 'Status')}</TableCell>
          </TableRow></TableHead>
          <TableBody>{orders.slice(page * effectivePageSize, page * effectivePageSize + effectivePageSize).flatMap((order) => order.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell><Typography variant="caption" color="text.secondary">{order.orderNumber}</Typography><br />
                <Link component={RouterLink} to={`/items/${line.itemId}`}>{line.itemName}</Link></TableCell>
              <TableCell>{order.vendorName}</TableCell>
              <TableCell>{new Date(`${order.orderDate}T12:00:00`).toLocaleDateString()}<br />{order.createdByName || order.createdById}
                {order.expectedDeliveryDate && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{t('Erwartet', 'Expected')}: {new Date(`${order.expectedDeliveryDate}T12:00:00`).toLocaleDateString()}</Typography>}</TableCell>
              <TableCell align="right">{line.remainingQuantity}</TableCell>
              <TableCell align="right">{(line.unitPriceCents / 100).toFixed(2)} € / {((line.unitPriceCents * line.orderedQuantity) / 100).toFixed(2)} €</TableCell>
              <TableCell>{order.status === 'draft'
                ? <Button size="small" disabled={activate.isPending} onClick={() => activate.mutate(order.id)}>{t('Als bestellt markieren', 'Mark ordered')}</Button>
                : <Chip size="small" label={order.status.replaceAll('_', ' ')} color={order.status === 'ordered' || order.status === 'partially_received' ? 'info' : 'default'} />}</TableCell>
            </TableRow>
          )))}</TableBody>
        </Table>
      </TableContainer>
      <TablePagination component="div" count={orders.length} rowsPerPage={pageSize} rowsPerPageOptions={[20, 100, { label: t('Alle', 'All'), value: -1 }]}
        page={Math.min(page, Math.max(0, Math.ceil(orders.length / effectivePageSize) - 1))} onPageChange={(_, next) => setPage(next)}
        onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} />
    </Paper>
    <Dialog open={Boolean(selected)} onClose={record.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('Externe Bestellung erfassen', 'Record external order')}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>{selected?.name}</Typography>
        {saveError && <Alert severity="error">{saveError}</Alert>}
        <TextField label={t('Lieferant / Bestellort', 'Supplier / place ordered')} value={supplier}
          onChange={(event) => setSupplier(event.target.value)} required helperText={vendors.length ? `${t('Bekannte Lieferanten', 'Known suppliers')}: ${vendors.filter((vendor) => vendor.active).map((vendor) => vendor.name).join(', ')}` : undefined} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label={t('Menge', 'Quantity')} type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)}
            slotProps={{ htmlInput: { min: 1, step: 1 } }} required fullWidth />
          <TextField label={t('Stückpreis (€)', 'Unit price (€)')} type="number" value={price} onChange={(event) => setPrice(event.target.value)}
            slotProps={{ htmlInput: { min: 0, step: 0.01 } }} required fullWidth />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label={t('Bestelldatum', 'Order date')} type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} required fullWidth />
          <TextField label={t('Erwartete Lieferung', 'Expected delivery')} type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} fullWidth />
        </Stack>
        <TextField label={t('Bestellnummer (optional)', 'Order reference (optional)')} value={reference} onChange={(event) => setReference(event.target.value)} />
        <TextField label={t('Notizen', 'Notes')} value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={2} />
        <Box><Typography variant="body2" color="text.secondary">{t('Besteller wird aus Ihrem Benutzerkonto gespeichert. Bestellte Ware erhöht den verfügbaren Bestand erst beim Wareneingang.', 'Your account is recorded as the ordering user. Stock becomes available only when received.')}</Typography></Box>
      </Stack></DialogContent>
      <DialogActions><Button onClick={onClose} disabled={record.isPending}>{t('Abbrechen', 'Cancel')}</Button>
        <Button variant="contained" disabled={!valid || vendorsLoading || record.isPending} onClick={() => record.mutate()}>{t('Bestellung erfassen', 'Record order')}</Button></DialogActions>
    </Dialog>
  </>;
}
