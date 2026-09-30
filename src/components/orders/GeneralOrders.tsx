import { GeneralOrderWorkflow } from './GeneralOrderWorkflow';
import { useAuth } from '../../hooks/useAuth';
import { canOperateWarehouse, canPerformCustody, effectiveAccess } from '../../utils/access';
import { Dialog } from '../shared/ClosableDialog';
import { useState } from 'react';
import { Alert, Box, Button, DialogActions, DialogContent, DialogTitle, Divider,
  InputAdornment, ListSubheader, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { useCreateOrder, useOrders, useTransitionOrder, useUpdateOrder } from '../../hooks/useOrders';
import { useEventReports } from '../../hooks/useEvents';
import { useItems } from '../../hooks/useItems';
import { EVENT_TYPES, type GeneralOrderSummary, type Item } from '../../types';
import { useAppLanguage, useLocalizedText } from '../../utils/naming';
import { useMutationFeedback } from '../../hooks/useMutationFeedback';
import { Link as RouterLink } from 'react-router-dom';
import { OrderListSection, type OrderListEntry } from './OrderListSection';
import { OrderCatalogPager, ORDER_CATALOG_PAGE_SIZE } from './OrderCatalogPager';
import { QuantityControl } from './QuantityControl';
import { CatalogSearchField } from './CatalogSearchField';
import { catalogPage, filterCatalogItems } from '../../utils/orderCatalog';
import { toPositiveIntegerQuantities } from '../../utils/quantityMaps';
import { useClientPagination } from '../../hooks/useClientPagination';
import { useOrderEventSelection } from '../../hooks/useOrderEventSelection';

const statusLabels: Record<GeneralOrderSummary['status'], [string, string]> = {
  preparing: ['In Vorbereitung', 'Preparing'], draft: ['Entwurf', 'Draft'], submitted: ['Eingereicht', 'Submitted'], ready: ['Bereit', 'Ready'],
  picked_up: ['Abgeholt', 'Picked up'], partially_returned: ['Teilrückgabe', 'Partially returned'],
  returned: ['Zurückgegeben', 'Returned'], closed: ['Abgeschlossen', 'Closed'], cancelled: ['Storniert', 'Cancelled'],
};

export function GeneralOrders() {
  const t = useLocalizedText();
  const language = useAppLanguage();
  const feedback = useMutationFeedback();
  const { data: orders = [], isLoading, isError, hasNextPage, isFetchingNextPage, refetch } = useOrders();
  const { data: events = [] } = useEventReports();
  const { currentEvent, selectedEventId, setSelectedEventId } = useOrderEventSelection(events);
  const { data: items = [] } = useItems();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const transitionOrder = useTransitionOrder();
  const { user } = useAuth();
  const [workflow, setWorkflow] = useState<{order: GeneralOrderSummary; action: 'prepare' | 'pickup' | 'return' | 'history'} | null>(null);
  const [editing, setEditing] = useState<GeneralOrderSummary | null | 'new'>(null);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [eventId, setEventId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [itemSearch, setItemSearch] = useState('');
  const [itemPage, setItemPage] = useState(1);
  const [catalogReady, setCatalogReady] = useState(false);
  const [search, setSearch] = useState('');

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const sortedItems = catalogReady ? [...items].sort((a, b) => a.name.localeCompare(b.name)) : [];
  const eventMap = new Map(events.map((event) => [event.id, event]));
  const activeEvents = events;
  const visibleOrders = (() => {
    const term = search.trim().toLocaleLowerCase();
    return orders.filter((order) => (!selectedEventId || order.eventOccurrenceId === selectedEventId)
      && (!term || `${order.name} ${order.purpose}`.toLocaleLowerCase().includes(term)));
  })();
  const activeOrders = visibleOrders.filter((order) => !['returned', 'closed', 'cancelled'].includes(order.status));
  const historyOrders = visibleOrders.filter((order) => ['returned', 'closed', 'cancelled'].includes(order.status));
  const { pageItems: pageOrders, page: currentPage, setPage, pageSize, onPageSizeChange } = useClientPagination(activeOrders);
  const { pageItems: pageHistoryOrders, page: currentHistoryPage, setPage: setHistoryPage, pageSize: historyPageSize, onPageSizeChange: onHistoryPageSizeChange } = useClientPagination(historyOrders);
  const selectedEvent = eventMap.get(eventId);
  const catalogItems = filterCatalogItems(sortedItems, itemSearch, '', (item) => !selectedEvent
    || !item.eventTypes?.length || item.eventTypes.includes(selectedEvent.eventType) || Number(quantities[item.id]) > 0);
  const { page: currentItemPage, entries: pageItems } = catalogPage(catalogItems, itemPage, ORDER_CATALOG_PAGE_SIZE);

  function itemName(id: string) { return itemMap.get(id)?.name ?? id; }
  function eventName(id?: string) {
    const event = id ? eventMap.get(id) : undefined;
    return event ? `${event.name || event.eventType} · ${new Date(event.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}` : t('Kein Event', 'No event');
  }
  function startEditing(order?: GeneralOrderSummary) {
    setEditing(order ?? 'new');
    setName(order?.name ?? '');
    setPurpose(order?.purpose ?? '');
    setEventId(order ? order.eventOccurrenceId ?? '' : selectedEventId || currentEvent?.id || '');
    setQuantities(Object.fromEntries(Object.entries(order?.requestedQuantities ?? {}).map(([id, quantity]) => [id, String(quantity)])));
    setItemSearch('');
    setItemPage(1);
    setCatalogReady(false);
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const requestedQuantities = toPositiveIntegerQuantities(quantities);
    const data = { name: name.trim(), purpose: purpose.trim(), eventOccurrenceId: eventId || undefined, requestedQuantities };
    const callbacks = feedback.callbacks(t('Bestellung gespeichert', 'Order saved'), () => setEditing(null));
    if (editing === 'new') createOrder.mutate(data, callbacks);
    else if (editing) updateOrder.mutate({ id: editing.id, data }, callbacks);
  }
  function advance(order: GeneralOrderSummary, action: 'submit' | 'ready' | 'pickup' | 'close' | 'cancel', assetAssignments?: Record<string, string[]>) {
    transitionOrder.mutate({ id: order.id, action, assetAssignments }, feedback.callbacks(t('Bestellung aktualisiert', 'Order updated')));
  }
  const editItem = (item: Item) => (
    <Paper key={item.id} variant="outlined" sx={{ p: 1, borderColor: Number(quantities[item.id]) > 0 ? 'primary.main' : 'divider' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography>
          <Typography variant="caption" color="text.secondary">{item.category} · {t('Verfügbar', 'Available')}: {item.stock?.available ?? item.amount ?? 0}</Typography>
        </Box>
        <QuantityControl label={`${item.name} ${t('Menge', 'Quantity')}`} value={quantities[item.id] ?? ''}
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
        {t('Artikel', 'Items')}: {itemCount} · {Object.entries(order.requestedQuantities ?? {}).map(([id, quantity]) => `${order.itemNames?.[id] ?? itemName(id)} × ${quantity}`).join(', ')}
      </Typography>,
      status: t(...statusLabels[order.status ?? 'draft']),
      statusColor,
      actions: <>
        <Button onClick={() => setWorkflow({ order, action: 'history' })}>{t('Verlauf', 'History')}</Button>
        {order.status === 'draft' && effectiveAccess(user) !== 'read_only' && (order.createdBy === user?.id || ['hq_admin', 'warehouse_crew', 'event_planner'].includes(effectiveAccess(user))) && <><Button size="small" onClick={() => startEditing(order)}>{t('Bearbeiten', 'Edit')}</Button><Button size="small" variant="contained" onClick={() => advance(order, 'submit')}>{t('Einreichen', 'Submit')}</Button></>}
        {['submitted', 'preparing'].includes(order.status) && canOperateWarehouse(user) && <Button onClick={() => setWorkflow({ order, action: 'prepare' })}>{t('Vorbereiten', 'Prepare')}</Button>}
        {order.status === 'preparing' && canOperateWarehouse(user) && <Button onClick={() => advance(order, 'ready')}>{t('Bereitstellen', 'Mark ready')}</Button>}
        {order.status === 'ready' && canPerformCustody(user) && <Button size="small" variant="contained" onClick={() => setWorkflow({ order, action: 'pickup' })}>{t('Ausgeben', 'Pick up')}</Button>}
        {['picked_up', 'partially_returned'].includes(order.status) && canPerformCustody(user) && <Button size="small" variant="contained" onClick={() => setWorkflow({ order, action: 'return' })}>{t('Rückgabe erfassen', 'Record return')}</Button>}
        {order.status === 'returned' && canPerformCustody(user) && <Button size="small" onClick={() => advance(order, 'close')}>{t('Abschließen', 'Close')}</Button>}
        {['draft', 'submitted', 'preparing', 'ready'].includes(order.status) && effectiveAccess(user) !== 'read_only' && (order.createdBy === user?.id || ['hq_admin', 'warehouse_crew', 'event_planner'].includes(effectiveAccess(user))) && <Button size="small" color="error" onClick={() => advance(order, 'cancel')}>{t('Stornieren', 'Cancel')}</Button>}
      </>,
    };
  }

  return <Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2, justifyContent: 'space-between' }}>
      <Box><Typography variant="h4">{t('Allgemeine Bestellungen', 'General orders')}</Typography>
        <Typography color="text.secondary">{t('Artikel für Catering, Sponsorenzelte, Bühnen und andere Zwecke.', 'Items for catering, sponsor tents, stages, and other purposes.')}</Typography></Box>
      <Button disabled={effectiveAccess(user) === 'read_only'} variant="contained" startIcon={<AddIcon />} onClick={() => startEditing()}>{t('Neue Bestellung', 'New order')}</Button>
    </Stack>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
      <TextField select size="small" label={t('Event auswählen', 'Select event')} value={selectedEventId}
        onChange={(event) => { setSelectedEventId(event.target.value); setPage(1); setHistoryPage(1); }} sx={{ minWidth: { sm: 280 } }}>
        <MenuItem value="">{t('Alle Events', 'All events')}</MenuItem>
        {events.map((event) => <MenuItem key={event.id} value={event.id}>{eventName(event.id)}</MenuItem>)}
      </TextField>
      <TextField fullWidth size="small" label={t('Bestellungen durchsuchen', 'Search orders')} value={search}
        onChange={(event) => { setSearch(event.target.value); setPage(1); setHistoryPage(1); }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
        sx={{ maxWidth: 520 }} />
    </Stack>
    {isError && <Alert severity="error" sx={{ mb: 2 }}>{t('Bestellungen konnten nicht geladen werden.', 'Orders could not be loaded.')}</Alert>}
    <OrderListSection
      title={t('Aktive Bestellungen', 'Active orders')}
      emptyMessage={t('Noch keine passenden aktiven Bestellungen vorhanden.', 'No matching active orders yet.')}
      groups={[{ entries: pageOrders.map(orderEntry) }]}
      count={activeOrders.length}
      isLoading={isLoading}
      page={currentPage}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={onPageSizeChange}
      loadingMore={!isError && (hasNextPage || isFetchingNextPage)}
      loadError={isError}
      onRetry={() => { void refetch(); }}
    />
    <OrderListSection
      title={t('Bestellverlauf', 'Order history')}
      emptyMessage={t('Noch kein abgeschlossener Bestellverlauf vorhanden.', 'No completed order history yet.')}
      groups={[{ entries: pageHistoryOrders.map(orderEntry) }]}
      count={historyOrders.length}
      isLoading={isLoading}
      page={currentHistoryPage}
      pageSize={historyPageSize}
      onPageChange={setHistoryPage}
      onPageSizeChange={onHistoryPageSizeChange}
    />

    <Dialog open={editing !== null} onClose={() => setEditing(null)} fullWidth maxWidth="lg"
      slotProps={{ transition: { onEntered: () => setCatalogReady(true), onExit: () => setCatalogReady(false) } }}>
      <Box component="form" onSubmit={submit}><DialogTitle>{editing === 'new' ? t('Neue Bestellung', 'New order') : t('Bestellung bearbeiten', 'Edit order')}</DialogTitle>
        <DialogContent dividers><Stack spacing={2}>
          <TextField autoFocus required label={t('Name', 'Name')} value={name} onChange={(event) => setName(event.target.value)} slotProps={{ htmlInput: { maxLength: 160 } }} />
          <TextField required multiline minRows={2} label={t('Zweck', 'Purpose')} value={purpose} onChange={(event) => setPurpose(event.target.value)} slotProps={{ htmlInput: { maxLength: 4000 } }} />
          <TextField select label={t('Aktuelles Event', 'Current event')} value={eventId} onChange={(event) => { setEventId(event.target.value); setItemPage(1); }}>
            <MenuItem value="">{t('Event wählen', 'Select event')}</MenuItem>
            {EVENT_TYPES.flatMap((type) => {
              const occurrences = activeEvents.filter((event) => event.eventType === type);
              return occurrences.length ? [
                <ListSubheader key={`${type}-heading`}>{type === 'LS' ? 'LightSim' : type}</ListSubheader>,
                ...occurrences.map((event) => <MenuItem key={event.id} value={event.id}>{event.name} · {event.startDate}{event.endDate !== event.startDate ? ` – ${event.endDate}` : ''}</MenuItem>),
              ] : [];
            })}
          </TextField>
          {!activeEvents.length && <Alert severity="info" action={<Button component={RouterLink} to="/events" onClick={() => setEditing(null)}>{t('Events öffnen', 'Open events')}</Button>}>{t('Legen Sie zuerst ein Event an.', 'Create an event first.')}</Alert>}
          <Divider />
          <Typography variant="h6">{t('Benötigte Artikel', 'Requested items')}</Typography>
          <CatalogSearchField label={t('Artikel suchen', 'Search items')} value={itemSearch} onChange={(value) => { setItemSearch(value); setItemPage(1); }} />
          {catalogReady && <>
            <Box key={currentItemPage} sx={{ maxHeight: 360, overflowY: 'auto' }}><Stack spacing={0.5}>{pageItems.map(editItem)}</Stack></Box>
            <OrderCatalogPager count={catalogItems.length} page={currentItemPage} onPageChange={setItemPage} />
          </>}
          {catalogReady && Object.values(quantities).some((value) => Number(value) > 0) && <Box>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>{t('Aktuelle Bestellung', 'Current order')}</Typography>
            <Stack spacing={0.5}>
              {items.filter((item) => Number(quantities[item.id]) > 0).map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography sx={{ flex: 1, fontWeight: 700 }}>{item.name}</Typography>
                  <QuantityControl label={`${item.name} ${t('Menge', 'Quantity')}`} value={quantities[item.id] ?? ''}
                    onChange={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))} />
                  <Button size="small" color="error" onClick={() => setQuantities((current) => ({ ...current, [item.id]: '' }))}>{t('Entfernen', 'Remove')}</Button>
                </Stack>
              </Paper>)}
            </Stack>
          </Box>}
        </Stack></DialogContent><DialogActions><Button onClick={() => setEditing(null)}>{t('Abbrechen', 'Cancel')}</Button>
          <Button type="submit" variant="contained" disabled={createOrder.isPending || updateOrder.isPending || !name.trim() || !purpose.trim() || !eventId || !Object.values(quantities).some((value) => Number(value) > 0)}>{t('Speichern', 'Save')}</Button></DialogActions>
      </Box>
    </Dialog>

    {workflow && <GeneralOrderWorkflow order={workflow.order} action={workflow.action} items={items} onClose={() => setWorkflow(null)} />}
  </Box>;
}
