import { formatDate } from '../../utils/dateFormat';
import { useFactionCatalog } from '../../hooks/useFactionCatalog';
import { Button } from '../shared/ActionButtons';
import { GeneralOrderWorkflow } from './GeneralOrderWorkflow';
import { useAuth } from '../../hooks/useAuth';
import { canOperateWarehouse, canPerformCustody, canTakeOut, canUseGeneralOrders } from '../../utils/access';
import { Dialog } from '../shared/ClosableDialog';
import { useState } from 'react';
import {
  Alert,
  Box,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  ListSubheader,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { useCreateOrder, useOrders, useTransitionOrder, useUpdateOrder } from '../../hooks/useOrders';
import { useEventReports } from '../../hooks/useEvents';
import { useItemsByIds, usePagedItems } from '../../hooks/useItems';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { LoadMore } from '../shared/LoadMore';
import { type GeneralOrderSummary, type Item } from '../../types';
import { translate, useT } from '../../utils/naming';
import { useMutationFeedback } from '../../hooks/useMutationFeedback';
import { Link as RouterLink } from 'react-router-dom';
import { OrderListSection, type OrderListEntry } from './OrderListSection';
import { ORDER_CATALOG_PAGE_SIZE } from './OrderCatalogPager';
import { QuantityControl } from './QuantityControl';
import { OrderPickupGroups } from './OrderPickupGroups';
import { CatalogSearchField } from './CatalogSearchField';
import { toPositiveIntegerQuantities } from '../../utils/quantityMaps';
import { useOrderEventSelection } from '../../hooks/useOrderEventSelection';
import { useUIStore } from '../../store/uiStore';
import { OrderEventFilter } from './OrderEventFilter';

const ACTIVE_STATUSES = ['draft', 'submitted', 'preparing', 'ready', 'picked_up', 'partially_returned'] as const;
const HISTORY_STATUSES = ['returned', 'closed', 'cancelled'] as const;

const statusLabels = {
  preparing: 'orders.generalOrders.statusLabels.preparing', draft: 'orders.generalOrders.statusLabels.draft', submitted: 'orders.generalOrders.statusLabels.submitted', ready: 'orders.generalOrders.statusLabels.ready',
  picked_up: 'orders.generalOrders.statusLabels.picked_up', partially_returned: 'orders.generalOrders.statusLabels.partially_returned',
  returned: 'orders.generalOrders.statusLabels.returned', closed: 'orders.generalOrders.statusLabels.closed', cancelled: 'orders.generalOrders.statusLabels.cancelled',
} as const;

export function GeneralOrders() {
  const t = useT();
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
  const [workflow, setWorkflow] = useState<{order: GeneralOrderSummary; action: 'prepare' | 'pickup' | 'return' | 'history'} | null>(null);
  const [pickupOrder, setPickupOrder] = useState<string | null>(null);
  const [editing, setEditing] = useState<GeneralOrderSummary | null | 'new'>(null);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [eventId, setEventId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [itemSearch, setItemSearch] = useState('');

  const eventMap = new Map(events.map((event) => [event.id, event]));
  const activeEvents = events;
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
    setEditing(order ?? 'new');
    setName(order?.name ?? '');
    setPurpose(order?.purpose ?? '');
    setEventId(order ? order.eventOccurrenceId ?? '' : selectedEventId || currentEvent?.id || '');
    setQuantities(Object.fromEntries(Object.entries(order?.requestedQuantities ?? {}).map(([id, quantity]) => [id, String(quantity)])));
    setItemSearch('');
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const requestedQuantities = toPositiveIntegerQuantities(quantities);
    const data = { name: name.trim(), purpose: purpose.trim(), eventOccurrenceId: eventId || undefined, requestedQuantities };
    const callbacks = feedback.callbacks(editing === 'new' ? t('orders.generalOrders.orderCreated') : t('orders.generalOrders.orderUpdated'), () => setEditing(null));
    if (editing === 'new') createOrder.mutate(data, callbacks);
    else if (editing) updateOrder.mutate({ id: editing.id, data }, callbacks);
  }
  function advance(order: GeneralOrderSummary, action: 'submit' | 'ready' | 'pickup' | 'close' | 'cancel') {
    transitionOrder.mutate({ id: order.id, action }, feedback.callbacks(t('orders.generalOrders.orderUpdated')));
  }
  const editItem = (item: Item) => (
    <Paper key={item.id} variant="outlined" sx={{ p: 1, borderColor: Number(quantities[item.id]) > 0 ? 'primary.main' : 'divider' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography>
          <Typography variant="caption" color="text.secondary">{item.category} · {t('enum.itemStatus.available')}: {item.stock?.available ?? 0}</Typography>
        </Box>
        <QuantityControl label={`${item.name} ${t('common.quantity')}`} value={quantities[item.id] ?? ''}
          onChange={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))} />
      </Stack>
    </Paper>
  );

  function orderEntry(order: GeneralOrderSummary): OrderListEntry {
    const itemCount = Object.values(order.requestedQuantities ?? {}).reduce((sum, quantity) => sum + quantity, 0);
    const statusColor: OrderListEntry['statusColor'] = order.status === 'ready' || order.status === 'closed'
      ? 'success' : order.status === 'submitted' ? 'info'
        : order.status === 'picked_up' ? 'secondary'
          : order.status === 'partially_returned' ? 'warning' : order.status === 'cancelled' ? 'error' : 'default';
    return {
      id: order.id,
      title: order.name,
      subtitle: <>{order.purpose} · {eventName(order.eventOccurrenceId)}</>,
      details: <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {t('enum.value.ordered')}: {itemCount} · {t('common.prepared')}: {Object.values(order.preparedQuantities ?? {}).reduce((sum, quantity) => sum + quantity, 0)}
      </Typography>,
      status: t(statusLabels[order.status ?? 'draft']),
      statusColor,
      actions: <>
        <Button title={t('orders.generalOrders.showResponsiblePeopleAndPickupGroups')} onClick={() => setPickupOrder(order.id)}>{t('orders.generalOrders.itemsPickupGroups')}</Button>
        <Button title={translate('orders.generalOrders.displayTheHistoryOfThisOrder')} onClick={() => setWorkflow({ order, action: 'history' })}>{t('common.history')}</Button>
        {order.status === 'draft' && canChange(order) && <><Button title={translate('orders.generalOrders.editThisOrderSItemsAndQuantities')} size="small" onClick={() => startEditing(order)}>{t('common.edit')}</Button><Button title={translate('orders.generalOrders.submitThisOrderForProcessing')} size="small" variant="contained" onClick={() => advance(order, 'submit')}>{t('orders.generalOrders.submit')}</Button></>}
        {['submitted', 'preparing'].includes(order.status) && canOperateWarehouse(user) && <Button title={translate('orders.generalOrders.enterPreparedQuantitiesAndAssetAssignments')} onClick={() => setWorkflow({ order, action: 'prepare' })}>{t('orders.generalOrders.prepare')}</Button>}
        {order.status === 'preparing' && canOperateWarehouse(user) && <Button title={translate('orders.generalOrders.markThisOrderReadyForPickup')} onClick={() => advance(order, 'ready')}>{t('orders.generalOrders.markReady')}</Button>}
        {order.status === 'ready' && canTakeOut(user) && <Button title={translate('orders.generalOrders.recordPickupAndTheResponsiblePerson')} size="small" variant="contained" onClick={() => setWorkflow({ order, action: 'pickup' })}>{t('orders.generalOrders.pickUp')}</Button>}
        {['picked_up', 'partially_returned'].includes(order.status) && canPerformCustody(user) && <Button title={translate('orders.generalOrders.enterReturnQuantitiesAndCondition')} size="small" variant="contained" onClick={() => setWorkflow({ order, action: 'return' })}>{t('orders.generalOrders.recordReturn')}</Button>}
        {order.status === 'returned' && canPerformCustody(user) && <Button title={translate('orders.generalOrders.closeThisOrder')} size="small" onClick={() => advance(order, 'close')}>{t('orders.generalOrders.close')}</Button>}
        {['draft', 'submitted', 'preparing', 'ready'].includes(order.status) && canChange(order) && <Button title={translate('orders.generalOrders.cancelThisOrder')} size="small" color="error" onClick={() => advance(order, 'cancel')}>{t('orders.generalOrders.cancel')}</Button>}
      </>,
    };
  }

  return <Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2, justifyContent: 'space-between' }}>
      <Box><Typography variant="h4">{t('common.generalOrders')}</Typography>
        <Typography color="text.secondary">{t('orders.generalOrders.itemsForCateringSponsorTentsStagesAndOtherPurposes')}</Typography></Box>
      <Button title={translate('orders.generalOrders.createANewGeneralOrder')} disabled={!canUseGeneralOrders(user)} variant="contained" startIcon={<AddIcon />} onClick={() => startEditing()}>{t('orders.generalOrders.newOrder')}</Button>
    </Stack>
    <OrderEventFilter
      eventTypes={eventTypes}
      eventType={eventType}
      onEventTypeChange={setEventType}
      eventOptions={eventOptions}
      selectedEventId={selectedEventId}
      onEventChange={setSelectedEventId}
    >
      <TextField fullWidth size="small" label={t('orders.generalOrders.searchOrders')} value={search}
        onChange={(event) => setSearch(event.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
        sx={{ maxWidth: 520 }} />
    </OrderEventFilter>
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
      title={t('orders.generalOrders.orderHistory')}
      emptyMessage={t('orders.generalOrders.noCompletedOrderHistoryYet')}
      groups={[{ entries: (history.data ?? []).map(orderEntry) }]}
      count={history.data?.length ?? 0}
      isLoading={history.isLoading}
      list={history}
      loadError={history.isError}
      onRetry={() => { void history.refetch(); }}
    />

    <Dialog open={editing !== null} onClose={() => setEditing(null)} fullWidth maxWidth="lg">
      <Box component="form" onSubmit={submit}><DialogTitle>{editing === 'new' ? t('orders.generalOrders.newOrder') : t('orders.generalOrders.editOrder')}</DialogTitle>
        <DialogContent dividers><Stack spacing={2}>
          <TextField autoFocus required label={t('profile.name')} value={name} onChange={(event) => setName(event.target.value)} slotProps={{ htmlInput: { maxLength: 160 } }} />
          <TextField required multiline minRows={2} label={t('orders.generalOrders.purpose')} value={purpose} onChange={(event) => setPurpose(event.target.value)} slotProps={{ htmlInput: { maxLength: 4000 } }} />
          <TextField select label={t('nav.currentEvent')} value={eventId} onChange={(event) => setEventId(event.target.value)}>
            <MenuItem value="">{t('orders.generalOrders.selectEvent')}</MenuItem>
            {eventTypes.flatMap((type) => {
              const occurrences = activeEvents.filter((event) => event.eventType === type);
              return occurrences.length ? [
                <ListSubheader key={`${type}-heading`}>{type === 'LS' ? 'LightSim' : type}</ListSubheader>,
                ...occurrences.map((event) => <MenuItem key={event.id} value={event.id}>{event.name} · {formatDate(event.startDate)}{event.endDate !== event.startDate ? ` – ${formatDate(event.endDate)}` : ''}</MenuItem>),
              ] : [];
            })}
          </TextField>
          {!activeEvents.length && <Alert severity="info" action={<Button title={translate('orders.generalOrders.openTheEventOverview')} component={RouterLink} to="/events" onClick={() => setEditing(null)}>{t('orders.generalOrders.openEvents')}</Button>}>{t('orders.generalOrders.createAnEventFirst')}</Alert>}
          <Divider />
          <Typography variant="h6">{t('orders.generalOrders.requestedItems')}</Typography>
          <CatalogSearchField label={t('common.searchItems')} value={itemSearch} onChange={setItemSearch} />
          {catalog.isError && <Alert severity="error">{t('orders.generalOrders.itemSearchFailed')}</Alert>}
          <Box sx={{ maxHeight: 360, overflowY: 'auto' }}><Stack spacing={0.5}>{(catalog.data ?? []).map(editItem)}</Stack><LoadMore list={catalog} /></Box>
          {chosenIds.length > 0 && <Box>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>{t('orders.generalOrders.currentOrder')}</Typography>
            <Stack spacing={0.5}>
              {(chosen.data ?? []).filter((item) => Number(quantities[item.id]) > 0).map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography sx={{ flex: 1, fontWeight: 700 }}>{item.name}</Typography>
                  <QuantityControl label={`${item.name} ${t('common.quantity')}`} value={quantities[item.id] ?? ''}
                    onChange={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))} />
                  <Button title={translate('orders.generalOrders.removeThisItemFromTheOrder')} size="small" color="error" onClick={() => setQuantities((current) => ({ ...current, [item.id]: '' }))}>{t('common.remove')}</Button>
                </Stack>
              </Paper>)}
            </Stack>
          </Box>}
        </Stack></DialogContent><DialogActions><Button title={translate('common.discardChangesAndClose')} onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
          <Button title={editing === 'new'
            ? translate('orders.generalOrders.createThisOrderWithTheEnteredQuantities')
            : translate('orders.generalOrders.updateThisOrderWithTheChangedQuantities')}
            type="submit" variant="contained" disabled={createOrder.isPending || updateOrder.isPending || !name.trim() || !purpose.trim() || !eventId || !Object.values(quantities).some((value) => Number(value) > 0)}>
            {editing === 'new' ? t('orders.generalOrders.createOrder') : t('orders.generalOrders.updateOrder')}
          </Button></DialogActions>
      </Box>
    </Dialog>

    {pickupOrder && <Dialog open onClose={() => setPickupOrder(null)} fullWidth maxWidth="lg"><DialogTitle>{t('orders.generalOrders.itemsPickupGroups')}</DialogTitle><DialogContent><OrderPickupGroups kind="general" orderId={pickupOrder} /></DialogContent></Dialog>}
    {workflow && <GeneralOrderWorkflow order={workflow.order} action={workflow.action} onClose={() => setWorkflow(null)} />}
  </Box>;
}
