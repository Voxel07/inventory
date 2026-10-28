import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  Link,
  Paper,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import { Link as RouterLink } from 'react-router-dom';
import { Button } from '../shared/ActionButtons';
import { FormDialog } from '../shared/FormDialog';
import { ItemForm } from '../forms/ItemForm';
import { OperationForm } from '../operations/OperationForm';
import { PurchaseDraft } from '../operations/PurchasingOperations';
import { ItemRequestLink, ItemRequestOutcome, ItemRequestStatusChip } from '../orders/ItemRequests';
import { assignRequestItem, declineItemRequest, type ItemRequestQueueEntry } from '../../services/procurementService';
import { useItemRequestQueue } from '../../hooks/useItemRequestQueue';
import { useCreateItem, useItemCategories } from '../../hooks/useItems';
import { useStorageLocations } from '../../hooks/useStorageLocations';
import { useMutationFeedback } from '../../hooks/useMutationFeedback';
import { translate, useT } from '../../utils/naming';
import { formatDate } from '../../utils/dateFormat';

type QueueDialog = { kind: 'create' | 'link' | 'decline' | 'order'; entry: ItemRequestQueueEntry } | null;

/** Procurement section for things orders asked for that the inventory does not hold yet. */
export function ItemRequestQueue({ eventId }: { eventId: string }) {
  const t = useT();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const feedback = useMutationFeedback();
  const [includeResolved, setIncludeResolved] = useState(false);
  const [dialog, setDialog] = useState<QueueDialog>(null);
  const queue = useItemRequestQueue(eventId, includeResolved);
  const { data: storageLocations = [] } = useStorageLocations();
  const { data: categories = [] } = useItemCategories();
  const createItem = useCreateItem();
  const assign = useMutation({ mutationFn: ({ id, itemId }: { id: string; itemId: string }) => assignRequestItem(id, itemId) });
  const entries = queue.data ?? [];
  const waiting = entries.filter((entry) => entry.request.status === 'open' || entry.request.status === 'item_created').length;

  function origin(entry: ItemRequestQueueEntry) {
    const order = entry.orderKind === 'faction'
      ? <Link component={RouterLink} to={`/orders/faction/${entry.orderId}`}>{entry.orderLabel}</Link>
      : <Link component={RouterLink} to="/orders?tab=general">{entry.orderLabel}</Link>;
    const context = [entry.faction ?? t('itemRequests.generalOrder'), t('itemRequests.requestedBy', { name: entry.requestedBy }),
      entry.eventName && `${entry.eventName}${entry.eventDate ? ` · ${formatDate(entry.eventDate)}` : ''}`].filter(Boolean).join(' · ');
    return <>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{order}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{context}</Typography>
    </>;
  }

  function describe(entry: ItemRequestQueueEntry) {
    const { request } = entry;
    return <>
      <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{request.name}</Typography>
      <ItemRequestLink link={request.link} />
      {request.note && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'pre-line' }}>{request.note}</Typography>}
      <ItemRequestOutcome request={request} />
    </>;
  }

  function actions(entry: ItemRequestQueueEntry) {
    const { status } = entry.request;
    if (status !== 'open' && status !== 'item_created') return null;
    return <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {status === 'open' && <>
        <Button title={translate('itemRequests.createItemTitle')} size="small" variant="contained" onClick={() => setDialog({ kind: 'create', entry })}>{t('itemRequests.createItem')}</Button>
        <Button title={translate('itemRequests.linkItemTitle')} size="small" onClick={() => setDialog({ kind: 'link', entry })}>{t('itemRequests.linkItem')}</Button>
      </>}
      {status === 'item_created' && entry.request.itemId && <Button title={translate('itemRequests.orderFromSupplierTitle')} size="small" variant="contained"
        startIcon={<AddShoppingCartIcon />} onClick={() => setDialog({ kind: 'order', entry })}>{t('itemRequests.orderFromSupplier')}</Button>}
      <Button title={translate('itemRequests.declineTitle')} size="small" color="error" onClick={() => setDialog({ kind: 'decline', entry })}>{t('itemRequests.decline')}</Button>
    </Stack>;
  }

  const linkCreated = (entry: ItemRequestQueueEntry, itemId: string) => assign.mutate({ id: entry.request.id, itemId }, feedback.callbacks(t('itemRequests.itemLinked'), () => setDialog(null)));

  return <Paper sx={{ mb: 3, borderLeft: 4, borderColor: 'warning.main' }}>
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', p: 2, borderBottom: 1, borderBottomColor: 'divider' }}>
      <AddShoppingCartIcon color="warning" />
      <Typography variant="h6">{t('itemRequests.section')}</Typography>
      {!queue.isPending && !queue.isError && <Chip size="small" color={waiting ? 'warning' : 'success'} label={t('itemRequests.openCount', { count: waiting })} />}
      <FormControlLabel sx={{ ml: { md: 'auto' } }} label={t('itemRequests.showResolved')}
        control={<Switch size="small" checked={includeResolved} onChange={(event) => setIncludeResolved(event.target.checked)} />} />
      <Typography variant="body2" color="text.secondary" sx={{ flexBasis: '100%' }}>{t('itemRequests.queueDescription')}</Typography>
    </Stack>
    <Box sx={{ p: entries.length && !isMobile ? 0 : 2 }}>
      {queue.isPending && <Stack spacing={1} aria-hidden="true">{[0, 1].map((row) => <Skeleton key={row} variant="rounded" height={48} />)}</Stack>}
      {queue.isError && <Alert severity="error">{queue.error instanceof Error ? queue.error.message : t('itemRequests.loadFailed')}</Alert>}
      {!queue.isPending && !queue.isError && !entries.length && <Typography color="text.secondary">{t('itemRequests.noRequests')}</Typography>}
      {entries.length > 0 && (isMobile
        ? <Stack spacing={1}>{entries.map((entry) => <Card key={entry.request.id} variant="outlined">
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box sx={{ minWidth: 0 }}>{describe(entry)}</Box>
              <Stack spacing={0.5} sx={{ alignItems: 'flex-end', flexShrink: 0 }}>
                <ItemRequestStatusChip status={entry.request.status} />
                <Typography variant="body2" sx={{ fontWeight: 900 }}>× {entry.request.quantity}</Typography>
              </Stack>
            </Stack>
            <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>{origin(entry)}</Box>
            <Box sx={{ mt: 1 }}>{actions(entry)}</Box>
          </CardContent>
        </Card>)}</Stack>
        : <TableContainer><Table size="small">
          <TableHead><TableRow>
            <TableCell>{t('itemRequests.request')}</TableCell>
            <TableCell align="right">{t('common.quantity')}</TableCell>
            <TableCell>{t('itemRequests.from')}</TableCell>
            <TableCell>{t('common.status')}</TableCell>
            <TableCell>{t('common.action')}</TableCell>
          </TableRow></TableHead>
          <TableBody>{entries.map((entry) => <TableRow key={entry.request.id} hover>
            <TableCell sx={{ maxWidth: 360 }}>{describe(entry)}</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>{entry.request.quantity}</TableCell>
            <TableCell>{origin(entry)}</TableCell>
            <TableCell><ItemRequestStatusChip status={entry.request.status} /></TableCell>
            <TableCell>{actions(entry)}</TableCell>
          </TableRow>)}</TableBody>
        </Table></TableContainer>)}
    </Box>

    {dialog?.kind === 'create' && <FormDialog open onClose={() => setDialog(null)}>
      <ItemForm
        key={dialog.entry.request.id}
        title={t('itemRequests.createItem')}
        onCancel={() => setDialog(null)}
        storageLocations={storageLocations}
        categories={categories}
        isLoading={createItem.isPending || assign.isPending}
        defaults={{
          // Nothing is in stock yet: the purchase order brings it in.
          amount: 0,
          name: dialog.entry.request.name,
          description: [dialog.entry.request.note, dialog.entry.request.link && translate('itemRequests.source', { link: dialog.entry.request.link })]
            .filter(Boolean).join('\n'),
        }}
        onSubmit={(data) => createItem.mutate(data, {
          onSuccess: (item) => linkCreated(dialog.entry, item.id),
          onError: feedback.error,
        })}
      />
    </FormDialog>}
    {dialog?.kind === 'link' && <OperationForm title={t('itemRequests.linkItemDialog', { name: dialog.entry.request.name })} submitLabel={t('itemRequests.linkConfirm')}
      fields={[{ key: 'itemId', label: t('common.item'), type: 'item', required: true }]} onClose={() => setDialog(null)}
      onSave={(values) => assignRequestItem(dialog.entry.request.id, String(values.itemId))} />}
    {dialog?.kind === 'decline' && <OperationForm title={t('itemRequests.declineDialog', { name: dialog.entry.request.name })} submitLabel={t('itemRequests.confirmDecline')}
      fields={[{ key: 'reason', label: t('itemRequests.reason'), multiline: true, required: true }]} onClose={() => setDialog(null)}
      onSave={(values) => declineItemRequest(dialog.entry.request.id, String(values.reason ?? ''))} />}
    {dialog?.kind === 'order' && dialog.entry.request.itemId && <PurchaseDraft
      initialLines={[{ itemId: dialog.entry.request.itemId, orderedQuantity: dialog.entry.request.quantity }]}
      eventId={dialog.entry.eventOccurrenceId ?? eventId} onClose={() => setDialog(null)} />}
  </Paper>;
}
