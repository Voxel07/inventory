import { Dialog } from '../shared/ClosableDialog';
import { useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, InputAdornment, ListSubheader, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { useCreateOrder, useOrders, useReturnOrder, useTransitionOrder, useUpdateOrder } from '../../hooks/useOrders';
import { useEventReports } from '../../hooks/useEvents';
import { getItemAssets } from '../../services/inventoryService';
import { useItems } from '../../hooks/useItems';
import { EVENT_TYPES, type AssetInstance, type GeneralOrder, type Item } from '../../types';
import { useAppLanguage, useLocalizedText } from '../../utils/naming';
import { useUIStore } from '../../store/uiStore';
import { Link as RouterLink } from 'react-router-dom';
import { OrderListSection, type OrderListEntry } from './OrderListSection';
import { OrderCatalogPager, ORDER_CATALOG_PAGE_SIZE } from './OrderCatalogPager';
import { QuantityInput } from './QuantityInput';

const statusLabels: Record<GeneralOrder['status'], [string, string]> = {
  draft: ['Entwurf', 'Draft'], submitted: ['Eingereicht', 'Submitted'], ready: ['Bereit', 'Ready'],
  picked_up: ['Abgeholt', 'Picked up'], partially_returned: ['Teilrückgabe', 'Partially returned'],
  returned: ['Zurückgegeben', 'Returned'], closed: ['Abgeschlossen', 'Closed'], cancelled: ['Storniert', 'Cancelled'],
};

export function GeneralOrders() {
  const t = useLocalizedText();
  const language = useAppLanguage();
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const { data: orders = [], isLoading, isError, hasNextPage, isFetchingNextPage, refetch } = useOrders();
  const { data: events = [] } = useEventReports();
  const { data: items = [] } = useItems();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const transitionOrder = useTransitionOrder();
  const returnOrder = useReturnOrder();
  const [editing, setEditing] = useState<GeneralOrder | null | 'new'>(null);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [eventId, setEventId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [itemSearch, setItemSearch] = useState('');
  const [itemPage, setItemPage] = useState(1);
  const [catalogReady, setCatalogReady] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(20);
  const [pickup, setPickup] = useState<GeneralOrder | null>(null);
  const [assets, setAssets] = useState<Record<string, AssetInstance[]>>({});
  const [selectedAssets, setSelectedAssets] = useState<Record<string, string[]>>({});
  const [returning, setReturning] = useState<GeneralOrder | null>(null);
  const [returnInputs, setReturnInputs] = useState<Record<string, string>>({});
  const [consumedInputs, setConsumedInputs] = useState<Record<string, string>>({});

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const sortedItems = useMemo(() => catalogReady ? [...items].sort((a, b) => a.name.localeCompare(b.name)) : [], [catalogReady, items]);
  const eventMap = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const activeEvents = events;
  const visibleOrders = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return !term ? orders : orders.filter((order) => `${order.name} ${order.purpose}`.toLocaleLowerCase().includes(term));
  }, [orders, search]);
  const activeOrders = visibleOrders.filter((order) => !['returned', 'closed', 'cancelled'].includes(order.status));
  const historyOrders = visibleOrders.filter((order) => ['returned', 'closed', 'cancelled'].includes(order.status));
  const activeSize = pageSize === -1 ? Number.MAX_SAFE_INTEGER : pageSize;
  const historySize = historyPageSize === -1 ? Number.MAX_SAFE_INTEGER : historyPageSize;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(activeOrders.length / activeSize)));
  const currentHistoryPage = Math.min(historyPage, Math.max(1, Math.ceil(historyOrders.length / historySize)));
  const pageOrders = activeOrders.slice((currentPage - 1) * activeSize, currentPage * activeSize);
  const pageHistoryOrders = historyOrders.slice((currentHistoryPage - 1) * historySize, currentHistoryPage * historySize);
  const visibleItems = useMemo(() => {
    const term = itemSearch.trim().toLocaleLowerCase();
    return sortedItems.filter((item) => !term || `${item.name} ${item.sku ?? ''} ${item.category}`.toLocaleLowerCase().includes(term));
  }, [sortedItems, itemSearch]);
  const selectedEvent = eventMap.get(eventId);
  const catalogItems = useMemo(() => visibleItems.filter((item) => itemSearch.trim() || !selectedEvent || !item.eventTypes?.length || item.eventTypes.includes(selectedEvent.eventType) || Number(quantities[item.id]) > 0), [visibleItems, itemSearch, selectedEvent, quantities]);
  const currentItemPage = Math.min(itemPage, Math.max(1, Math.ceil(catalogItems.length / ORDER_CATALOG_PAGE_SIZE)));
  const pageItems = catalogItems.slice((currentItemPage - 1) * ORDER_CATALOG_PAGE_SIZE, currentItemPage * ORDER_CATALOG_PAGE_SIZE);

  function itemName(id: string) { return itemMap.get(id)?.name ?? id; }
  function eventName(id?: string) {
    const event = id ? eventMap.get(id) : undefined;
    return event ? `${event.name || event.eventType} · ${new Date(event.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}` : t('Kein Event', 'No event');
  }
  function errorMessage(error: unknown) { return error instanceof Error ? error.message : t('Aktion fehlgeschlagen', 'Action failed'); }
  function startEditing(order?: GeneralOrder) {
    setEditing(order ?? 'new');
    setName(order?.name ?? '');
    setPurpose(order?.purpose ?? '');
    setEventId(order?.eventOccurrenceId ?? activeEvents[0]?.id ?? '');
    setQuantities(Object.fromEntries(Object.entries(order?.requestedQuantities ?? {}).map(([id, quantity]) => [id, String(quantity)])));
    setItemSearch('');
    setItemPage(1);
    setCatalogReady(false);
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const requestedQuantities = Object.fromEntries(Object.entries(quantities)
      .map(([id, raw]) => [id, Math.max(0, Math.floor(Number(raw) || 0))] as const).filter(([, quantity]) => quantity > 0));
    const data = { name: name.trim(), purpose: purpose.trim(), eventOccurrenceId: eventId || undefined, requestedQuantities };
    const callbacks = {
      onSuccess: () => { setEditing(null); showSnackbar(t('Bestellung gespeichert', 'Order saved'), 'success'); },
      onError: (error: unknown) => showSnackbar(errorMessage(error), 'error'),
    };
    if (editing === 'new') createOrder.mutate(data, callbacks);
    else if (editing) updateOrder.mutate({ id: editing.id, data }, callbacks);
  }
  function advance(order: GeneralOrder, action: 'submit' | 'ready' | 'pickup' | 'close' | 'cancel', assetAssignments?: Record<string, string[]>) {
    transitionOrder.mutate({ id: order.id, action, assetAssignments }, {
      onSuccess: () => { setPickup(null); showSnackbar(t('Bestellung aktualisiert', 'Order updated'), 'success'); },
      onError: (error) => showSnackbar(errorMessage(error), 'error'),
    });
  }
  async function openPickup(order: GeneralOrder) {
    try {
      const serialized = Object.keys(order.requestedQuantities ?? {}).filter((id) => itemMap.get(id)?.trackingMode === 'serialized');
      const rows = await Promise.all(serialized.map(async (id) => [id, await getItemAssets(id)] as const));
      setAssets(Object.fromEntries(rows));
      setSelectedAssets({});
      setPickup(order);
    } catch (error) { showSnackbar(errorMessage(error), 'error'); }
  }
  function submitReturn() {
    if (!returning) return;
    const parse = (input: Record<string, string>) => Object.fromEntries(Object.entries(input)
      .map(([id, raw]) => [id, Math.floor(Number(raw) || 0)] as const).filter(([, quantity]) => quantity > 0));
    returnOrder.mutate({ id: returning.id, returnedQuantities: parse(returnInputs), consumedQuantities: parse(consumedInputs) }, {
      onSuccess: () => { setReturning(null); showSnackbar(t('Rückgabe erfasst', 'Return recorded'), 'success'); },
      onError: (error) => showSnackbar(errorMessage(error), 'error'),
    });
  }
  const editItem = (item: Item) => (
    <Paper key={item.id} variant="outlined" sx={{ p: 1, borderColor: Number(quantities[item.id]) > 0 ? 'primary.main' : 'divider' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography>
          <Typography variant="caption" color="text.secondary">{item.category} · {t('Verfügbar', 'Available')}: {item.stock?.available ?? item.amount ?? 0}</Typography>
        </Box>
        <QuantityInput label={`${item.name} ${t('Menge', 'Quantity')}`} value={quantities[item.id] ?? ''}
          onChange={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))} />
      </Stack>
    </Paper>
  );

  function orderEntry(order: GeneralOrder): OrderListEntry {
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
      actions: ['closed', 'cancelled'].includes(order.status) ? undefined : <>
        {order.status === 'draft' && <><Button size="small" onClick={() => startEditing(order)}>{t('Bearbeiten', 'Edit')}</Button><Button size="small" variant="contained" onClick={() => advance(order, 'submit')}>{t('Einreichen', 'Submit')}</Button></>}
        {order.status === 'submitted' && <Button size="small" variant="contained" onClick={() => advance(order, 'ready')}>{t('Bereitstellen', 'Mark ready')}</Button>}
        {order.status === 'ready' && <Button size="small" variant="contained" onClick={() => void openPickup(order)}>{t('Ausgeben', 'Pick up')}</Button>}
        {['picked_up', 'partially_returned'].includes(order.status) && <Button size="small" variant="contained" onClick={() => { setReturning(order); setReturnInputs({}); setConsumedInputs({}); }}>{t('Rückgabe erfassen', 'Record return')}</Button>}
        {order.status === 'returned' && <Button size="small" onClick={() => advance(order, 'close')}>{t('Abschließen', 'Close')}</Button>}
        {['draft', 'submitted', 'ready'].includes(order.status) && <Button size="small" color="error" onClick={() => advance(order, 'cancel')}>{t('Stornieren', 'Cancel')}</Button>}
      </>,
    };
  }

  return <Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2, justifyContent: 'space-between' }}>
      <Box><Typography variant="h4">{t('Allgemeine Bestellungen', 'General orders')}</Typography>
        <Typography color="text.secondary">{t('Artikel für Catering, Sponsorenzelte, Bühnen und andere Zwecke.', 'Items for catering, sponsor tents, stages, and other purposes.')}</Typography></Box>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => startEditing()}>{t('Neue Bestellung', 'New order')}</Button>
    </Stack>
    <TextField fullWidth size="small" label={t('Bestellungen durchsuchen', 'Search orders')} value={search}
      onChange={(event) => { setSearch(event.target.value); setPage(1); setHistoryPage(1); }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
      sx={{ mb: 2, maxWidth: 520 }} />
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
      onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
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
      onPageSizeChange={(size) => { setHistoryPageSize(size); setHistoryPage(1); }}
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
          <TextField label={t('Artikel suchen', 'Search items')} value={itemSearch} onChange={(event) => { setItemSearch(event.target.value); setItemPage(1); }} />
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
                  <QuantityInput label={`${item.name} ${t('Menge', 'Quantity')}`} value={quantities[item.id] ?? ''}
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

    <Dialog open={Boolean(pickup)} onClose={() => setPickup(null)} fullWidth maxWidth="sm"><DialogTitle>{t('Artikel ausgeben', 'Pick up items')}</DialogTitle>
      <DialogContent dividers><Stack spacing={1}>
        {pickup && Object.entries(pickup.requestedQuantities ?? {}).map(([id, quantity]) => <Box key={id}>
          <Typography sx={{ fontWeight: 600 }}>{itemName(id)}: {quantity}</Typography>
          {itemMap.get(id)?.trackingMode === 'serialized' && (assets[id] ?? []).filter((asset) => asset.availabilityStatus === 'available').map((asset) => <FormControlLabel key={asset.id}
            control={<Checkbox checked={(selectedAssets[id] ?? []).includes(asset.id)} onChange={(_event, checked) => setSelectedAssets((current) => ({ ...current, [id]: checked ? [...(current[id] ?? []), asset.id] : (current[id] ?? []).filter((value) => value !== asset.id) }))} />}
            label={asset.assetCode} />)}
        </Box>)}
      </Stack></DialogContent><DialogActions><Button onClick={() => setPickup(null)}>{t('Abbrechen', 'Cancel')}</Button>
        <Button variant="contained" disabled={transitionOrder.isPending || Boolean(pickup && Object.entries(pickup.requestedQuantities).some(([id, quantity]) => itemMap.get(id)?.trackingMode === 'serialized' && (selectedAssets[id] ?? []).length !== quantity))}
          onClick={() => pickup && advance(pickup, 'pickup', selectedAssets)}>{t('Ausgabe bestätigen', 'Confirm pickup')}</Button></DialogActions></Dialog>

    <Dialog open={Boolean(returning)} onClose={() => setReturning(null)} fullWidth maxWidth="sm"><DialogTitle>{t('Rückgabe erfassen', 'Record return')}</DialogTitle>
      <DialogContent dividers><Stack spacing={2}>
        {returning && Object.entries(returning.handedOverQuantities ?? {}).map(([id, quantity]) => {
          const outstanding = quantity - (returning.returnedQuantities?.[id] ?? 0) - (returning.consumedQuantities?.[id] ?? 0);
          if (outstanding <= 0) return null;
          return <Box key={id}><Typography sx={{ fontWeight: 600 }}>{itemName(id)} · {t('Offen', 'Outstanding')}: {outstanding}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <TextField type="number" label={t('Zurück', 'Returned')} value={returnInputs[id] ?? ''} onChange={(event) => setReturnInputs((current) => ({ ...current, [id]: event.target.value }))} slotProps={{ htmlInput: { min: 0, max: outstanding, step: 1 } }} />
              {itemMap.get(id)?.isConsumable && <TextField type="number" label={t('Verbraucht', 'Consumed')} value={consumedInputs[id] ?? ''} onChange={(event) => setConsumedInputs((current) => ({ ...current, [id]: event.target.value }))} slotProps={{ htmlInput: { min: 0, max: outstanding, step: 1 } }} />}
            </Stack>
          </Box>;
        })}
      </Stack></DialogContent><DialogActions><Button onClick={() => setReturning(null)}>{t('Abbrechen', 'Cancel')}</Button>
        <Button variant="contained" disabled={returnOrder.isPending || !Object.values({ ...returnInputs, ...consumedInputs }).some((value) => Number(value) > 0)} onClick={submitReturn}>{t('Speichern', 'Save')}</Button></DialogActions></Dialog>
  </Box>;
}
