import { formatDate } from '../../utils/dateFormat';
import { useFactionCatalog } from '../../hooks/useFactionCatalog';
import { Button } from '../shared/ActionButtons';
import { ActionBar } from '../shared/ActionBar';
import { PageHeader } from '../shared/PageHeader';
import { GeneralOrderWorkflow } from './GeneralOrderWorkflow';
import { useAuth } from '../../hooks/useAuth';
import { canOperateWarehouse, canPerformCustody, canTakeOut, canUseGeneralOrders } from '../../utils/access';
import { Dialog } from '../shared/ClosableDialog';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { OrderStatusGuide } from './OrderStatusGuide';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { generalOrderApi } from '../../services/orderService';
import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  ListSubheader,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import { useCreateOrder, useOrders, useTransitionOrder, useUpdateOrder } from '../../hooks/useOrders';
import { useEventReports } from '../../hooks/useEvents';
import { useItemsByIds, usePagedItems } from '../../hooks/useItems';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { LoadMore } from '../shared/LoadMore';
import { type GeneralOrderSummary, type Item } from '../../types';
import { formatQuantity } from '../../utils/stock';
import { translate, useT } from '../../utils/naming';
import { useMutationFeedback } from '../../hooks/useMutationFeedback';
import { OrderListSection, type OrderListEntry } from './OrderListSection';
import { ORDER_CATALOG_PAGE_SIZE } from './OrderCatalogPager';
import { QuantityControl } from './QuantityControl';
import { OrderPickupGroups } from './OrderPickupGroups';
import { CatalogSearchField } from './CatalogSearchField';
import { toPositiveIntegerQuantities } from '../../utils/quantityMaps';
import { useOrderEventSelection } from '../../hooks/useOrderEventSelection';
import { useUIStore } from '../../store/uiStore';
import { OrderEventFilter } from './OrderEventFilter';
import { useCompactCatalog } from '../../hooks/useCompactCatalog';
import { ItemRequestBadge, ItemRequestEditor, ItemRequestList } from './ItemRequests';
import { toItemRequestDrafts, toItemRequestInputs, type ItemRequestDraft } from '../../utils/itemRequests';

const ACTIVE_STATUSES = ['draft', 'submitted', 'preparing', 'ready', 'picked_up', 'partially_returned'] as const;
const HISTORY_STATUSES = ['returned', 'closed', 'cancelled'] as const;

const statusLabels = {
  preparing: 'orders.generalOrders.statusLabels.preparing', draft: 'orders.generalOrders.statusLabels.draft', submitted: 'orders.generalOrders.statusLabels.submitted', ready: 'orders.generalOrders.statusLabels.ready',
  picked_up: 'orders.generalOrders.statusLabels.picked_up', partially_returned: 'orders.generalOrders.statusLabels.partially_returned',
  returned: 'orders.generalOrders.statusLabels.returned', closed: 'orders.generalOrders.statusLabels.closed', cancelled: 'orders.generalOrders.statusLabels.cancelled',
} as const;

export function GeneralOrders({ kindSwitch }: { kindSwitch?: ReactNode }) {
  const t = useT();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const compact = useCompactCatalog();
  const { eventTypes } = useFactionCatalog();
  const feedback = useMutationFeedback();
  const { data: events = [] } = useEventReports();
  const eventType = useUIStore((state) => state.activeEventType);
  const setEventType = useUIStore((state) => state.setActiveEventType);
  const { currentEvent, selectedEventId, setSelectedEventId, eventOptions } = useOrderEventSelection(events);
  const [search, setSearch] = useState('');
  const orderSearch = useDebouncedValue(search.trim());
  // Event, search and the active/history split are server filters: each list pages on demand.
  const orderQuery = { eventId: selectedEventId || undefined, eventType: selectedEventId ? undefined : eventType, search: orderSearch || undefined };
  const active = useOrders({ ...orderQuery, status: ACTIVE_STATUSES });
  const history = useOrders({ ...orderQuery, status: HISTORY_STATUSES });
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const transitionOrder = useTransitionOrder();
  const { user } = useAuth();
  // ASH crew change their own general orders; warehouse workers change every order.
  const canChange = (order: GeneralOrderSummary) => (order.createdBy === user?.id && canUseGeneralOrders(user)) || canOperateWarehouse(user);
  const [workflow, setWorkflow] = useState<{order: GeneralOrderSummary; action: 'prepare' | 'pickup' | 'return' | 'restock' | 'history'} | null>(null);
  const [editing, setEditing] = useState<GeneralOrderSummary | null | 'new'>(null);
  const [viewingSnapshot, setViewing] = useState<GeneralOrderSummary | null>(null);
  const detail = useQuery({ queryKey: ['general-orders', 'detail', viewingSnapshot?.id],
    queryFn: () => generalOrderApi.getById(viewingSnapshot!.id), enabled: Boolean(viewingSnapshot) });
  const viewing = viewingSnapshot ? detail.data ?? viewingSnapshot : null;
  const [cancelling, setCancelling] = useState<GeneralOrderSummary | null>(null);
  const viewedItems = useItemsByIds(Object.keys(viewing?.requestedQuantities ?? {}));
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [eventId, setEventId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [itemSearch, setItemSearch] = useState('');
  const [itemRequests, setItemRequests] = useState<ItemRequestDraft[]>([]);

  const eventMap = new Map(events.map((event) => [event.id, event]));
  // Closed events take no new orders.
  const activeEvents = events.filter((event) => event.status !== 'completed');
  const selectedEvent = eventMap.get(eventId);
  // The editor searches the catalog on the server; items usable for every event (untagged) stay offered.
  const catalog = usePagedItems({ search: useDebouncedValue(itemSearch.trim()) || undefined, eventType: selectedEvent?.eventType,
    includeUntagged: true, sort: 'name' }, { enabled: editing !== null, size: ORDER_CATALOG_PAGE_SIZE });
  const chosenIds = Object.entries(quantities).filter(([, value]) => Number(value) > 0).map(([id]) => id);
  const chosen = useItemsByIds(chosenIds);

  function eventName(id?: string) {
    const event = id ? eventMap.get(id) : undefined;
    return event ? `${event.name || event.eventType} · ${formatDate(event.eventDate)}` : t('orders.generalOrders.noEvent');
  }
  function startEditing(order?: GeneralOrderSummary) {
    setViewing(null);
    setEditing(order ?? 'new');
    setName(order?.name ?? '');
    setPurpose(order?.purpose ?? '');
    setEventId(order ? order.eventOccurrenceId ?? '' : selectedEventId || currentEvent?.id || '');
    setQuantities(Object.fromEntries(Object.entries(order?.requestedQuantities ?? {}).map(([id, quantity]) => [id, String(quantity)])));
    setItemRequests(toItemRequestDrafts(order?.itemRequests));
    setItemSearch('');
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const requestedQuantities = toPositiveIntegerQuantities(quantities);
    const data = { name: name.trim(), purpose: purpose.trim(), eventOccurrenceId: eventId || undefined, requestedQuantities,
      itemRequests: toItemRequestInputs(itemRequests) };
    const callbacks = feedback.callbacks(editing === 'new' ? t('orders.generalOrders.orderCreated') : t('orders.generalOrders.orderUpdated'), () => setEditing(null));
    if (editing === 'new') createOrder.mutate(data, callbacks);
    else if (editing) updateOrder.mutate({ id: editing.id, data }, callbacks);
  }
  function advance(order: GeneralOrderSummary, action: 'submit' | 'ready' | 'pickup' | 'close' | 'cancel') {
    if (transitionOrder.isPending) return;
    transitionOrder.mutate({ id: order.id, action }, feedback.callbacks(t('orders.generalOrders.orderUpdated'), () => {
      setViewing(null);
      setCancelling(null);
    }));
  }
  const editItem = (item: Item) => (
    <Paper key={item.id} variant="outlined" sx={{ p: 1, borderColor: Number(quantities[item.id]) > 0 ? 'primary.main' : 'divider' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography>
          <Typography variant="caption" color="text.secondary">{item.category} · {t('enum.itemStatus.available')}: {formatQuantity(item, item.stock?.available ?? 0)}</Typography>
        </Box>
        <QuantityControl label={`${item.name} ${t('common.quantity')}`} value={quantities[item.id] ?? ''} item={item}
          onChange={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))} />
      </Stack>
    </Paper>
  );

  function orderEntry(order: GeneralOrderSummary): OrderListEntry {
    const itemCount = Object.keys(order.requestedQuantities ?? {}).length;
    const statusColor: OrderListEntry['statusColor'] = order.status === 'ready' || order.status === 'closed'
      ? 'success' : order.status === 'submitted' ? 'info'
        : order.status === 'picked_up' ? 'secondary'
          : order.status === 'partially_returned' ? 'warning' : order.status === 'cancelled' ? 'error' : 'default';
    return {
      id: order.id,
      title: order.name,
      subtitle: <>{order.purpose} · {eventName(order.eventOccurrenceId)}</>,
      details: <>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {t('ordering.selectedLines', { count: itemCount })}
        </Typography>
        <ItemRequestBadge requests={order.itemRequests} />
      </>,
      status: t(statusLabels[order.status ?? 'draft']),
      statusColor,
      onOpen: () => setViewing(order),
    };
  }

  function orderActions(order: GeneralOrderSummary) {
    return <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button title={translate('orders.generalOrders.displayTheHistoryOfThisOrder')} onClick={() => setWorkflow({ order, action: 'history' })}>{t('common.history')}</Button>
        {order.status === 'draft' && canChange(order) && <><Button title={translate('orders.generalOrders.editThisOrderSItemsAndQuantities')} size="small" onClick={() => startEditing(order)}>{t('common.edit')}</Button><Button disabled={transitionOrder.isPending} title={translate('orders.generalOrders.submitThisOrderForProcessing')} size="small" variant="contained" onClick={() => advance(order, 'submit')}>{t('orders.generalOrders.submit')}</Button></>}
        {['submitted', 'preparing'].includes(order.status) && canOperateWarehouse(user) && <Button variant="contained" title={translate('orders.generalOrders.enterPreparedQuantitiesAndAssetAssignments')} onClick={() => setWorkflow({ order, action: 'prepare' })}>{t('orders.generalOrders.prepare')}</Button>}
        {order.status === 'preparing' && canOperateWarehouse(user) && <Button title={translate('orders.generalOrders.markThisOrderReadyForPickup')} disabled={transitionOrder.isPending} onClick={() => advance(order, 'ready')}>{t('orders.generalOrders.markReady')}</Button>}
        {order.status === 'ready' && canTakeOut(user) && <Button title={translate('orders.generalOrders.recordPickupAndTheResponsiblePerson')} size="small" variant="contained" onClick={() => setWorkflow({ order, action: 'pickup' })}>{t('orders.generalOrders.pickUp')}</Button>}
        {['picked_up', 'partially_returned'].includes(order.status) && canPerformCustody(user) && <Button title={translate('orders.generalOrders.enterReturnQuantitiesAndCondition')} size="small" variant="contained" onClick={() => setWorkflow({ order, action: 'return' })}>{t('orders.generalOrders.recordReturn')}</Button>}
        {['returned', 'closed'].includes(order.status) && canOperateWarehouse(user) && Object.values(order.consumedQuantities ?? {}).some((quantity) => quantity > 0)
          && <Button title={translate('orders.restockUnused.openRestockTitle')} size="small" onClick={() => setWorkflow({ order, action: 'restock' })}>{t('orders.restockUnused.openRestock')}</Button>}
        {order.status === 'returned' && canPerformCustody(user) && <Button disabled={transitionOrder.isPending} title={translate('orders.generalOrders.closeThisOrder')} size="small" onClick={() => advance(order, 'close')}>{t('orders.generalOrders.close')}</Button>}
        {['draft', 'submitted', 'preparing', 'ready'].includes(order.status) && canChange(order) && <Button title={translate('orders.generalOrders.cancelThisOrder')} size="small" color="error" onClick={() => setCancelling(order)}>{t('orders.generalOrders.cancel')}</Button>}
      </Stack>;
  }

  return <Box>
    <PageHeader title={t('nav.orders')} description={t('orders.generalOrders.itemsForCateringSponsorTentsStagesAndOtherPurposes')} inlineActions={compact}
      actions={<ActionBar iconOnly={compact} actions={[{ key: 'new', label: t('orders.generalOrders.newOrder'), title: translate('orders.generalOrders.createANewGeneralOrder'),
          icon: <AddIcon />, variant: 'contained', pinned: true, disabled: !canUseGeneralOrders(user), onClick: () => startEditing() }]} />} />
    {!canUseGeneralOrders(user) && <Alert severity="info" sx={{ mb: 2 }}>{t('ordering.readOnly')}</Alert>}
    <OrderEventFilter
      eventTypes={eventTypes}
      eventType={eventType}
      onEventTypeChange={setEventType}
      eventOptions={eventOptions}
      selectedEventId={selectedEventId}
      onEventChange={setSelectedEventId}
      leading={kindSwitch}
      search={{ value: search, onChange: setSearch, label: t('orders.generalOrders.searchOrders') }}
    />
    <OrderListSection
      title={t('orders.generalOrders.activeOrders')}
      emptyMessage={t('orders.generalOrders.noMatchingActiveOrdersYet')}
      groups={[{ entries: (active.data ?? []).map(orderEntry) }]}
      count={active.data?.length ?? 0}
      isLoading={active.isLoading}
      list={active}
      loadError={active.isError}
      onRetry={() => { void active.refetch(); }}
    />
    <OrderListSection
      collapsible
      title={t('orders.generalOrders.orderHistory')}
      emptyMessage={t('orders.generalOrders.noCompletedOrderHistoryYet')}
      groups={[{ entries: (history.data ?? []).map(orderEntry) }]}
      count={history.data?.length ?? 0}
      isLoading={history.isLoading}
      list={history}
      loadError={history.isError}
      onRetry={() => { void history.refetch(); }}
    />

    <Dialog open={editing !== null} onClose={() => { if (!createOrder.isPending && !updateOrder.isPending) setEditing(null); }} fullScreen={isMobile} fullWidth maxWidth="lg">
      <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '100%', height: isMobile ? '100%' : undefined }}><DialogTitle sx={{ pr: 7 }}>{editing === 'new' ? t('orders.generalOrders.newOrder') : t('orders.generalOrders.editOrder')}</DialogTitle>
        <DialogContent dividers><Stack spacing={2}>
          <Alert severity="info">{t('ordering.draftHelp')}</Alert>
          <Typography variant="h6">{t('ordering.detailsStep')}</Typography>
          <TextField autoFocus required label={t('profile.name')} helperText={t('ordering.nameHelp')} value={name} onChange={(event) => setName(event.target.value)} slotProps={{ htmlInput: { maxLength: 160 } }} />
          <TextField required multiline minRows={2} helperText={t('ordering.purposeHelp')} label={t('orders.generalOrders.purpose')} value={purpose} onChange={(event) => setPurpose(event.target.value)} slotProps={{ htmlInput: { maxLength: 4000 } }} />
          <TextField select label={t('nav.currentEvent')} value={eventId} onChange={(event) => setEventId(event.target.value)}>
            <MenuItem value="">{t('orders.generalOrders.withoutEvent')}</MenuItem>
            {eventTypes.flatMap((type) => {
              const occurrences = activeEvents.filter((event) => event.eventType === type);
              return occurrences.length ? [
                <ListSubheader key={`${type}-heading`}>{type}</ListSubheader>,
                ...occurrences.map((event) => <MenuItem key={event.id} value={event.id}>{event.name} · {formatDate(event.startDate)}{event.endDate !== event.startDate ? ` – ${formatDate(event.endDate)}` : ''}</MenuItem>),
              ] : [];
            })}
          </TextField>
          <Divider />
          <Typography variant="h6">{t('ordering.itemsStep')}</Typography>
          <CatalogSearchField label={t('common.searchItems')} value={itemSearch} onChange={setItemSearch} />
          {catalog.isError && <Alert severity="error">{t('orders.generalOrders.itemSearchFailed')}</Alert>}
          <Box sx={{ maxHeight: { xs: 'none', sm: 360 }, overflowY: { xs: 'visible', sm: 'auto' } }}><Stack spacing={0.5}>{(catalog.data ?? []).map(editItem)}</Stack><LoadMore list={catalog} /></Box>
          {chosenIds.length > 0 && <Box>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>{t('ordering.reviewStep')}</Typography>
            <Stack spacing={0.5}>
              {(chosen.data ?? []).filter((item) => Number(quantities[item.id]) > 0).map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1 }}>
                <Stack direction="row" useFlexGap sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ flex: '1 1 160px', fontWeight: 700 }}>{item.name}</Typography>
                  <QuantityControl label={`${item.name} ${t('common.quantity')}`} value={quantities[item.id] ?? ''} item={item}
                    onChange={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))} />
                  <Button title={translate('orders.generalOrders.removeThisItemFromTheOrder')} size="small" color="error" onClick={() => setQuantities((current) => ({ ...current, [item.id]: '' }))}>{t('common.remove')}</Button>
                </Stack>
              </Paper>)}
            </Stack>
          </Box>}
          <Divider />
          <Accordion key={editing === 'new' ? 'new' : editing?.id} defaultExpanded={itemRequests.length > 0} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>{t('itemRequests.title')}</Typography></AccordionSummary>
            <AccordionDetails><ItemRequestEditor value={itemRequests} onChange={setItemRequests} /></AccordionDetails>
          </Accordion>
          {!chosenIds.length && !itemRequests.length && <Alert severity="info">{t('ordering.noSelection')}</Alert>}
        </Stack></DialogContent><DialogActions sx={{ flexWrap: 'wrap', gap: 1, bgcolor: 'background.paper' }}>
          <Typography variant="body2" sx={{ flex: '1 1 140px' }} role="status">{t('ordering.selectedLines', { count: chosenIds.length + itemRequests.length })}</Typography>
          <Button disabled={createOrder.isPending || updateOrder.isPending} title={translate('common.discardChangesAndClose')} onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
          <Button title={editing === 'new'
            ? translate('orders.generalOrders.createThisOrderWithTheEnteredQuantities')
            : translate('orders.generalOrders.updateThisOrderWithTheChangedQuantities')}
            type="submit" variant="contained" disabled={createOrder.isPending || updateOrder.isPending || !name.trim() || !purpose.trim() || (!Object.values(quantities).some((value) => Number(value) > 0) && itemRequests.length === 0)}>
            {editing === 'new' ? t('ordering.saveDraft') : t('orders.generalOrders.updateOrder')}
          </Button></DialogActions>
      </Box>
    </Dialog>

    <Dialog open={Boolean(viewing)} onClose={() => setViewing(null)} fullScreen={isMobile} fullWidth maxWidth="md">
      {viewing && <>
        <DialogTitle sx={{ pr: 7 }}>{viewing.name}</DialogTitle>
        <DialogContent dividers>
          <Chip label={t(statusLabels[viewing.status])} sx={{ mb: 1.5 }} />
          {detail.isError && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={() => { void detail.refetch(); }}>{t('common.retry')}</Button>}>{t('orders.orderListSection.ordersCouldNotBeLoaded')}</Alert>}
          <OrderStatusGuide status={viewing.status} canEdit={canChange(viewing)} />
          <Typography sx={{ mb: 1 }}>{viewing.purpose}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{eventName(viewing.eventOccurrenceId)}</Typography>
          <Typography variant="h6" sx={{ mb: 1 }}>{t('ordering.contents')}</Typography>
          {viewedItems.isLoading && <Typography>{t('orders.orderListSection.loading')}</Typography>}
          {viewedItems.isError && <Alert severity="error">{t('orders.generalOrders.itemSearchFailed')}</Alert>}
          <Stack spacing={1} sx={{ mb: 2 }}>
            {Object.entries(viewing.requestedQuantities).map(([id, quantity]) => {
              const item = viewedItems.data?.find(item => item.id === id);
              return <Paper variant="outlined" key={id} sx={{ p: 1.5 }}>
                <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{item?.name ?? viewing.itemNames?.[id] ?? id}</Typography>
                <Typography variant="body2">{t('enum.value.ordered')}: {formatQuantity(item, quantity)} · {t('common.prepared')}: {formatQuantity(item, viewing.preparedQuantities[id] ?? 0)}</Typography>
              </Paper>;
            })}
          </Stack>
          <ItemRequestList requests={viewing.itemRequests ?? []} />
          <Box sx={{ mt: 2 }}>{orderActions(viewing)}</Box>
          <Accordion disableGutters sx={{ mt: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>{t('orders.generalOrders.itemsPickupGroups')}</Typography></AccordionSummary>
            <AccordionDetails><OrderPickupGroups kind="general" orderId={viewing.id} /></AccordionDetails>
          </Accordion>
        </DialogContent>
        <DialogActions><Button onClick={() => setViewing(null)}>{t('common.close')}</Button></DialogActions>
      </>}
    </Dialog>
    <ConfirmDialog open={Boolean(cancelling)} title={t('ordering.cancelTitle')}
      message={t('ordering.cancelHelp', { name: cancelling?.name ?? '' })} actionLabel={t('pages.factionOrderDetail.cancelOrder')}
      cancelLabel={t('ordering.keepOrder')}
      actionColor="error" pending={transitionOrder.isPending} onClose={() => { if (!transitionOrder.isPending) setCancelling(null); }}
      onConfirm={() => { if (cancelling) advance(cancelling, 'cancel'); }} />

    {workflow && <GeneralOrderWorkflow order={workflow.order} action={workflow.action} onClose={() => { setWorkflow(null); if (viewingSnapshot) void detail.refetch(); }} />}
  </Box>;
}
