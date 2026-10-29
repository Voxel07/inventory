import { locationLabel } from '../utils/locationHierarchy';
import { formatDate } from '../utils/dateFormat';
import { Button } from '../components/shared/ActionButtons';
import { ActionBar } from '../components/shared/ActionBar';
import { PageHeader } from '../components/shared/PageHeader';
import { Dialog } from '../components/shared/ClosableDialog';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  CircularProgress,
  DialogContent,
  DialogTitle,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { OrderEventFilter } from '../components/orders/OrderEventFilter';
import AddIcon from '@mui/icons-material/Add';
import { FactionOrderForm } from '../components/forms/FactionOrderForm';
import { useCreateFactionOrder, useFactionOrders } from '../hooks/useFactionOrders';
import { useQuery } from '@tanstack/react-query';
import { loadAllPages } from '../services/apiPagination';
import { getFactionOrders } from '../services/factionOrderService';
import { useAssemblies } from '../hooks/useAssemblies';
import { useEventReports } from '../hooks/useEvents';
import { useStorageLocations } from '../hooks/useStorageLocations';
import type { EventType, FactionOrderStatus, FactionOrderSummary } from '../types';
import { useUIStore } from '../store/uiStore';
import { translate, useT } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canManageInventory, canOrder, canViewFaction, canWriteFaction, factionKeyOf } from '../utils/access';
import { useFactionCatalog } from '../hooks/useFactionCatalog';
import { FactionAccessNotice } from '../components/shared/AccessGuard';
import { isOfflineQueuedError } from '../utils/offline';
import { OrderListSection, type OrderListEntry } from '../components/orders/OrderListSection';
import { useOrderEventSelection } from '../hooks/useOrderEventSelection';
import { ItemRequestBadge } from '../components/orders/ItemRequests';

const HISTORY_ORDER_STATUSES: readonly FactionOrderStatus[] = ['returned', 'closed', 'cancelled'];
const ACTIVE_ORDER_STATUSES: readonly FactionOrderStatus[] = ['draft', 'submitted', 'preparing', 'ready', 'picked_up', 'partially_returned'];
const COUNTED_ORDER_STATUSES: readonly FactionOrderStatus[] = [...ACTIVE_ORDER_STATUSES, 'returned', 'closed'];

function statusColor(status: FactionOrderStatus): 'default' | 'info' | 'warning' | 'success' | 'secondary' | 'error' {
  if (status === 'draft') return 'default';
  if (status === 'submitted') return 'info';
  if (status === 'preparing') return 'warning';
  if (status === 'ready') return 'success';
  if (status === 'picked_up') return 'secondary';
  if (status === 'partially_returned') return 'warning';
  if (status === 'returned') return 'info';
  if (status === 'closed') return 'success';
  return 'error';
}

export function FactionOrders() {
  const t = useT();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const eventType = useUIStore((state) => state.activeEventType);
  const setEventType = useUIStore((state) => state.setActiveEventType);
  const catalog = useFactionCatalog();
  const [chosenFaction, setSelectedFaction] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogReady, setDialogReady] = useState(false);
  const { user } = useAuth();
  const currentUser = user;
  const isManager = canManageInventory(currentUser);
  const accessibleFactions = (type: EventType) => catalog.factionsFor(type)
    .filter((faction) => canViewFaction(currentUser, factionKeyOf(faction)))
    .map((faction) => faction.name);
  const canCreateList = catalog.factionsFor(eventType).some((faction) => canWriteFaction(currentUser, factionKeyOf(faction)));
  const selectableEvents = catalog.eventTypes.filter((type) => accessibleFactions(type).length > 0);
  const visibleFactions = accessibleFactions(eventType);
  const selectedFaction = visibleFactions.includes(chosenFaction) ? chosenFaction : visibleFactions[0] ?? '';
  const { data: assemblies = [] } = useAssemblies();
  const { data: events = [] } = useEventReports();
  const { selectedEventId, setSelectedEventId, eventOptions } = useOrderEventSelection(events);
  const { data: storageLocations = [] } = useStorageLocations();
  // Event type, event and the active/history split are server filters; both lists page on demand.
  const eventId = selectedEventId || undefined;
  const active = useFactionOrders(eventType, undefined, ACTIVE_ORDER_STATUSES, eventId);
  const history = useFactionOrders(eventType, undefined, HISTORY_ORDER_STATUSES, eventId);
  // The per-faction status row is an explicit complete read of the non-cancelled orders in this scope.
  const overviewOrders = useQuery({ queryKey: ['faction-orders', 'overview', eventType, eventId], networkMode: 'offlineFirst',
    queryFn: () => loadAllPages((page, size) => getFactionOrders({ eventType, eventId, status: COUNTED_ORDER_STATUSES }, page, size)) });
  const createOrder = useCreateFactionOrder();
  const activeOrders = (active.data ?? []).filter((order) => canViewFaction(currentUser, order.factionKey));
  const factionOverview = visibleFactions.map((faction) => {
    const factionOrders = (overviewOrders.data ?? []).filter((order) => order.faction === faction);
    const state = factionOrders.some((order) => order.status !== 'draft')
      ? 'finished'
      : factionOrders.length ? 'draft' : 'none';
    return { faction, state };
  });
  const activeOrderGroups = [...new Set(activeOrders.map((order) => order.faction))]
    .map((faction) => ({ faction, orders: activeOrders.filter((order) => order.faction === faction) }));
  const historyOrders = (history.data ?? []).filter((order) => canViewFaction(currentUser, order.factionKey));

  useEffect(() => {
    if (!selectableEvents.includes(eventType) && selectableEvents[0]) setEventType(selectableEvents[0]);
  }, [eventType, selectableEvents, setEventType]);

  function selectEvent(value: EventType) {
    setEventType(value);
    const firstFaction = accessibleFactions(value)[0];
    if (firstFaction) setSelectedFaction(firstFaction);
  }

  function openCreate(faction?: string) {
    setSelectedFaction(faction ?? visibleFactions[0]);
    setDialogOpen(true);
  }

  function statusLabel(status: FactionOrderStatus) {
    const labels: Record<FactionOrderStatus, string> = {
      draft: t('enum.value.draft'),
      submitted: t('pages.factionOrders.readyForProcessing'),
      preparing: t('enum.value.preparing'),
      ready: t('pages.factionOrders.ready'),
      picked_up: t('enum.value.picked_up'),
      partially_returned: t('pages.factionOrders.partiallyReturned'),
      returned: t('enum.value.returned'),
      closed: t('enum.value.closed'),
      cancelled: t('enum.value.cancelled'),
    };
    return labels[status];
  }

  function progress(order: FactionOrderSummary) {
    const requested = Object.values(order.requestedQuantities).reduce((sum, value) => sum + value, 0);
    const prepared = Object.values(order.preparedQuantities ?? {}).reduce((sum, value) => sum + value, 0);
    const requestedAssemblies = Object.values(order.requestedAssemblyQuantities ?? {}).reduce((sum, value) => sum + value, 0);
    const preparedAssemblies = Object.values(order.preparedAssemblyQuantities ?? {}).reduce((sum, value) => sum + value, 0);
    return { requested: requested + requestedAssemblies, prepared: prepared + preparedAssemblies };
  }

  function pickupLabel(order: FactionOrderSummary) {
    const location = order.expand?.pickupLocation
      ?? storageLocations.find((candidate) => candidate.id === order.pickupLocation);
    const point = order.pickupLatitude != null && order.pickupLongitude != null
      ? `${order.pickupLatitude.toFixed(5)}, ${order.pickupLongitude.toFixed(5)}`
      : undefined;
    return location
      ? [locationLabel(location), point].filter(Boolean).join(' · ')
      : point ?? '—';
  }

  function orderEntry(order: FactionOrderSummary, history = false): OrderListEntry {
    const totals = progress(order);
    const date = formatDate(order.eventDate);
    return {
      id: order.id,
      title: history ? `${order.faction} · ${order.orderCode}` : order.orderCode,
      subtitle: `${date} · ${totals.prepared}/${totals.requested} ${['picked_up', 'partially_returned', 'returned'].includes(order.status) ? t('pages.factionOrders.used') : t('pages.factionOrders.prepared')}`,
      details: <>
        {order.requestedPickupDate != null && <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
          {t('common.requestedPickup')}: {formatDate(order.requestedPickupDate)}
        </Typography>}
        <Typography variant="caption" color={order.status === 'ready' ? 'success.main' : 'text.secondary'} sx={{ display: 'block' }}>
          {t('common.pickupLocation')}: {pickupLabel(order)}
        </Typography>
        <ItemRequestBadge requests={order.itemRequests} />
      </>,
      status: statusLabel(order.status),
      statusColor: statusColor(order.status),
      onOpen: () => navigate(`/orders/faction/${order.id}`),
      actions: <Button onClick={() => navigate(`/orders?pickupOrder=${order.id}&pickupKind=faction`)}>{t('pages.factionOrders.itemsPickupGroups')}</Button>,
    };
  }

  return (
    <Box>
      <PageHeader title={t('pages.factionOrders.factionOrderLists')}
        actions={<ActionBar actions={[{ key: 'new', label: t('pages.factionOrders.newList'), title: translate('pages.factionOrders.createANewFactionOrderList'),
          icon: <AddIcon />, variant: 'contained', pinned: true, disabled: !canCreateList, onClick: () => openCreate() }]} />} />

      <OrderEventFilter
        eventTypes={selectableEvents}
        eventType={eventType}
        onEventTypeChange={selectEvent}
        eventOptions={eventOptions}
        selectedEventId={selectedEventId}
        onEventChange={setSelectedEventId}
      >
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, overflowX: { md: 'auto' } }}>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            {t('pages.factionOrders.factionOrderStatus')}
          </Typography>
          {overviewOrders.isLoading ? <CircularProgress size={20} aria-label={t('pages.factionOrders.loadingOrderStatus')} /> : !overviewOrders.isError && (
            <Stack direction="row" sx={{ flexWrap: { xs: 'wrap', md: 'nowrap' }, gap: 1 }}>
              {factionOverview.map(({ faction, state }) => {
                const label = state === 'finished' ? t('enum.value.submitted')
                  : state === 'draft' ? t('enum.value.draft') : t('pages.factionOrders.noOrder');
                const color = state === 'finished' ? 'success.main'
                  : state === 'draft' ? 'warning.main' : 'error.main';
                return <Tooltip key={faction} title={label} arrow>
                  <Stack direction="row" spacing={0.75} aria-label={`${faction}: ${label}`} sx={{ alignItems: 'center', flexShrink: 0, px: 1, py: 0.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    <Box aria-hidden="true" sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ lineHeight: 1.2, whiteSpace: 'nowrap' }}>{faction}</Typography>
                  </Stack>
                </Tooltip>;
              })}
            </Stack>
          )}
        </Box>
        {!isManager && canOrder(currentUser) && <Box sx={{ alignSelf: { xs: 'flex-end', md: 'center' }, ml: { md: 'auto' } }}><FactionAccessNotice /></Box>}
      </OrderEventFilter>


      <OrderListSection
        title={t('pages.factionOrders.activeOrders')}
        emptyMessage={t('pages.factionOrders.thereAreNoActiveOrdersForThisEvent')}
        groups={activeOrderGroups.map(({ faction, orders: factionOrders }) => ({
          label: faction,
          entries: factionOrders.map((order) => orderEntry(order)),
        }))}
        count={activeOrders.length}
        isLoading={active.isLoading}
        list={active}
        loadError={active.isError}
        onRetry={() => { void active.refetch(); }}
      />
      <OrderListSection
        collapsible
        title={t('pages.factionOrders.orderHistory')}
        emptyMessage={t('pages.factionOrders.thereIsNoCompletedOrderHistoryForThisEventYet')}
        groups={[{ entries: historyOrders.map((order) => orderEntry(order, true)) }]}
        count={historyOrders.length}
        isLoading={history.isLoading}
        list={history}
        loadError={history.isError}
        onRetry={() => { void history.refetch(); }}
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullScreen={isMobile} fullWidth maxWidth="lg"
        slotProps={{ transition: { onEntered: () => setDialogReady(true), onExit: () => setDialogReady(false) } }}>
        <DialogTitle sx={{ pr: 7 }}>
          {t('pages.factionOrders.newFactionOrderList')}
        </DialogTitle>
        <DialogContent dividers>
          {dialogReady && <FactionOrderForm
            assemblies={assemblies}
            storageLocations={storageLocations}
            defaultEventType={eventType}
            defaultEventOccurrenceId={selectedEventId}
            defaultFaction={selectedFaction}
            isLoading={createOrder.isPending}
            onSubmit={(data) => createOrder.mutate(data, {
              onSuccess: (order) => {
                setDialogOpen(false);
                showSnackbar(t('pages.factionOrders.orderListCreated'), 'success');
                navigate(`/orders/faction/${order.id}`);
              },
              onError: (error) => {
                if (isOfflineQueuedError(error)) {
                  setDialogOpen(false);
                  return; // The global mutation handler confirms that the order was queued.
                }
                showSnackbar(error instanceof Error ? error.message : t('pages.factionOrders.couldNotCreateList'), 'error');
              },
            })}
          />}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
