import { Dialog } from '../components/shared/ClosableDialog';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  DialogContent,
  DialogTitle,
  Select,
  Stack,
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
  const [activePage, setActivePage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [activePageSize, setActivePageSize] = useState(20);
  const [historyPageSize, setHistoryPageSize] = useState(20);
  const activeSize = activePageSize === -1 ? Number.MAX_SAFE_INTEGER : activePageSize;
  const historySize = historyPageSize === -1 ? Number.MAX_SAFE_INTEGER : historyPageSize;
  const { user } = useAuth();
  const currentUser = user;
  const isManager = canManageInventory(currentUser);
  const allowedKeys = useMemo(() => allowedFactionKeys(currentUser), [currentUser]);
  const selectableEvents = EVENT_TYPES.filter((type) => FACTIONS_BY_EVENT[type]
    .some((faction) => canAccessFaction(currentUser, type, faction)));
  const visibleFactions = FACTIONS_BY_EVENT[eventType]
    .filter((faction) => canAccessFaction(currentUser, eventType, faction));
  const { data: items = [] } = useItems();
  const { data: assemblies = [] } = useAssemblies();
  const { data: events = [] } = useEventReports();
  const { data: storageLocations = [] } = useStorageLocations();
  const { data: allOrders = [], isLoading, isError, hasNextPage, isFetchingNextPage, refetch } = useFactionOrders();
  const createOrder = useCreateFactionOrder();
  const orders = useMemo(
    () => allOrders.filter((order) => order.eventType === eventType
      && (!selectedEventId || order.eventOccurrenceId === selectedEventId)
      && canAccessFaction(currentUser, order.eventType, order.faction)),
    [allOrders, currentUser, eventType, selectedEventId],
  );

  const activeOrders = useMemo(() => orders.filter((order) => !isHistoricalOrder(order)), [orders]);
  const currentActivePage = Math.min(activePage, Math.max(1, Math.ceil(activeOrders.length / activeSize)));
  const pageActiveOrders = activeOrders.slice((currentActivePage - 1) * activeSize, currentActivePage * activeSize);
  const activeOrderGroups = useMemo(() => [...new Set(pageActiveOrders
    .map((order) => order.faction))]
    .map((faction) => ({
      faction,
      orders: pageActiveOrders.filter((order) => order.faction === faction),
    })), [pageActiveOrders]);
  const activeOrderCount = activeOrders.length;
  const historyOrders = useMemo(() => orders.filter(isHistoricalOrder), [orders]);
  const currentHistoryPage = Math.min(historyPage, Math.max(1, Math.ceil(historyOrders.length / historySize)));
  const pageHistoryOrders = historyOrders.slice((currentHistoryPage - 1) * historySize, currentHistoryPage * historySize);

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

      {!isManager && <Box sx={{ mb: 2 }}><FactionAccessNotice /></Box>}

      <ToggleButtonGroup
        exclusive
        value={eventType}
        onChange={(_event, value: EventType | null) => selectEvent(value)}
        sx={{ mb: 3, flexWrap: 'wrap' }}
      >
        {selectableEvents.map((type) => <ToggleButton key={type} value={type}>{type === 'LS' ? 'LightSim' : type}</ToggleButton>)}
      </ToggleButtonGroup>

      <FormControl sx={{ minWidth: 280, display: 'block', mb: 3 }}>
        <InputLabel>{t('Jährliches Event', 'Yearly event')}</InputLabel>
        <Select value={selectedEventId} label={t('Jährliches Event', 'Yearly event')} onChange={(event) => { setSelectedEventId(event.target.value); setActivePage(1); setHistoryPage(1); }} sx={{ minWidth: 280 }}>
          <MenuItem value="">{t('Alle Jahre', 'All years')}</MenuItem>
          {events.filter((entry) => entry.eventType === eventType).map((entry) => <MenuItem key={entry.id} value={entry.id}>{entry.name} · {entry.startDate}{entry.endDate !== entry.startDate ? ` – ${entry.endDate}` : ''}</MenuItem>)}
        </Select>
      </FormControl>

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
        onPageSizeChange={(size) => { setActivePageSize(size); setActivePage(1); }}
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
        onPageSizeChange={(size) => { setHistoryPageSize(size); setHistoryPage(1); }}
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullScreen={isMobile} fullWidth maxWidth="lg">
        <DialogTitle sx={{ pr: 7 }}>
          {t('Neue Fraktions-Bestellliste', 'New faction order list')}
        </DialogTitle>
        <DialogContent dividers>
          <FactionOrderForm
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
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
