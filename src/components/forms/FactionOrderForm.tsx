import { MediaImage } from '../common/MediaImage';
import { useEffect, useEffectEvent, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CategoryIcon from '@mui/icons-material/Category';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import SaveIcon from '@mui/icons-material/Save';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewListIcon from '@mui/icons-material/ViewList';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Dialog } from '../shared/ClosableDialog';
import { DialogContent, DialogTitle } from '@mui/material';
import type { Assembly, EventType, FactionOrder, FactionOrderFormData, Item, StorageLocation } from '../../types';
import { EVENT_TYPES, FACTIONS_BY_EVENT } from '../../types';
import { useLocalizedText } from '../../utils/naming';
import { useEventReports } from '../../hooks/useEvents';
import {
  factionOrderAssemblyBaseline,
  factionOrderItemBaseline,
  findPreviousFactionOrder,
} from '../../utils/factionOrderHistory';
import { useUIStore } from '../../store/uiStore';
import { useFactions } from '../../hooks/useFactionOrders';
import { getItemStock } from '../../utils/stock';
import { itemImageUrl } from '../../utils/itemImages';
import { assemblyAvailability } from '../../utils/factionOrderQuantities';
import { apiFileUrl } from '../../services/apiClient';
import { toPositiveIntegerQuantities } from '../../utils/quantityMaps';
import { OrderCatalogPager, ORDER_CATALOG_PAGE_SIZE } from '../orders/OrderCatalogPager';
import { QuantityInput } from '../orders/QuantityInput';

type ResourceViewMode = 'list' | 'tiles';

interface Props {
  items: Item[];
  assemblies: Assembly[];
  storageLocations: StorageLocation[];
  orders: FactionOrder[];
  initialData?: FactionOrder;
  defaultEventType?: EventType;
  defaultEventOccurrenceId?: string;
  defaultFaction?: string;
  submitLabel?: string;
  isLoading?: boolean;
  allowedFactionKeys?: string[];
  onSubmit: (data: FactionOrderFormData) => void;
}

export function FactionOrderForm({
  items,
  assemblies,
  orders,
  initialData,
  defaultEventType = 'DE',
  defaultEventOccurrenceId,
  defaultFaction,
  submitLabel,
  isLoading,
  allowedFactionKeys,
  onSubmit,
}: Props) {
  const t = useLocalizedText();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const setActiveEventType = useUIStore((state) => state.setActiveEventType);
  const { data: dynamicFactions } = useFactions();
  const { data: events = [] } = useEventReports();
  const factionsByEvent = (() => {
    const result: Record<EventType, readonly string[]> = { ...FACTIONS_BY_EVENT };
    if (dynamicFactions && dynamicFactions.length > 0) {
      for (const type of EVENT_TYPES) {
        const matching = dynamicFactions.filter((f) => f.eventType === type && f.active !== false).map((f) => f.name);
        const inactive = new Set(dynamicFactions.filter((f) => f.eventType === type && f.active === false).map((f) => f.name));
        result[type] = [...new Set([...(result[type] ?? []), ...matching])].filter((name) => !inactive.has(name));
      }
    }
    return result;
  })();

  const initialEventType = initialData?.eventType ?? defaultEventType;
  const allowedEvents = EVENT_TYPES.filter((type) => !allowedFactionKeys || (factionsByEvent[type] ?? []).some((candidate) => allowedFactionKeys.includes(`${type}:${candidate}`)));
  const allowedFactions = (type: EventType) => (factionsByEvent[type] ?? []).filter((candidate) => !allowedFactionKeys || allowedFactionKeys.includes(`${type}:${candidate}`));
  const [eventType, setEventType] = useState<EventType>(initialEventType);
  const [faction, setFaction] = useState(
    initialData?.faction ?? defaultFaction ?? allowedFactions(initialEventType)[0] ?? '',
  );
  const [eventOccurrenceId, setEventOccurrenceId] = useState(initialData?.eventOccurrenceId ?? defaultEventOccurrenceId ?? '');
  const eventOptions = events.filter((event) => event.eventType === eventType);
  const selectedEvent = eventOptions.find((event) => event.id === eventOccurrenceId) ?? eventOptions[0];
  const eventDate = selectedEvent?.startDate?.slice(0, 10) ?? selectedEvent?.eventDate?.slice(0, 10) ?? '';
  const [requestedPickupDate, setRequestedPickupDate] = useState(
    initialData?.requestedPickupDate?.slice(0, 10) ?? '',
  );
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initialData ? factionOrderItemBaseline(initialData) : {}).map(([id, value]) => [id, String(value)])),
  );
  const [assemblyQuantities, setAssemblyQuantities] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initialData ? factionOrderAssemblyBaseline(initialData) : {}).map(([id, value]) => [id, String(value)])),
  );
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [itemPage, setItemPage] = useState(1);
  const [assemblyPage, setAssemblyPage] = useState(1);
  const [viewMode, setViewMode] = useState<ResourceViewMode>(() => {
    const saved = window.localStorage.getItem('faction-order-resource-view');
    return saved === 'tiles' ? 'tiles' : 'list';
  });
  const [comparison, setComparison] = useState<FactionOrder | undefined>();
  const [infoAssembly, setInfoAssembly] = useState<Assembly | null>(null);
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const sortedAssemblies = [...assemblies].sort((a, b) => a.name.localeCompare(b.name));

  const availableByItem = new Map(items.map((item) => [
    item.id,
    getItemStock(item).remaining,
  ]));

  // Effect events: both effects must re-run on their real inputs only, not merely
  // because `allowedFactions` is a new function on every render.
  const applyDefaultFaction = useEffectEvent(() => {
    if (initialData) return;
    setEventType(defaultEventType);
    const options = allowedFactions(defaultEventType);
    setFaction(defaultFaction && options.includes(defaultFaction) ? defaultFaction : options[0] ?? '');
  });

  const clampFactionToAllowedOptions = useEffectEvent(() => {
    const options = allowedFactions(eventType);
    if (!options.includes(faction)) setFaction(options[0] ?? '');
  });

  useEffect(() => {
    applyDefaultFaction();
  }, [allowedFactionKeys, defaultEventType, defaultFaction, dynamicFactions, initialData]);

  useEffect(() => {
    clampFactionToAllowedOptions();
  }, [allowedFactionKeys, dynamicFactions, eventType, faction]);

  const previousOrder = findPreviousFactionOrder(orders, {
    eventType,
    faction,
    eventDate,
    excludeId: initialData?.id,
  });

  const visibleItems = (() => {
    const term = search.trim().toLocaleLowerCase();
    return sortedItems
      .filter((item) => {
        if (category && item.category !== category) return false;
        if (term) return `${item.name} ${item.category} ${item.subcategory ?? ''}`.toLocaleLowerCase().includes(term);
        if (Number(quantities[item.id]) > 0) return true;
        return item.eventTypes?.includes(eventType);
      });
  })();

  const visibleAssemblies = (() => {
    const term = search.trim().toLocaleLowerCase();
    return sortedAssemblies
      .filter((assembly) => {
        if (term) return `${assembly.name} ${assembly.description ?? ''}`.toLocaleLowerCase().includes(term);
        if (Number(assemblyQuantities[assembly.id]) > 0) return true;
        return assembly.eventTypes?.includes(eventType);
      });
  })();
  const currentItemPage = Math.min(itemPage, Math.max(1, Math.ceil(visibleItems.length / ORDER_CATALOG_PAGE_SIZE)));
  const currentAssemblyPage = Math.min(assemblyPage, Math.max(1, Math.ceil(visibleAssemblies.length / ORDER_CATALOG_PAGE_SIZE)));
  const pageItems = visibleItems.slice((currentItemPage - 1) * ORDER_CATALOG_PAGE_SIZE, currentItemPage * ORDER_CATALOG_PAGE_SIZE);
  const pageAssemblies = visibleAssemblies.slice((currentAssemblyPage - 1) * ORDER_CATALOG_PAGE_SIZE, currentAssemblyPage * ORDER_CATALOG_PAGE_SIZE);

  const selectedAssemblies = assemblies
    .filter((assembly) => Number(assemblyQuantities[assembly.id]) > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedItems = items
    .filter((item) => Number(quantities[item.id]) > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedEntryCount = selectedAssemblies.length + selectedItems.length;

  const currentQuantities = toPositiveIntegerQuantities(quantities);
  const currentAssemblyQuantities = toPositiveIntegerQuantities(assemblyQuantities);
  const orderDemandByItem = (() => {
    const demand = new Map<string, number>(Object.entries(currentQuantities));
    for (const [assemblyId, assemblyCount] of Object.entries(currentAssemblyQuantities)) {
      const assembly = assemblies.find((candidate) => candidate.id === assemblyId);
      if (!assembly) continue;
      for (const [itemId, componentQuantity] of Object.entries(assembly.itemQuantities ?? {})) {
        demand.set(itemId, (demand.get(itemId) ?? 0) + componentQuantity * assemblyCount);
      }
    }
    return demand;
  })();
  const projectedStockByItem = new Map(items.map((item) => [
    item.id,
    (availableByItem.get(item.id) ?? 0) - (orderDemandByItem.get(item.id) ?? 0),
  ]));
  const shortageCount = [...projectedStockByItem.values()]
    .reduce((total, projected) => total + Math.max(0, -projected), 0);
  const changes = (() => {
    if (!comparison) return [];
    const comparisonItems = factionOrderItemBaseline(comparison);
    const comparisonAssemblies = factionOrderAssemblyBaseline(comparison);
    const itemIds = new Set([...Object.keys(comparisonItems), ...Object.keys(currentQuantities)]);
    const itemChanges = [...itemIds].flatMap((itemId) => {
      const before = comparisonItems[itemId] ?? 0;
      const after = currentQuantities[itemId] ?? 0;
      if (before === after) return [];
      const item = items.find((candidate) => candidate.id === itemId);
      return [{ resourceKey: `item-${itemId}`, name: item?.name ?? itemId, before, after }];
    });
    const assemblyIds = new Set([
      ...Object.keys(comparisonAssemblies),
      ...Object.keys(currentAssemblyQuantities),
    ]);
    const assemblyChanges = [...assemblyIds].flatMap((assemblyId) => {
      const before = comparisonAssemblies[assemblyId] ?? 0;
      const after = currentAssemblyQuantities[assemblyId] ?? 0;
      if (before === after) return [];
      const assembly = assemblies.find((candidate) => candidate.id === assemblyId);
      return [{ resourceKey: `assembly-${assemblyId}`, name: assembly?.name ?? assemblyId, before, after }];
    });
    return [...assemblyChanges, ...itemChanges];
  })();

  function copyPrevious() {
    if (!previousOrder) return;
    const previousItems = factionOrderItemBaseline(previousOrder);
    const previousAssemblies = factionOrderAssemblyBaseline(previousOrder);
    setQuantities(Object.fromEntries(
      Object.entries(previousItems).map(([id, value]) => [id, String(value)]),
    ));
    setAssemblyQuantities(Object.fromEntries(
      Object.entries(previousAssemblies).map(([id, value]) => [id, String(value)]),
    ));
    setComparison(previousOrder);
  }

  function changeQuantity(id: string, delta: number, assembly = false) {
    const setter = assembly ? setAssemblyQuantities : setQuantities;
    setter((current) => {
      const nextValue = Math.max(0, (Number(current[id]) || 0) + delta);
      const next = { ...current };
      if (nextValue === 0) delete next[id];
      else next[id] = String(nextValue);
      return next;
    });
  }

  function setQuantity(id: string, value: string, assembly = false) {
    if (value !== '' && !/^\d+$/.test(value)) return;
    const setter = assembly ? setAssemblyQuantities : setQuantities;
    setter((current) => ({ ...current, [id]: value }));
  }

  function removeItem(id: string, assembly = false) {
    const setter = assembly ? setAssemblyQuantities : setQuantities;
    setter((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedEvent) return;
    const requestedQuantities = toPositiveIntegerQuantities(quantities);
    const requestedAssemblyQuantities = toPositiveIntegerQuantities(assemblyQuantities);
    onSubmit({
      eventType,
      eventOccurrenceId: selectedEvent.id,
      faction,
      eventDate,
      requestedPickupDate: requestedPickupDate || undefined,
      itemIds: Object.keys(requestedQuantities),
      requestedQuantities,
      assemblyIds: Object.keys(requestedAssemblyQuantities),
      requestedAssemblyQuantities,
      notes: notes.trim(),
    });
  }

  return (
    <Box component="form" onSubmit={submit}>
      <Stack spacing={2.5}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
          <FormControl fullWidth>
            <InputLabel>{t('Event', 'Event')}</InputLabel>
            <Select
              label={t('Event', 'Event')}
              value={eventType}
              onChange={(event) => {
                const value = event.target.value as EventType;
                setEventType(value);
                setItemPage(1);
                setAssemblyPage(1);
                if (!initialData) setActiveEventType(value);
              }}
            >
              {allowedEvents.map((type) => <MenuItem key={type} value={type}>{type === 'LS' ? 'LightSim' : type}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>{t('Fraktion', 'Faction')}</InputLabel>
            <Select label={t('Fraktion', 'Faction')} value={faction} onChange={(event) => setFaction(event.target.value)}>
              {allowedFactions(eventType).map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth required>
            <InputLabel>{t('Jährliches Event', 'Yearly event')}</InputLabel>
            <Select label={t('Jährliches Event', 'Yearly event')} value={selectedEvent?.id ?? ''} onChange={(event) => setEventOccurrenceId(event.target.value)}>
              {eventOptions.map((entry) => <MenuItem key={entry.id} value={entry.id}>{entry.name} · {entry.startDate} {entry.endDate !== entry.startDate ? `– ${entry.endDate}` : ''}</MenuItem>)}
            </Select>
          </FormControl>
          {!eventOptions.length && <Alert severity="info" action={<Button component={RouterLink} to="/events">{t('Events öffnen', 'Open events')}</Button>}>{t('Legen Sie zuerst ein Event für diesen Eventtyp an.', 'Create an event for this event type first.')}</Alert>}
          <TextField fullWidth label={t('Eventzeitraum', 'Event dates')} value={selectedEvent ? `${selectedEvent.startDate} – ${selectedEvent.endDate}` : ''} slotProps={{ input: { readOnly: true } }} />
          <TextField
            fullWidth
            type="date"
            label={t('Gewünschtes Abholdatum (optional)', 'Requested pickup date (optional)')}
            value={requestedPickupDate}
            onChange={(event) => setRequestedPickupDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            helperText={t('Wann möchtest du die Bestellung abholen?', 'When would you like to collect the order?')}
          />
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
          <Button
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={copyPrevious}
            disabled={!previousOrder}
          >
            {previousOrder
              ? t(`${new Date(previousOrder.eventDate).getUTCFullYear()} als Basis übernehmen`, `Use ${new Date(previousOrder.eventDate).getUTCFullYear()} as baseline`)
              : t('Vorjahr als Basis übernehmen', 'Use previous year as baseline')}
          </Button>
          {previousOrder && (
            <Typography variant="body2" color="text.secondary">
              {['picked_up', 'returned'].includes(previousOrder.status)
                ? t('Tatsächlich verwendete Mengen vom', 'Actual quantities used on')
                : t('Geplante Mengen vom', 'Planned quantities from')}{' '}
              {new Date(previousOrder.eventDate).toLocaleDateString()}
            </Typography>
          )}
        </Stack>

        {comparison && (
          <Alert severity={changes.length ? 'info' : 'success'}>
            <Typography variant="subtitle2">
              {changes.length
                ? t(`${changes.length} Änderungen zur vorherigen Liste`, `${changes.length} changes from the previous list`)
                : t('Keine Änderungen zur vorherigen Liste', 'No changes from the previous list')}
            </Typography>
            {changes.length > 0 && (
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
                {changes.map((change) => (
                  <Chip
                    key={change.resourceKey}
                    size="small"
                    label={`${change.name}: ${change.before} → ${change.after}`}
                    color={change.after > change.before ? 'primary' : 'default'}
                  />
                ))}
              </Stack>
            )}
          </Alert>
        )}

        <Divider />
        <Box>
          <Typography variant="h6">{t('Baugruppen und Artikel', 'Assemblies and items')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t(
              'Für dieses Event markierte Einträge werden direkt angezeigt. Nur Einträge mit einer Menge größer als 0 werden bestellt.',
              'Entries tagged for this event are shown directly. Only entries with a quantity greater than 0 are ordered.',
            )}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
            <TextField
              fullWidth
              size="small"
              label={t('Baugruppen oder Artikel suchen', 'Search assemblies or items')}
              value={search}
              onChange={(event) => { setSearch(event.target.value); setItemPage(1); setAssemblyPage(1); }}
            />
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }}>
              <InputLabel>{t('Kategorie', 'Category')}</InputLabel>
              <Select label={t('Kategorie', 'Category')} value={category} onChange={(event) => { setCategory(event.target.value); setItemPage(1); }}>
                <MenuItem value="">{t('Alle Kategorien', 'All categories')}</MenuItem>
                {categories.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </Select>
            </FormControl>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={viewMode}
              onChange={(_event, value: ResourceViewMode | null) => {
                if (!value) return;
                setViewMode(value);
                window.localStorage.setItem('faction-order-resource-view', value);
              }}
              aria-label={t('Ansicht', 'View')}
              sx={{ flexShrink: 0 }}
            >
              <ToggleButton value="list" aria-label={t('Listenansicht', 'List view')}><ViewListIcon /></ToggleButton>
              <ToggleButton value="tiles" aria-label={t('Kachelansicht', 'Tile view')}><GridViewIcon /></ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Box>

        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
            <CategoryIcon color="primary" />
            <Typography variant="h6">
              {isMobile ? t('Baugruppen auswählen', 'Choose assemblies') : t('Benötigte Baugruppen', 'Requested assemblies')}
            </Typography>
          </Stack>
          {viewMode === 'tiles' ? (
            <Box key={currentAssemblyPage} sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 1, maxHeight: { xs: '42vh', sm: 330 }, overflowY: 'auto', pr: 0.5 }}>
              {pageAssemblies.map((assembly) => {
                const isSelected = Number(assemblyQuantities[assembly.id]) > 0;
                const available = assemblyAvailability(assembly, (itemId) => availableByItem.get(itemId) ?? 0);
                return (
                  <Paper
                    key={assembly.id}
                    variant="outlined"
                    sx={{ p: 1, position: 'relative', borderColor: isSelected ? 'primary.main' : 'divider', bgcolor: isSelected ? 'rgba(227, 6, 19, 0.045)' : 'background.paper' }}
                  >
                    {assembly.image ? <MediaImage src={apiFileUrl(assembly.image)} alt={assembly.name} sx={{ width: '100%', height: 64, objectFit: 'contain', borderRadius: 0.75, display: 'block', mb: 0.75 }} /> : <Box sx={{ height: 64, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75, mb: 0.75 }}><CategoryIcon color="primary" /></Box>}
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.15, minHeight: '2.3em' }}>{assembly.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{Object.keys(assembly.itemQuantities ?? {}).length} {t('Komponenten', 'components')}</Typography>
                    <Typography variant="caption" color={available ? 'success.main' : 'error.main'}>{t('Verfügbar', 'Available')}: {available}</Typography>
                    <Tooltip title={t('Baugruppe anzeigen', 'Show assembly contents')}><IconButton size="small" onClick={() => setInfoAssembly(assembly)} aria-label={`${assembly.name}: ${t('Inhalt anzeigen', 'Show contents')}`}><InfoOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                    <Stack direction="row" sx={{ mt: 0.75, alignItems: 'center', justifyContent: 'space-between' }}>
                      <IconButton size="small" disabled={!isSelected} onClick={() => changeQuantity(assembly.id, -1, true)}><RemoveIcon fontSize="small" /></IconButton>
                      <QuantityInput label={`${assembly.name} ${t('Menge', 'quantity')}`} value={assemblyQuantities[assembly.id] ?? ''} onChange={(value) => setQuantity(assembly.id, value, true)} />
                      <IconButton size="small" color="primary" onClick={() => changeQuantity(assembly.id, 1, true)}><AddIcon fontSize="small" /></IconButton>
                    </Stack>
                    {isSelected && !isMobile && (
                      <Tooltip title={t('Alle entfernen', 'Remove all')}>
                        <IconButton size="small" color="error" onClick={() => removeItem(assembly.id, true)} sx={{ position: 'absolute', top: 4, right: 4 }}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                  </Paper>
                );
              })}
            </Box>
          ) : (
            <Stack key={currentAssemblyPage} spacing={0.5} sx={{ maxHeight: { xs: '36vh', sm: 280 }, overflowY: 'auto', pr: 0.5 }}>
              {pageAssemblies.map((assembly) => {
                const quantity = Number(assemblyQuantities[assembly.id]) || 0;
                const available = assemblyAvailability(assembly, (itemId) => availableByItem.get(itemId) ?? 0);
                return (
                  <Paper key={assembly.id} variant="outlined" sx={{ px: 0.75, py: 0.4, borderColor: quantity ? 'primary.main' : 'divider', bgcolor: quantity ? 'rgba(227, 6, 19, 0.045)' : 'background.paper' }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                       {assembly.image ? <MediaImage src={apiFileUrl(assembly.image)} alt={assembly.name} sx={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 0.75, flexShrink: 0 }} /> : <Box sx={{ width: 36, height: 36, flexShrink: 0, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75 }}><CategoryIcon color="primary" fontSize="small" /></Box>}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700 }} noWrap>{assembly.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{Object.keys(assembly.itemQuantities ?? {}).length} {t('Komponenten', 'components')} · {t('Verfügbar', 'Available')}: {available}</Typography>
                      </Box>
                      <Tooltip title={t('Baugruppe anzeigen', 'Show assembly contents')}><IconButton size="small" onClick={() => setInfoAssembly(assembly)} aria-label={`${assembly.name}: ${t('Inhalt anzeigen', 'Show contents')}`}><InfoOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                      <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0 }}>
                        <IconButton size="small" disabled={!quantity} onClick={() => changeQuantity(assembly.id, -1, true)}><RemoveIcon fontSize="small" /></IconButton>
                        <QuantityInput label={`${assembly.name} ${t('Menge', 'quantity')}`} value={assemblyQuantities[assembly.id] ?? ''} onChange={(value) => setQuantity(assembly.id, value, true)} />
                        <IconButton size="small" color="primary" onClick={() => changeQuantity(assembly.id, 1, true)}><AddIcon fontSize="small" /></IconButton>
                        {!isMobile && (
                          <Box sx={{ width: 34, flexShrink: 0 }}>
                            {quantity > 0 && (
                              <Tooltip title={t('Alle entfernen', 'Remove all')}>
                                <IconButton size="small" color="error" onClick={() => removeItem(assembly.id, true)}><DeleteIcon fontSize="inherit" /></IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        )}
                      </Stack>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
          {!visibleAssemblies.length && <Typography color="text.secondary">{t('Keine passenden Baugruppen.', 'No matching assemblies.')}</Typography>}
          <OrderCatalogPager count={visibleAssemblies.length} page={currentAssemblyPage} onPageChange={setAssemblyPage} />
        </Box>

        <Box>
          <Typography variant="h6">
            {isMobile ? t('Artikel auswählen', 'Choose items') : t('Benötigte Artikel', 'Requested items')}
          </Typography>
          {shortageCount > 0 && (
            <Alert severity="warning" sx={{ my: 1 }}>
              {t(
                `Die Bestellung überschreitet den verfügbaren Bestand um ${shortageCount} Einheiten. Die Lieferung ist nicht garantiert; die Fehlmenge wird in der Beschaffung als „zu bestellen" angezeigt.`,
                `This order exceeds available stock by ${shortageCount} units. Delivery is not guaranteed; the shortage will appear in Procurement as needing to be ordered.`,
              )}
            </Alert>
          )}
          {viewMode === 'tiles' ? (
            <Box key={currentItemPage} sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 1, maxHeight: { xs: '52vh', sm: 440 }, overflowY: 'auto', pr: 0.5 }}>
              {pageItems.map((item) => {
                const isSelected = Number(quantities[item.id]) > 0;
                const image = itemImageUrl(item, undefined, '240x160');
                const available = availableByItem.get(item.id) ?? 0;
                const projected = projectedStockByItem.get(item.id) ?? available;
                return (
                  <Paper
                    key={item.id}
                    variant="outlined"
                    sx={{ p: 1, position: 'relative', borderColor: isSelected ? 'primary.main' : 'divider', bgcolor: isSelected ? 'rgba(227, 6, 19, 0.045)' : 'background.paper' }}
                  >
                    {image ? <MediaImage src={image} alt={item.name} sx={{ width: '100%', height: 76, objectFit: 'contain', borderRadius: 0.75, display: 'block', mb: 0.75 }} /> : <Box sx={{ height: 76, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75, mb: 0.75 }}><AddIcon color="disabled" /></Box>}
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.15, minHeight: '2.3em' }}>{item.name}</Typography>
                    <Typography variant="caption" color={available > 0 ? 'success.main' : 'error.main'}>{t('Verfügbar', 'Available')}: {available}</Typography>
                    {(orderDemandByItem.get(item.id) ?? 0) > 0 && (
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }} color={projected <= 0 ? 'error.main' : projected <= (item.minStock ?? 5) ? 'warning.main' : 'success.main'}>
                        {t('Nach Bestellung', 'After order')}: {projected}
                      </Typography>
                    )}
                    <Stack direction="row" sx={{ mt: 0.75, alignItems: 'center', justifyContent: 'space-between' }}>
                      <IconButton size="small" disabled={!isSelected} onClick={() => changeQuantity(item.id, -1)}><RemoveIcon fontSize="small" /></IconButton>
                      <QuantityInput label={`${item.name} ${t('Menge', 'quantity')}`} value={quantities[item.id] ?? ''} onChange={(value) => setQuantity(item.id, value)} />
                      <IconButton size="small" color="primary" onClick={() => changeQuantity(item.id, 1)}><AddIcon fontSize="small" /></IconButton>
                    </Stack>
                    {isSelected && !isMobile && (
                      <Tooltip title={t('Alle entfernen', 'Remove all')}>
                        <IconButton size="small" color="error" onClick={() => removeItem(item.id)} sx={{ position: 'absolute', top: 4, right: 4 }}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                  </Paper>
                );
              })}
            </Box>
          ) : (
            <Stack key={currentItemPage} spacing={0.5} sx={{ maxHeight: { xs: '45vh', sm: 360 }, overflowY: 'auto', pr: 0.5 }}>
              {pageItems.map((item) => {
                const quantity = Number(quantities[item.id]) || 0;
                const image = itemImageUrl(item, undefined, '96x96');
                const available = availableByItem.get(item.id) ?? 0;
                const projected = projectedStockByItem.get(item.id) ?? available;
                return (
                  <Paper key={item.id} variant="outlined" sx={{ px: 0.75, py: 0.4, borderColor: quantity ? 'primary.main' : 'divider', bgcolor: quantity ? 'rgba(227, 6, 19, 0.045)' : 'background.paper' }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      {image
                        ? <MediaImage src={image} alt={item.name} sx={{ width: 36, height: 36, flexShrink: 0, objectFit: 'contain', borderRadius: 0.75 }} />
                        : <Box sx={{ width: 36, height: 36, flexShrink: 0, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75 }}><GridViewIcon color="disabled" fontSize="small" /></Box>}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700 }} noWrap>{item.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{item.category} · {t('Verfügbar', 'Available')}: {available}</Typography>
                        {(orderDemandByItem.get(item.id) ?? 0) > 0 && (
                          <Typography variant="caption" noWrap sx={{ display: 'block', fontWeight: 700 }} color={projected <= 0 ? 'error.main' : projected <= (item.minStock ?? 5) ? 'warning.main' : 'success.main'}>
                            {t('Nach Bestellung', 'After order')}: {projected}
                          </Typography>
                        )}
                      </Box>
                      <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0 }}>
                        <IconButton size="small" disabled={!quantity} onClick={() => changeQuantity(item.id, -1)}><RemoveIcon fontSize="small" /></IconButton>
                        <QuantityInput label={`${item.name} ${t('Menge', 'quantity')}`} value={quantities[item.id] ?? ''} onChange={(value) => setQuantity(item.id, value)} />
                        <IconButton size="small" color="primary" onClick={() => changeQuantity(item.id, 1)}><AddIcon fontSize="small" /></IconButton>
                        {!isMobile && (
                          <Box sx={{ width: 34, flexShrink: 0 }}>
                            {quantity > 0 && (
                              <Tooltip title={t('Alle entfernen', 'Remove all')}>
                                <IconButton size="small" color="error" onClick={() => removeItem(item.id)}><DeleteIcon fontSize="inherit" /></IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        )}
                      </Stack>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
          {!visibleItems.length && <Typography color="text.secondary">{t('Keine passenden Artikel.', 'No matching items.')}</Typography>}
          <OrderCatalogPager count={visibleItems.length} page={currentItemPage} onPageChange={setItemPage} />
        </Box>

        {selectedEntryCount > 0 && (
          <Box>
            <Divider sx={{ mb: 2 }} />
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="h6">{t('Aktuelle Bestellung', 'Current order')}</Typography>
              <Chip
                size="small"
                color="primary"
                label={selectedEntryCount === 1
                  ? t('1 Position', '1 entry')
                  : t(`${selectedEntryCount} Positionen`, `${selectedEntryCount} entries`)}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {t(
                'Bereits hinzugefügte Positionen. Entfernen ist hier bewusst von den Schnellwahl-Tasten getrennt.',
                'Items already added. Remove actions are kept separate from the quick quantity controls.',
              )}
            </Typography>
            <Stack spacing={1}>
              {selectedAssemblies.map((assembly) => {
                return (
                  <Paper key={`selected-assembly-${assembly.id}`} variant="outlined" sx={{ p: 1 }}>
                    <Typography sx={{ fontWeight: 700 }}>{assembly.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('Baugruppe', 'Assembly')} · {Object.keys(assembly.itemQuantities ?? {}).length} {t('Komponenten', 'components')}
                    </Typography>
                    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 0.75 }}>
                      <Stack direction="row" sx={{ alignItems: 'center' }}>
                        <IconButton size="small" onClick={() => changeQuantity(assembly.id, -1, true)} aria-label={t('Menge verringern', 'Decrease quantity')}><RemoveIcon fontSize="small" /></IconButton>
                        <QuantityInput label={`${assembly.name} ${t('Menge', 'quantity')}`} value={assemblyQuantities[assembly.id] ?? ''} onChange={(value) => setQuantity(assembly.id, value, true)} />
                        <IconButton size="small" color="primary" onClick={() => changeQuantity(assembly.id, 1, true)} aria-label={t('Menge erhöhen', 'Increase quantity')}><AddIcon fontSize="small" /></IconButton>
                      </Stack>
                      <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => removeItem(assembly.id, true)}>
                        {t('Entfernen', 'Remove')}
                      </Button>
                    </Stack>
                  </Paper>
                );
              })}
              {selectedItems.map((item) => {
                const available = availableByItem.get(item.id) ?? 0;
                return (
                  <Paper key={`selected-item-${item.id}`} variant="outlined" sx={{ p: 1 }}>
                    <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.category} · {t('Verfügbar', 'Available')}: {available}
                    </Typography>
                    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 0.75 }}>
                      <Stack direction="row" sx={{ alignItems: 'center' }}>
                        <IconButton size="small" onClick={() => changeQuantity(item.id, -1)} aria-label={t('Menge verringern', 'Decrease quantity')}><RemoveIcon fontSize="small" /></IconButton>
                        <QuantityInput label={`${item.name} ${t('Menge', 'quantity')}`} value={quantities[item.id] ?? ''} onChange={(value) => setQuantity(item.id, value)} />
                        <IconButton size="small" color="primary" onClick={() => changeQuantity(item.id, 1)} aria-label={t('Menge erhöhen', 'Increase quantity')}><AddIcon fontSize="small" /></IconButton>
                      </Stack>
                      <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => removeItem(item.id)}>
                        {t('Entfernen', 'Remove')}
                      </Button>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </Box>
        )}

        <TextField
          label={t('Anmerkungen', 'Notes')}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          multiline
          minRows={2}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          startIcon={<SaveIcon />}
          disabled={isLoading || !selectedEvent || (Object.keys(currentQuantities).length === 0 && Object.keys(currentAssemblyQuantities).length === 0)}
        >
          {submitLabel ?? t('Bestellliste erstellen', 'Create order list')}
        </Button>
      </Stack>
      <Dialog open={Boolean(infoAssembly)} onClose={() => setInfoAssembly(null)} fullWidth maxWidth="sm">
        <DialogTitle>{infoAssembly?.name}</DialogTitle>
        <DialogContent dividers>
          {infoAssembly?.description && <Typography sx={{ mb: 2 }}>{infoAssembly.description}</Typography>}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('Enthaltene Artikel', 'Included items')}</Typography>
          <Stack spacing={0.75}>
            {Object.entries(infoAssembly?.itemQuantities ?? {}).map(([itemId, quantity]) => <Typography key={itemId}>{quantity} × {items.find((item) => item.id === itemId)?.name ?? itemId}</Typography>)}
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
