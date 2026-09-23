import { useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, InputAdornment, LinearProgress, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { useCreateOrder, useOrders, useReturnOrder, useTransitionOrder, useUpdateOrder } from '../../hooks/useOrders';
import { useEventReports } from '../../hooks/useEvents';
import { getItemAssets } from '../../services/inventoryService';
import { useItems } from '../../hooks/useItems';
import type { AssetInstance, GeneralOrder, Item } from '../../types';
import { useAppLanguage, useLocalizedText } from '../../utils/naming';
import { useUIStore } from '../../store/uiStore';
import { ListPagination } from '../shared/ListPagination';
import { LIST_PAGE_SIZE } from '../../hooks/useProgressiveList';

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
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pickup, setPickup] = useState<GeneralOrder | null>(null);
  const [assets, setAssets] = useState<Record<string, AssetInstance[]>>({});
  const [selectedAssets, setSelectedAssets] = useState<Record<string, string[]>>({});
  const [returning, setReturning] = useState<GeneralOrder | null>(null);
  const [returnInputs, setReturnInputs] = useState<Record<string, string>>({});
  const [consumedInputs, setConsumedInputs] = useState<Record<string, string>>({});

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const eventMap = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const activeEvents = useMemo(() => events.filter((event) => event.status === 'planned'), [events]);
  const visibleOrders = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return !term ? orders : orders.filter((order) => `${order.name} ${order.purpose}`.toLocaleLowerCase().includes(term));
  }, [orders, search]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visibleOrders.length / LIST_PAGE_SIZE)));
  const pageOrders = visibleOrders.slice((currentPage - 1) * LIST_PAGE_SIZE, currentPage * LIST_PAGE_SIZE);
  const visibleItems = useMemo(() => {
    const term = itemSearch.trim().toLocaleLowerCase();
    return [...items].filter((item) => !term || `${item.name} ${item.sku ?? ''} ${item.category}`.toLocaleLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, itemSearch]);

  function itemName(id: string) { return itemMap.get(id)?.name ?? id; }
  function eventName(id?: string) {
    const event = id ? eventMap.get(id) : undefined;
    return event ? `${event.eventType} · ${new Date(event.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}` : t('Kein Event', 'No event');
  }
  function errorMessage(error: unknown) { return error instanceof Error ? error.message : t('Aktion fehlgeschlagen', 'Action failed'); }
  function startEditing(order?: GeneralOrder) {
    setEditing(order ?? 'new');
    setName(order?.name ?? '');
    setPurpose(order?.purpose ?? '');
    setEventId(order?.eventOccurrenceId ?? activeEvents[0]?.id ?? '');
    setQuantities(Object.fromEntries(Object.entries(order?.requestedQuantities ?? {}).map(([id, quantity]) => [id, String(quantity)])));
    setItemSearch('');
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
  const selectedEvent = eventMap.get(eventId);
  const editItem = (item: Item) => (
    <Stack key={item.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography sx={{ flex: 1 }}>{item.name}</Typography>
      <Typography variant="caption" color="text.secondary">{t('Verfügbar', 'Available')}: {item.stock?.available ?? item.amount ?? 0}</Typography>
      <TextField type="number" size="small" label={t('Menge', 'Quantity')} value={quantities[item.id] ?? ''}
        onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))}
        slotProps={{ htmlInput: { min: 0, step: 1 } }} sx={{ width: 90 }} />
    </Stack>
  );

  return <Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2, justifyContent: 'space-between' }}>
      <Box><Typography variant="h4">{t('Allgemeine Bestellungen', 'General orders')}</Typography>
        <Typography color="text.secondary">{t('Artikel für Catering, Sponsorenzelte, Bühnen und andere Zwecke.', 'Items for catering, sponsor tents, stages, and other purposes.')}</Typography></Box>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => startEditing()}>{t('Neue Bestellung', 'New order')}</Button>
    </Stack>
    <TextField fullWidth size="small" label={t('Bestellungen durchsuchen', 'Search orders')} value={search}
      onChange={(event) => { setSearch(event.target.value); setPage(1); }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
      sx={{ mb: 2, maxWidth: 520 }} />
    {isLoading && <LinearProgress sx={{ mb: 2 }} />}
    {isError && <Alert severity="error" sx={{ mb: 2 }}>{t('Bestellungen konnten nicht geladen werden.', 'Orders could not be loaded.')}</Alert>}
    {!isLoading && !visibleOrders.length && <Paper sx={{ p: 3 }}><Typography color="text.secondary">{t('Noch keine passenden Bestellungen vorhanden.', 'No matching orders yet.')}</Typography></Paper>}
    <Stack spacing={1.5}>{pageOrders.map((order) => <Paper key={order.id} sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Box><Typography variant="h6">{order.name}</Typography><Typography>{order.purpose}</Typography>
          <Typography variant="body2" color="text.secondary">{eventName(order.eventOccurrenceId)}</Typography></Box>
        <Chip size="small" label={t(...statusLabels[order.status ?? 'draft'])} />
      </Stack>
      <Stack spacing={0.3} sx={{ mt: 1 }}>
        {Object.entries(order.requestedQuantities ?? {}).map(([id, quantity]) => <Typography key={id} variant="body2">
          {order.itemNames?.[id] ?? itemName(id)}: {quantity}{(order.handedOverQuantities?.[id] ?? 0) > 0 && ` · ${t('Ausgegeben', 'Picked up')}: ${order.handedOverQuantities[id]} · ${t('Zurück', 'Returned')}: ${order.returnedQuantities?.[id] ?? 0}`}
        </Typography>)}
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, flexWrap: 'wrap' }}>
        {order.status === 'draft' && <><Button size="small" onClick={() => startEditing(order)}>{t('Bearbeiten', 'Edit')}</Button><Button size="small" variant="contained" onClick={() => advance(order, 'submit')}>{t('Einreichen', 'Submit')}</Button></>}
        {order.status === 'submitted' && <Button size="small" variant="contained" onClick={() => advance(order, 'ready')}>{t('Bereitstellen', 'Mark ready')}</Button>}
        {order.status === 'ready' && <Button size="small" variant="contained" onClick={() => void openPickup(order)}>{t('Ausgeben', 'Pick up')}</Button>}
        {['picked_up', 'partially_returned'].includes(order.status) && <Button size="small" variant="contained" onClick={() => { setReturning(order); setReturnInputs({}); setConsumedInputs({}); }}>{t('Rückgabe erfassen', 'Record return')}</Button>}
        {order.status === 'returned' && <Button size="small" onClick={() => advance(order, 'close')}>{t('Abschließen', 'Close')}</Button>}
        {['draft', 'submitted', 'ready'].includes(order.status) && <Button size="small" color="error" onClick={() => advance(order, 'cancel')}>{t('Stornieren', 'Cancel')}</Button>}
      </Stack>
    </Paper>)}</Stack>
    <ListPagination count={visibleOrders.length} page={currentPage} onChange={setPage} loadingMore={!isError && (hasNextPage || isFetchingNextPage)} loadError={isError} onRetry={() => { void refetch(); }} />

    <Dialog open={editing !== null} onClose={() => setEditing(null)} fullWidth maxWidth="md">
      <Box component="form" onSubmit={submit}><DialogTitle>{editing === 'new' ? t('Neue Bestellung', 'New order') : t('Bestellung bearbeiten', 'Edit order')}</DialogTitle>
        <DialogContent dividers><Stack spacing={2}>
          <TextField autoFocus required label={t('Name', 'Name')} value={name} onChange={(event) => setName(event.target.value)} slotProps={{ htmlInput: { maxLength: 160 } }} />
          <TextField required multiline minRows={2} label={t('Zweck', 'Purpose')} value={purpose} onChange={(event) => setPurpose(event.target.value)} slotProps={{ htmlInput: { maxLength: 4000 } }} />
          <TextField select label={t('Aktuelles Event', 'Current event')} value={eventId} onChange={(event) => setEventId(event.target.value)}>
            <MenuItem value="">{t('Event wählen', 'Select event')}</MenuItem>
            {activeEvents.map((event) => <MenuItem key={event.id} value={event.id}>{event.eventType} · {new Date(event.eventDate).toLocaleDateString()}</MenuItem>)}
          </TextField>
          {!activeEvents.length && <Alert severity="info">{t('Legen Sie zuerst ein geplantes Event an.', 'Create a planned event first.')}</Alert>}
          <TextField label={t('Artikel suchen', 'Search items')} value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} />
          <Box sx={{ maxHeight: 350, overflowY: 'auto' }}><Stack spacing={1}>{visibleItems.filter((item) => itemSearch.trim() || !selectedEvent || !item.eventTypes?.length || item.eventTypes.includes(selectedEvent.eventType) || Number(quantities[item.id]) > 0).map(editItem)}</Stack></Box>
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
