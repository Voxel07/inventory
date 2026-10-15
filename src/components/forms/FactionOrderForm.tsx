import { useQuery } from '@tanstack/react-query';
import { itemApi, getItemCategories } from '../../services/inventoryService';
import { useItemsByIds } from '../../hooks/useItems';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { QueryFeedback } from '../common/QueryFeedback';
import { getPreviousFactionOrder } from '../../services/factionOrderService';
import { formatDate } from '../../utils/dateFormat';
import { Button, ToggleButton, IconButton } from '../shared/ActionButtons';
import { MediaImage } from '../common/MediaImage';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  ToggleButtonGroup,

  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CategoryIcon from '@mui/icons-material/Category';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewListIcon from '@mui/icons-material/ViewList';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Dialog } from '../shared/ClosableDialog';
import { DialogContent, DialogTitle } from '@mui/material';
import type { Assembly, EventType, FactionOrder, FactionOrderSummary, FactionOrderFormData, StorageLocation } from '../../types';
import { translate, useT } from '../../utils/naming';
import { useEventReports } from '../../hooks/useEvents';
import {
  factionOrderAssemblyBaseline,
  factionOrderItemBaseline,
} from '../../utils/factionOrderHistory';
import { useUIStore } from '../../store/uiStore';
import { useFactionCatalog } from '../../hooks/useFactionCatalog';
import { useAuth } from '../../hooks/useAuth';
import { canWriteFaction, factionKeyOf } from '../../utils/access';
import { getItemStock } from '../../utils/stock';
import { itemImageUrl } from '../../utils/itemImages';
import { assemblyAvailability } from '../../utils/factionOrderQuantities';
import { apiFileUrl } from '../../services/apiClient';
import { toPositiveIntegerQuantities } from '../../utils/quantityMaps';
import { OrderCatalogPager, ORDER_CATALOG_PAGE_SIZE } from '../orders/OrderCatalogPager';
import { QuantityControl } from '../orders/QuantityControl';
import { CatalogSearchField } from '../orders/CatalogSearchField';
import { catalogPage, filterCatalogAssemblies } from '../../utils/orderCatalog';

type ResourceViewMode = 'list' | 'tiles';

interface Props {
  assemblies: Assembly[];
  storageLocations: StorageLocation[];
  initialData?: FactionOrder;
  defaultEventType?: EventType;
  defaultEventOccurrenceId?: string;
  defaultFaction?: string;
  submitLabel?: string;
  isLoading?: boolean;
  onSubmit: (data: FactionOrderFormData) => void;
}

export function FactionOrderForm({
  assemblies,
  initialData,
  defaultEventType = 'DE',
  defaultEventOccurrenceId,
  defaultFaction,
  submitLabel,
  isLoading,
  onSubmit,
}: Props) {
  const t = useT();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const setActiveEventType = useUIStore((state) => state.setActiveEventType);
  const catalog = useFactionCatalog();
  const { user } = useAuth();
  const { data: events = [] } = useEventReports();

  const initialEventType = initialData?.eventType ?? defaultEventType;
  // Faction leaders only see the factions of their identity-provider groups.
  const allowedFactions = (type: EventType) => catalog.factionsFor(type)
    .filter((candidate) => canWriteFaction(user, factionKeyOf(candidate)))
    .map((candidate) => candidate.name);
  const allowedEvents = catalog.eventTypes.filter((type) => allowedFactions(type).length > 0);
  const [chosenEventType, setEventType] = useState<EventType>(initialEventType);
  const eventType = allowedEvents.includes(chosenEventType) ? chosenEventType : allowedEvents[0] ?? chosenEventType;
  const [chosenFaction, setFaction] = useState(
    initialData?.faction ?? defaultFaction ?? allowedFactions(initialEventType)[0] ?? '',
  );
  const factionOptions = allowedFactions(eventType);
  const faction = factionOptions.includes(chosenFaction) ? chosenFaction : factionOptions[0] ?? '';
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
  const [comparison, setComparison] = useState<FactionOrderSummary | undefined>();
  const [infoAssembly, setInfoAssembly] = useState<Assembly | null>(null);
  const catalogSearch = useDebouncedValue(search.trim());
  const orderable = useQuery({
    queryKey: ['items', 'orderable', eventType, catalogSearch, category, itemPage],
    networkMode: 'offlineFirst',
    queryFn: () => itemApi.getPage({ eventType, includeUntagged: Boolean(catalogSearch), search: catalogSearch || undefined, category: category || undefined, sort: 'name' }, itemPage - 1, ORDER_CATALOG_PAGE_SIZE),
  });
  const sortedAssemblies = [...assemblies].sort((a, b) => a.name.localeCompare(b.name));
  const visibleAssemblies = filterCatalogAssemblies(sortedAssemblies, search,
    assembly => assembly.id in assemblyQuantities || Boolean(assembly.eventTypes?.includes(eventType)));
  const { page: currentAssemblyPage, entries: pageAssemblies } = catalogPage(visibleAssemblies, assemblyPage, ORDER_CATALOG_PAGE_SIZE);
  const requiredItemIds = [...Object.keys(quantities), ...Object.keys(comparison?.requestedQuantities ?? {}),
    ...[...pageAssemblies, ...assemblies.filter(assembly => Number(assemblyQuantities[assembly.id]) > 0)].flatMap(assembly => Object.keys(assembly.itemQuantities ?? {}))];
  const onOrder = useItemsByIds(requiredItemIds);
  const items = [...new Map([...(orderable.data?.rows ?? []), ...(onOrder.data ?? [])].map(item => [item.id, item])).values()];
  const previous = useQuery({ queryKey: ['faction-orders', 'previous', eventType, faction, eventDate, initialData?.id],
    enabled: Boolean(faction && eventDate), networkMode: 'offlineFirst',
    queryFn: () => getPreviousFactionOrder(eventType, faction, eventDate, initialData?.id) });
  const { data: categories = [] } = useQuery({ queryKey: ['item-categories'], queryFn: getItemCategories, networkMode: 'offlineFirst' });

  const availableByItem = new Map(items.map((item) => [
    item.id,
    getItemStock(item).remaining,
  ]));

  const defaultKey = JSON.stringify([initialData?.id, defaultEventType, defaultFaction]);
  const [defaultSource, setDefaultSource] = useState(defaultKey);
  if (defaultSource !== defaultKey) {
    setDefaultSource(defaultKey);
    if (!initialData) {
      setEventType(defaultEventType);
      setFaction(defaultFaction ?? allowedFactions(defaultEventType)[0] ?? '');
    }
  }

  const previousOrder = previous.data;

  const currentItemPage = itemPage;
  const pageItems = orderable.data?.rows ?? [];

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
            <InputLabel>{t('nav.event')}</InputLabel>
            <Select
              label={t('nav.event')}
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
            <InputLabel>{t('common.faction')}</InputLabel>
            <Select label={t('common.faction')} value={faction} onChange={(event) => setFaction(event.target.value)}>
              {allowedFactions(eventType).map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth required>
            <InputLabel>{t('forms.factionOrderForm.yearlyEvent')}</InputLabel>
            <Select label={t('forms.factionOrderForm.yearlyEvent')} value={selectedEvent?.id ?? ''} onChange={(event) => setEventOccurrenceId(event.target.value)}>
              {eventOptions.map((entry) => <MenuItem key={entry.id} value={entry.id}>{entry.name} · {formatDate(entry.startDate)} {entry.endDate !== entry.startDate ? `– ${formatDate(entry.endDate)}` : ''}</MenuItem>)}
            </Select>
          </FormControl>
          {!eventOptions.length && <Alert severity="info" action={<Button title={translate('forms.factionOrderForm.openTheEventOverview')} component={RouterLink} to="/events">{t('forms.factionOrderForm.openEvents')}</Button>}>{t('forms.factionOrderForm.createAnEventForThisEventTypeFirst')}</Alert>}
          <TextField fullWidth label={t('forms.factionOrderForm.eventDates')} value={selectedEvent ? `${formatDate(selectedEvent.startDate)} – ${formatDate(selectedEvent.endDate)}` : ''} slotProps={{ input: { readOnly: true } }} />
          <TextField
            fullWidth
            type="date"
            label={t('forms.factionOrderForm.requestedPickupDateOptional')}
            value={requestedPickupDate}
            onChange={(event) => setRequestedPickupDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            helperText={t('forms.factionOrderForm.whenWouldYouLikeToCollectTheOrder')}
          />
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
          <Button title={translate('forms.factionOrderForm.copyQuantitiesFromThePreviousList')}
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={copyPrevious}
            disabled={!previousOrder}
          >
            {previousOrder
              ? t('forms.factionOrderForm.useYearAsBaseline', { year: String(new Date(previousOrder.eventDate).getUTCFullYear()) })
              : t('forms.factionOrderForm.usePreviousYearAsBaseline')}
          </Button>
          {previousOrder && (
            <Typography variant="body2" color="text.secondary">
              {['picked_up', 'returned'].includes(previousOrder.status)
                ? t('forms.factionOrderForm.actualQuantitiesUsedOn')
                : t('forms.factionOrderForm.plannedQuantitiesFrom')}{' '}
              {formatDate(previousOrder.eventDate)}
            </Typography>
          )}
        </Stack>

        {comparison && (
          <Alert severity={changes.length ? 'info' : 'success'}>
            <Typography variant="subtitle2">
              {changes.length
                ? t('forms.factionOrderForm.changeCountChangesFromThePreviousList', { changeCount: String(changes.length) })
                : t('forms.factionOrderForm.noChangesFromThePreviousList')}
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
          <Typography variant="h6">{t('forms.factionOrderForm.assembliesAndItems')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('forms.factionOrderForm.entriesTaggedForThisEventAreShownDirectlyOnlyEntries')}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
            <CatalogSearchField label={t('forms.factionOrderForm.searchAssembliesOrItems')}
              value={search} onChange={(value) => { setSearch(value); setItemPage(1); setAssemblyPage(1); }} />
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }}>
              <InputLabel>{t('common.category')}</InputLabel>
              <Select label={t('common.category')} value={category} onChange={(event) => { setCategory(event.target.value); setItemPage(1); }}>
                <MenuItem value="">{t('common.allCategories')}</MenuItem>
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
              aria-label={t('forms.factionOrderForm.view')}
              sx={{ flexShrink: 0 }}
            >
              <ToggleButton title={translate('forms.factionOrderForm.displayTheCatalogAsAList')} value="list" aria-label={t('forms.factionOrderForm.listView')}><ViewListIcon /></ToggleButton>
              <ToggleButton title={translate('forms.factionOrderForm.displayTheCatalogAsTiles')} value="tiles" aria-label={t('forms.factionOrderForm.tileView')}><GridViewIcon /></ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Box>

        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
            <CategoryIcon color="primary" />
            <Typography variant="h6">
              {isMobile ? t('forms.factionOrderForm.chooseAssemblies') : t('forms.factionOrderForm.requestedAssemblies')}
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
                    sx={{ p: 1, position: 'relative', borderColor: isSelected ? 'primary.main' : 'divider', bgcolor: isSelected ? 'action.selected' : 'background.paper' }}
                  >
                    {assembly.image ? <MediaImage src={apiFileUrl(assembly.image)} alt={assembly.name} sx={{ width: '100%', height: 64, objectFit: 'contain', borderRadius: 0.75, display: 'block', mb: 0.75 }} /> : <Box sx={{ height: 64, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75, mb: 0.75 }}><CategoryIcon color="primary" /></Box>}
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.15, minHeight: '2.3em' }}>{assembly.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{Object.keys(assembly.itemQuantities ?? {}).length} {t('forms.factionOrderForm.components')}</Typography>
                    <Typography variant="caption" color={available ? 'success.main' : 'error.main'}>{t('enum.itemStatus.available')}: {available}</Typography>
                  <IconButton title={t('forms.factionOrderForm.showAssemblyContents')} size="small" onClick={() => setInfoAssembly(assembly)} aria-label={`${assembly.name}: ${t('forms.factionOrderForm.showContents')}`}><InfoOutlinedIcon fontSize="small" /></IconButton>
                    <Stack direction="row" sx={{ mt: 0.75, alignItems: 'center', justifyContent: 'space-between' }}>
                      <QuantityControl label={`${assembly.name} ${t('forms.factionOrderForm.quantity')}`} value={assemblyQuantities[assembly.id] ?? ''} onChange={(value) => setQuantity(assembly.id, value, true)} />
                    </Stack>
                    {isSelected && !isMobile && (

                      <IconButton title={t('forms.factionOrderForm.removeAll')} size="small" color="error" onClick={() => removeItem(assembly.id, true)} sx={{ position: 'absolute', top: 4, right: 4 }}><DeleteIcon fontSize="small" /></IconButton>

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
                  <Paper key={assembly.id} variant="outlined" sx={{ px: 0.75, py: 0.4, borderColor: quantity ? 'primary.main' : 'divider', bgcolor: quantity ? 'action.selected' : 'background.paper' }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                       {assembly.image ? <MediaImage src={apiFileUrl(assembly.image)} alt={assembly.name} sx={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 0.75, flexShrink: 0 }} /> : <Box sx={{ width: 36, height: 36, flexShrink: 0, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75 }}><CategoryIcon color="primary" fontSize="small" /></Box>}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700 }} noWrap>{assembly.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{Object.keys(assembly.itemQuantities ?? {}).length} {t('forms.factionOrderForm.components')} · {t('enum.itemStatus.available')}: {available}</Typography>
                      </Box>
                    <IconButton title={t('forms.factionOrderForm.showAssemblyContents')} size="small" onClick={() => setInfoAssembly(assembly)} aria-label={`${assembly.name}: ${t('forms.factionOrderForm.showContents')}`}><InfoOutlinedIcon fontSize="small" /></IconButton>
                      <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0 }}>
                        <QuantityControl label={`${assembly.name} ${t('forms.factionOrderForm.quantity')}`} value={assemblyQuantities[assembly.id] ?? ''} onChange={(value) => setQuantity(assembly.id, value, true)} />
                        {!isMobile && (
                          <Box sx={{ width: 34, flexShrink: 0 }}>
                            {quantity > 0 && (

                              <IconButton title={t('forms.factionOrderForm.removeAll')} size="small" color="error" onClick={() => removeItem(assembly.id, true)}><DeleteIcon fontSize="inherit" /></IconButton>

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
          {!visibleAssemblies.length && <Typography color="text.secondary">{t('common.noMatchingAssemblies')}</Typography>}
          <OrderCatalogPager count={visibleAssemblies.length} page={currentAssemblyPage} onPageChange={setAssemblyPage} />
        </Box>

        <Box>
          <Typography variant="h6">
            {isMobile ? t('forms.factionOrderForm.chooseItems') : t('forms.factionOrderForm.requestedItems')}
          </Typography>
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
                    sx={{ p: 1, position: 'relative', borderColor: isSelected ? 'primary.main' : 'divider', bgcolor: isSelected ? 'action.selected' : 'background.paper' }}
                  >
                    {image ? <MediaImage src={image} alt={item.name} sx={{ width: '100%', height: 76, objectFit: 'contain', borderRadius: 0.75, display: 'block', mb: 0.75 }} /> : <Box sx={{ height: 76, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75, mb: 0.75 }}><AddIcon color="disabled" /></Box>}
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.15, minHeight: '2.3em' }}>{item.name}</Typography>
                    <Typography variant="caption" color={available > 0 ? 'success.main' : 'error.main'}>{t('enum.itemStatus.available')}: {available}</Typography>
                    {/* Always reserve the line so the tile does not grow when the item is added. */}
                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, visibility: (orderDemandByItem.get(item.id) ?? 0) > 0 ? 'visible' : 'hidden' }} color={projected <= 0 ? 'error.main' : projected <= (item.minStock ?? 5) ? 'warning.main' : 'success.main'}>
                      {t('forms.factionOrderForm.afterOrder')}: {projected}
                    </Typography>
                    <Stack direction="row" sx={{ mt: 0.75, alignItems: 'center', justifyContent: 'space-between' }}>
                      <QuantityControl label={`${item.name} ${t('forms.factionOrderForm.quantity')}`} value={quantities[item.id] ?? ''} onChange={(value) => setQuantity(item.id, value)} />
                    </Stack>
                    {isSelected && !isMobile && (

                      <IconButton title={t('forms.factionOrderForm.removeAll')} size="small" color="error" onClick={() => removeItem(item.id)} sx={{ position: 'absolute', top: 4, right: 4 }}><DeleteIcon fontSize="small" /></IconButton>

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
                  <Paper key={item.id} variant="outlined" sx={{ px: 0.75, py: 0.4, borderColor: quantity ? 'primary.main' : 'divider', bgcolor: quantity ? 'action.selected' : 'background.paper' }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      {image
                        ? <MediaImage src={image} alt={item.name} sx={{ width: 36, height: 36, flexShrink: 0, objectFit: 'contain', borderRadius: 0.75 }} />
                        : <Box sx={{ width: 36, height: 36, flexShrink: 0, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75 }}><GridViewIcon color="disabled" fontSize="small" /></Box>}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700 }} noWrap>{item.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                          {item.category} · {t('enum.itemStatus.available')}: {available}
                          {(orderDemandByItem.get(item.id) ?? 0) > 0 && (
                            <Box component="span" sx={{ fontWeight: 700, color: projected <= 0 ? 'error.main' : projected <= (item.minStock ?? 5) ? 'warning.main' : 'success.main' }}>
                              {' · '}{t('forms.factionOrderForm.afterOrder')}: {projected}
                            </Box>
                          )}
                        </Typography>
                      </Box>
                      <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0 }}>
                        <QuantityControl label={`${item.name} ${t('forms.factionOrderForm.quantity')}`} value={quantities[item.id] ?? ''} onChange={(value) => setQuantity(item.id, value)} />
                        {!isMobile && (
                          <Box sx={{ width: 34, flexShrink: 0 }}>
                            {quantity > 0 && (

                              <IconButton title={t('forms.factionOrderForm.removeAll')} size="small" color="error" onClick={() => removeItem(item.id)}><DeleteIcon fontSize="inherit" /></IconButton>

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
          <QueryFeedback isLoading={orderable.isLoading || onOrder.isLoading} error={orderable.error || onOrder.error || previous.error} />
          {!orderable.isLoading && !pageItems.length && <Typography color="text.secondary">{t('common.noMatchingItems')}</Typography>}
          <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 1 }}>
            <Button disabled={itemPage <= 1 || orderable.isFetching} onClick={() => setItemPage(page => page - 1)}>{t('orders.orderCatalogPager.previous')}</Button>
            <Button disabled={!orderable.data?.more || orderable.isFetching} onClick={() => setItemPage(page => page + 1)}>{t('common.next')}</Button>
          </Stack>
        </Box>

        {selectedEntryCount > 0 && (
          <Box>
            <Divider sx={{ mb: 2 }} />
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="h6">{t('forms.factionOrderForm.currentOrder')}</Typography>
              <Chip
                size="small"
                color="primary"
                label={selectedEntryCount === 1
                  ? t('forms.factionOrderForm.1Entry')
                  : t('forms.factionOrderForm.selectedEntryCountEntries', { selectedEntryCount: selectedEntryCount })}
              />
            </Stack>
            {shortageCount > 0 && (
              <Alert severity="warning" sx={{ mb: 1 }}>
                {t('forms.factionOrderForm.thisOrderExceedsAvailableStockByShortageCountUnitsDeliveryIs', { shortageCount: shortageCount })}
              </Alert>
            )}
            <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {[
                ...selectedAssemblies.map((assembly) => ({
                  key: `selected-assembly-${assembly.id}`, id: assembly.id, name: assembly.name, assembly: true,
                  detail: `${t('enum.value.assembly')} · ${Object.keys(assembly.itemQuantities ?? {}).length} ${t('forms.factionOrderForm.components')}`,
                  value: assemblyQuantities[assembly.id] ?? '',
                })),
                ...selectedItems.map((item) => ({
                  key: `selected-item-${item.id}`, id: item.id, name: item.name, assembly: false,
                  detail: `${item.category} · ${t('enum.itemStatus.available')}: ${availableByItem.get(item.id) ?? 0}`,
                  value: quantities[item.id] ?? '',
                })),
              ].map((entry) => (
                <Stack key={entry.key} component="li" direction="row" spacing={1}
                  sx={{ alignItems: 'center', px: 1, py: 0.25, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{entry.name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{entry.detail}</Typography>
                  </Box>
                  <QuantityControl label={`${entry.name} ${t('forms.factionOrderForm.quantity')}`} value={entry.value} onChange={(value) => setQuantity(entry.id, value, entry.assembly)} />
                  <IconButton
                    title={entry.assembly
                      ? translate('forms.factionOrderForm.removeThisAssemblyFromTheOrderList')
                      : translate('forms.factionOrderForm.removeThisItemFromTheOrderList')}
                    size="small" color="error" onClick={() => removeItem(entry.id, entry.assembly)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Paper>
          </Box>
        )}

        <TextField
          label={t('common.notes')}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          multiline
          minRows={2}
        />
        <Button title={initialData
          ? translate('forms.factionOrderForm.updateTheOrderListWithTheChangedQuantities')
          : translate('forms.factionOrderForm.createTheOrderListWithTheseQuantities')}
          type="submit"
          variant="contained"
          size="large"
          startIcon={<SaveIcon />}
          disabled={isLoading || !selectedEvent || (Object.keys(currentQuantities).length === 0 && Object.keys(currentAssemblyQuantities).length === 0)}
        >
          {submitLabel ?? (initialData ? t('forms.factionOrderForm.updateOrderList') : t('forms.factionOrderForm.createOrderList'))}
        </Button>
      </Stack>
      <Dialog open={Boolean(infoAssembly)} onClose={() => setInfoAssembly(null)} fullWidth maxWidth="sm">
        <DialogTitle>{infoAssembly?.name}</DialogTitle>
        <DialogContent dividers>
          {infoAssembly?.description && <Typography sx={{ mb: 2 }}>{infoAssembly.description}</Typography>}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('forms.factionOrderForm.includedItems')}</Typography>
          <Stack spacing={0.75}>
            {Object.entries(infoAssembly?.itemQuantities ?? {}).map(([itemId, quantity]) => <Typography key={itemId}>{quantity} × {items.find((item) => item.id === itemId)?.name ?? itemId}</Typography>)}
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
