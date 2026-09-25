import { Dialog } from '../components/shared/ClosableDialog';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  DialogContent,
  DialogTitle,
  Select,
  Stack,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { FactionOrderForm } from '../components/forms/FactionOrderForm';
import { useCreateFactionOrder, useFactionOrders } from '../hooks/useFactionOrders';
import { useItems } from '../hooks/useItems';
import { useAssemblies } from '../hooks/useAssemblies';
import { useEventReports } from '../hooks/useEvents';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { EVENT_TYPES, FACTIONS_BY_EVENT, type EventType, type FactionOrder, type FactionOrderStatus } from '../types';
import { useUIStore } from '../store/uiStore';
import { useAppLanguage, useLocalizedText } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { allowedFactionKeys, canAccessFaction, canManageInventory } from '../utils/access';
import { FactionAccessNotice } from '../components/shared/AccessGuard';
import { isOfflineQueuedError } from '../utils/offline';
import { OrderListSection, type OrderListEntry } from '../components/orders/OrderListSection';
import { useClientPagination } from '../hooks/useClientPagination';

const HISTORY_ORDER_STATUSES: readonly FactionOrderStatus[] = ['returned', 'closed', 'cancelled'];

function isHistoricalOrder(order: FactionOrder) {
  return HISTORY_ORDER_STATUSES.includes(order.status);
}

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
  const t = useLocalizedText();
  const language = useAppLanguage();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const eventType = useUIStore((state) => state.activeEventType);
  const setEventType = useUIStore((state) => state.setActiveEventType);
  const [selectedFaction, setSelectedFaction] = useState(FACTIONS_BY_EVENT[eventType][0]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogReady, setDialogReady] = useState(false);
  const { user } = useAuth();
  const currentUser = user;
  const isManager = canManageInventory(currentUser);
  const allowedKeys = allowedFactionKeys(currentUser);
  const selectableEvents = EVENT_TYPES.filter((type) => FACTIONS_BY_EVENT[type]
    .some((faction) => canAccessFaction(currentUser, type, faction)));
  const visibleFactions = FACTIONS_BY_EVENT[eventType]
    .filter((faction) => canAccessFaction(currentUser, eventType, faction));
  const { data: items = [] } = useItems();
  const { data: assemblies = [] } = useAssemblies();
  const { data: events = [] } = useEventReports();
  const { data: storageLocations = [] } = useStorageLocations();
  const { data: allOrders = [], isLoading, isError, isComplete, hasNextPage, isFetchingNextPage, refetch } = useFactionOrders();
  const createOrder = useCreateFactionOrder();
  const orders = allOrders.filter((order) => order.eventType === eventType
    && (!selectedEventId || order.eventOccurrenceId === selectedEventId)
    && canAccessFaction(currentUser, order.eventType, order.faction));

  const activeOrders = orders.filter((order) => !isHistoricalOrder(order));
  const factionOverview = visibleFactions.map((faction) => {
    const factionOrders = orders.filter((order) => order.faction === faction && order.status !== 'cancelled');
    const state = factionOrders.some((order) => order.status !== 'draft')
      ? 'finished'
      : factionOrders.length ? 'draft' : 'none';
    return { faction, state };
  });
  const { pageItems: pageActiveOrders, page: currentActivePage, setPage: setActivePage, pageSize: activePageSize, onPageSizeChange: onActivePageSizeChange } = useClientPagination(activeOrders);
  const activeOrderGroups = [...new Set(pageActiveOrders
    .map((order) => order.faction))]
    .map((faction) => ({
      faction,
      orders: pageActiveOrders.filter((order) => order.faction === faction),
    }));
  const activeOrderCount = activeOrders.length;
  const historyOrders = orders.filter(isHistoricalOrder);
  const { pageItems: pageHistoryOrders, page: currentHistoryPage, setPage: setHistoryPage, pageSize: historyPageSize, onPageSizeChange: onHistoryPageSizeChange } = useClientPagination(historyOrders);

  useEffect(() => {
    if (!visibleFactions.includes(selectedFaction) && visibleFactions[0]) {
      setSelectedFaction(visibleFactions[0]);
    }
  }, [selectedFaction, visibleFactions]);

  useEffect(() => {
    if (!selectableEvents.includes(eventType) && selectableEvents[0]) setEventType(selectableEvents[0]);
  }, [eventType, selectableEvents, setEventType]);

  function selectEvent(value: EventType | null) {
    if (!value) return;
    setActivePage(1);
    setHistoryPage(1);
    setEventType(value);
    setSelectedEventId('');
    const firstFaction = FACTIONS_BY_EVENT[value]
      .find((candidate) => canAccessFaction(currentUser, value, candidate));
    if (firstFaction) setSelectedFaction(firstFaction);
  }

  function openCreate(faction?: string) {
    setSelectedFaction(faction ?? visibleFactions[0]);
    setDialogOpen(true);
  }

  function statusLabel(status: FactionOrderStatus) {
    const labels: Record<FactionOrderStatus, string> = {
      draft: t('Entwurf', 'Draft'),
      submitted: t('Bereit zur Bearbeitung', 'Ready for processing'),
      preparing: t('In Vorbereitung', 'Preparing'),
      ready: t('Abholbereit', 'Ready'),
      picked_up: t('Abgeholt', 'Picked up'),
      partially_returned: t('Teilweise zurück', 'Partially returned'),
      returned: t('Zurückgegeben', 'Returned'),
      closed: t('Abgeschlossen', 'Closed'),
      cancelled: t('Storniert', 'Cancelled'),
    };
    return labels[status];
  }

  function progress(order: FactionOrder) {
    const requested = Object.values(order.requestedQuantities).reduce((sum, value) => sum + value, 0);
    const prepared = Object.values(order.preparedQuantities ?? {}).reduce((sum, value) => sum + value, 0);
    const requestedAssemblies = Object.values(order.requestedAssemblyQuantities ?? {}).reduce((sum, value) => sum + value, 0);
    const preparedAssemblies = Object.values(order.preparedAssemblyQuantities ?? {}).reduce((sum, value) => sum + value, 0);
    return { requested: requested + requestedAssemblies, prepared: prepared + preparedAssemblies };
  }

  function pickupLabel(order: FactionOrder) {
    const location = order.expand?.pickupLocation
      ?? storageLocations.find((candidate) => candidate.id === order.pickupLocation);
    const point = order.pickupLatitude != null && order.pickupLongitude != null
      ? `${order.pickupLatitude.toFixed(5)}, ${order.pickupLongitude.toFixed(5)}`
      : undefined;
    return location
      ? [...[location.name, location.area, location.location, location.position].filter(Boolean), point].filter(Boolean).join(' · ')
      : point ?? '—';
  }

  function orderEntry(order: FactionOrder, history = false): OrderListEntry {
    const totals = progress(order);
    const date = new Date(order.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US');
    return {
      id: order.id,
      title: history ? `${order.faction} · ${order.orderCode}` : order.orderCode,
      subtitle: `${date} · ${totals.prepared}/${totals.requested} ${['picked_up', 'partially_returned', 'returned'].includes(order.status) ? t('verwendet', 'used') : t('vorbereitet', 'prepared')}`,
      details: <>
        {order.requestedPickupDate && <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
          {t('Gewünschte Abholung', 'Requested pickup')}: {new Date(order.requestedPickupDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}
        </Typography>}
        <Typography variant="caption" color={order.status === 'ready' ? 'success.main' : 'text.secondary'} sx={{ display: 'block' }}>
          {t('Abholort', 'Pickup location')}: {pickupLabel(order)}
        </Typography>
      </>,
      status: statusLabel(order.status),
      statusColor: statusColor(order.status),
      onOpen: () => navigate(`/orders/faction/${order.id}`),
    };
  }

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4">{t('Fraktions-Bestelllisten', 'Faction order lists')}</Typography>
          <Typography color="text.secondary">
            {t(
              'Bedarf planen, Vorbereitung verfolgen und komplette Listen per QR-Code ausgeben und zurücknehmen.',
              'Plan requirements, track preparation, and check complete lists out and back in by QR code.',
            )}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => openCreate()} disabled={!visibleFactions.length} sx={{ alignSelf: { sm: 'flex-start' } }}>
          {t('Neue Liste', 'New list')}
        </Button>
      </Stack>

      {selectableEvents.length > 1 && <ToggleButtonGroup
        exclusive
        value={eventType}
        onChange={(_event, value: EventType | null) => selectEvent(value)}
        sx={{ mb: 3, flexWrap: 'wrap' }}
      >
        {selectableEvents.map((type) => <ToggleButton key={type} value={type}>{type === 'LS' ? 'LightSim' : type}</ToggleButton>)}
      </ToggleButtonGroup>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3, alignItems: { xs: 'stretch', md: 'center' } }}>
        <FormControl sx={{ minWidth: { xs: '100%', sm: 280 }, maxWidth: { md: 360 } }}>
          <InputLabel>{t('Jährliches Event', 'Yearly event')}</InputLabel>
          <Select value={selectedEventId} label={t('Jährliches Event', 'Yearly event')} onChange={(event) => { setSelectedEventId(event.target.value); setActivePage(1); setHistoryPage(1); }}>
            <MenuItem value="">{t('Alle Jahre', 'All years')}</MenuItem>
            {events.filter((entry) => entry.eventType === eventType).map((entry) => <MenuItem key={entry.id} value={entry.id}>{entry.name} · {entry.startDate}{entry.endDate !== entry.startDate ? ` – ${entry.endDate}` : ''}</MenuItem>)}
          </Select>
        </FormControl>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, overflowX: { md: 'auto' } }}>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            {t('Bestellstatus der Fraktionen', 'Faction order status')}
          </Typography>
          {isLoading || (!isComplete && !isError) ? <CircularProgress size={20} aria-label={t('Bestellstatus wird geladen', 'Loading order status')} /> : !isError && (
            <Stack direction="row" sx={{ flexWrap: { xs: 'wrap', md: 'nowrap' }, gap: 1 }}>
              {factionOverview.map(({ faction, state }) => {
                const label = state === 'finished' ? t('Fertig', 'Finished')
                  : state === 'draft' ? t('Entwurf', 'Draft') : t('Keine Bestellung', 'No order');
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
        {!isManager && <Box sx={{ alignSelf: { xs: 'flex-end', md: 'center' }, ml: { md: 'auto' } }}><FactionAccessNotice /></Box>}
      </Stack>

      {isError && <Alert severity="error" sx={{ mb: 2 }}>{t('Bestelllisten konnten nicht geladen werden.', 'Order lists could not be loaded.')}</Alert>}

      <OrderListSection
        title={t('Aktive Bestellungen', 'Active orders')}
        emptyMessage={t('Für dieses Event gibt es keine aktiven Bestellungen.', 'There are no active orders for this event.')}
        groups={activeOrderGroups.map(({ faction, orders: factionOrders }) => ({
          label: faction,
          entries: factionOrders.map((order) => orderEntry(order)),
        }))}
        count={activeOrderCount}
        isLoading={isLoading}
        page={currentActivePage}
        pageSize={activePageSize}
        onPageChange={setActivePage}
        onPageSizeChange={onActivePageSizeChange}
        loadingMore={!isError && (hasNextPage || isFetchingNextPage)}
        loadError={isError}
        onRetry={() => { void refetch(); }}
      />
      <OrderListSection
        title={t('Bestellverlauf', 'Order history')}
        emptyMessage={t('Für dieses Event gibt es noch keinen abgeschlossenen Verlauf.', 'There is no completed order history for this event yet.')}
        groups={[{ entries: pageHistoryOrders.map((order) => orderEntry(order, true)) }]}
        count={historyOrders.length}
        isLoading={isLoading}
        page={currentHistoryPage}
        pageSize={historyPageSize}
        onPageChange={setHistoryPage}
        onPageSizeChange={onHistoryPageSizeChange}
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullScreen={isMobile} fullWidth maxWidth="lg"
        slotProps={{ transition: { onEntered: () => setDialogReady(true), onExit: () => setDialogReady(false) } }}>
        <DialogTitle sx={{ pr: 7 }}>
          {t('Neue Fraktions-Bestellliste', 'New faction order list')}
        </DialogTitle>
        <DialogContent dividers>
          {dialogReady && <FactionOrderForm
            items={items}
            assemblies={assemblies}
            storageLocations={storageLocations}
            orders={allOrders}
            defaultEventType={eventType}
            defaultEventOccurrenceId={selectedEventId}
            defaultFaction={selectedFaction}
            allowedFactionKeys={allowedKeys ?? undefined}
            isLoading={createOrder.isPending}
            onSubmit={(data) => createOrder.mutate(data, {
              onSuccess: (order) => {
                setDialogOpen(false);
                showSnackbar(t('Bestellliste erstellt', 'Order list created'), 'success');
                navigate(`/orders/faction/${order.id}`);
              },
              onError: (error) => {
                if (isOfflineQueuedError(error)) {
                  setDialogOpen(false);
                  return; // The global mutation handler confirms that the order was queued.
                }
                showSnackbar(error instanceof Error ? error.message : t('Liste konnte nicht erstellt werden', 'Could not create list'), 'error');
              },
            })}
          />}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
