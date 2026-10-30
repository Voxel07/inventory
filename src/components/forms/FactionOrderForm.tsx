import { dateFieldValue, formatDate } from '../../utils/dateFormat';
import { useQuery } from '@tanstack/react-query';
import { itemApi, getItemCategories } from '../../services/inventoryService';
import { useItemsByIds } from '../../hooks/useItems';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { QueryFeedback } from '../common/QueryFeedback';
import { getPreviousFactionOrder } from '../../services/factionOrderService';
import { Button, ToggleButton, IconButton } from '../shared/ActionButtons';
import { MediaImage } from '../common/MediaImage';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { TextField } from '../shared/DateTextField';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CategoryIcon from '@mui/icons-material/Category';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewListIcon from '@mui/icons-material/ViewList';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import EditIcon from '@mui/icons-material/Edit';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { Dialog } from '../shared/ClosableDialog';
import { DialogContent, DialogTitle } from '@mui/material';
import type { Assembly, EventType, FactionOrder, FactionOrderSummary, FactionOrderFormData, Item, StorageLocation } from '../../types';
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
import { formatQuantity, getItemStock } from '../../utils/stock';
import { itemImageUrl } from '../../utils/itemImages';
import { apiFileUrl } from '../../services/apiClient';
import { toPositiveIntegerQuantities } from '../../utils/quantityMaps';
import { ListPagination } from '../shared/ListPagination';
import { ResizableScrollBox } from '../shared/ResizableScrollBox';
import { ServerListPagination } from '../shared/ServerListPagination';
import { useClientPagination } from '../../hooks/useClientPagination';
import { QuantityControl } from '../orders/QuantityControl';
import { OrderReviewGroup, OrderReviewLine, type ReviewStock } from '../orders/OrderReviewLine';
import { CatalogSearchField } from '../orders/CatalogSearchField';
import { ItemRequestEditor, ItemRequestLink, ItemRequestNoteInfo, ItemRequestOutcome, ItemRequestStatusChip } from '../orders/ItemRequests';
import { toItemRequestDrafts, toItemRequestInputs, type ItemRequestDraft } from '../../utils/itemRequests';
import { catalogPage, filterCatalogAssemblies } from '../../utils/orderCatalog';
import { OrderContentSelector, type OrderContentView } from '../orders/OrderContentSelector';

type ResourceViewMode = 'list' | 'tiles';
type FormStep = 'select' | 'review';
const PAGE_SIZE_OPTIONS = [25, 50, 100];

interface ReviewEntry {
  key: string;
  id: string;
  name: string;
  kind: 'assembly' | 'item' | 'request';
  detail?: string;
  value: string;
  /** Remaining stock after the whole order; requests have none. */
  stock?: ReviewStock;
  shortage: boolean;
  item?: Item;
  request?: ItemRequestDraft;
}

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
  // Closed events take no new orders.
  const eventOptions = events.filter((event) => event.eventType === eventType && event.status !== 'completed');
  const selectedEvent = eventOptions.find((event) => event.id === eventOccurrenceId) ?? eventOptions[0];
  const eventDate = selectedEvent?.startDate ?? selectedEvent?.eventDate ?? '';
  const [pickupDateOverride, setPickupDateOverride] = useState<{ eventId?: string; value: number | '' } | null>(
    initialData?.requestedPickupDate != null
      ? { eventId: initialData.eventOccurrenceId, value: initialData.requestedPickupDate }
      : null,
  );
  // Derive the default so it also follows events loaded after the dialog opens.
  const requestedPickupDate = pickupDateOverride && pickupDateOverride.eventId === selectedEvent?.id
    ? pickupDateOverride.value : eventDate;
  const eventEndDate = selectedEvent?.endDate ?? eventDate;
  const eventDateHint = !selectedEvent ? undefined : `${t('forms.factionOrderForm.eventDates')}: ${formatDate(eventDate)}${
    eventEndDate !== eventDate ? ` – ${formatDate(eventEndDate)}` : ''}`;
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [itemRequests, setItemRequests] = useState<ItemRequestDraft[]>(() => toItemRequestDrafts(initialData?.itemRequests));
  // Uncontrolled accordion: its default must not change after the first render.
  const [requestsInitiallyOpen] = useState(() => itemRequests.length > 0);
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initialData ? factionOrderItemBaseline(initialData) : {}).map(([id, value]) => [id, String(value)])),
  );
  const [assemblyQuantities, setAssemblyQuantities] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initialData ? factionOrderAssemblyBaseline(initialData) : {}).map(([id, value]) => [id, String(value)])),
  );
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [assemblyPage, setAssemblyPage] = useState(1);
  const [assemblyPageSize, setAssemblyPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [step, setStep] = useState<FormStep>('select');
  const [reviewSearch, setReviewSearch] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    formRef.current?.closest('.MuiDialogContent-root')?.scrollTo({ top: 0 });
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [step]);
  const [contentView, setContentView] = useState<OrderContentView>('all');
  const [viewMode, setViewMode] = useState<ResourceViewMode>(() => {
    const saved = window.localStorage.getItem('faction-order-resource-view');
    return saved === 'tiles' ? 'tiles' : 'list';
  });
  const [comparison, setComparison] = useState<FactionOrderSummary | undefined>();
  const [infoAssembly, setInfoAssembly] = useState<Assembly | null>(null);
  const catalogSearch = useDebouncedValue(search.trim());
  const orderable = useQuery({
    queryKey: ['items', 'orderable', eventType, catalogSearch, category, itemPage, itemPageSize],
    networkMode: 'offlineFirst',
    queryFn: () => itemApi.getPage({ eventType, includeUntagged: Boolean(catalogSearch), search: catalogSearch || undefined, category: category || undefined, sort: 'name' }, itemPage - 1, itemPageSize),
  });
  const sortedAssemblies = [...assemblies].sort((a, b) => a.name.localeCompare(b.name));
  const visibleAssemblies = filterCatalogAssemblies(sortedAssemblies, search,
    assembly => assembly.id in assemblyQuantities || Boolean(assembly.eventTypes?.includes(eventType)));
  const { page: currentAssemblyPage, entries: pageAssemblies } = catalogPage(visibleAssemblies, assemblyPage, assemblyPageSize);
  const previous = useQuery({ queryKey: ['faction-orders', 'previous', eventType, faction, eventDate, initialData?.id],
    enabled: Boolean(faction && eventDate), networkMode: 'offlineFirst',
    queryFn: () => getPreviousFactionOrder(eventType, faction, eventDate, initialData?.id) });
  const lastYear = comparison ?? previous.data;
  const lastYearItems = lastYear ? factionOrderItemBaseline(lastYear) : {};
  const lastYearAssemblies = lastYear ? factionOrderAssemblyBaseline(lastYear) : {};
  const lastYearLabel = lastYear ? String(new Date(lastYear.eventDate).getUTCFullYear()) : '';
  const requiredItemIds = [...Object.keys(quantities), ...Object.keys(lastYearItems),
    ...[...pageAssemblies, ...assemblies.filter(assembly => Number(assemblyQuantities[assembly.id]) > 0)].flatMap(assembly => Object.keys(assembly.itemQuantities ?? {}))];
  const onOrder = useItemsByIds(requiredItemIds);
  const items = [...new Map([...(orderable.data?.rows ?? []), ...(onOrder.data ?? [])].map(item => [item.id, item])).values()];
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
  const selectedEntryCount = Object.values(assemblyQuantities).filter(value => Number(value) > 0).length
    + Object.values(quantities).filter(value => Number(value) > 0).length;

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
  function projectedAssemblyStock(assembly: Assembly) {
    const components = Object.entries(assembly.itemQuantities ?? {}).filter(([, count]) => count > 0);
    // Keep deficits visible instead of clamping the remaining assembly count to zero.
    return components.length ? Math.min(...components.map(([itemId, count]) =>
      Math.floor((projectedStockByItem.get(itemId) ?? 0) / count))) : 0;
  }
  const itemHasShortage = (id: string) => (projectedStockByItem.get(id) ?? 0) < 0;
  const assemblyHasShortage = (assembly: Assembly) => Number(assemblyQuantities[assembly.id]) > 0
    && Object.keys(assembly.itemQuantities ?? {}).some(itemHasShortage);
  const reviewEntries: ReviewEntry[] = [
    ...selectedItems.map((item): ReviewEntry => ({
      key: `item-${item.id}`, id: item.id, name: item.name, kind: 'item', item,
      stock: { projected: projectedStockByItem.get(item.id) ?? 0, available: availableByItem.get(item.id) ?? 0, format: (quantity) => formatQuantity(item, quantity) },
      value: quantities[item.id] ?? '', shortage: itemHasShortage(item.id),
    })),
    ...selectedAssemblies.map((assembly): ReviewEntry => ({
      key: `assembly-${assembly.id}`, id: assembly.id, name: assembly.name, kind: 'assembly', detail: t('enum.value.assembly'),
      stock: { projected: projectedAssemblyStock(assembly), format: String },
      value: assemblyQuantities[assembly.id] ?? '', shortage: assemblyHasShortage(assembly),
    })),
    ...itemRequests.map((request): ReviewEntry => ({
      key: `request-${request.key}`, id: request.key, name: request.name, kind: 'request', request,
      detail: t('itemRequests.kind'), value: request.quantity, shortage: false,
    })),
  ].sort((a, b) => Number(b.shortage) - Number(a.shortage));
  const shortageLines = reviewEntries.filter((entry) => entry.shortage).length;
  const reviewTerm = reviewSearch.trim().toLocaleLowerCase();
  const filteredReview = reviewEntries.filter((entry) => `${entry.name} ${entry.detail ?? ''} ${entry.request?.note ?? ''}`.toLocaleLowerCase().includes(reviewTerm));
  const reviewPagination = useClientPagination(filteredReview, { initialPageSize: PAGE_SIZE_OPTIONS[0] });
  const droppedSinceLastYear = [
    ...Object.entries(lastYearItems).filter(([id, before]) => before > 0 && !(Number(quantities[id]) > 0))
      .map(([id, before]) => ({ key: `item-${id}`, id, assembly: false, before, name: items.find((item) => item.id === id)?.name ?? id })),
    ...Object.entries(lastYearAssemblies).filter(([id, before]) => before > 0 && !(Number(assemblyQuantities[id]) > 0))
      .map(([id, before]) => ({ key: `assembly-${id}`, id, assembly: true, before, name: assemblies.find((assembly) => assembly.id === id)?.name ?? id })),
  ].filter((entry) => entry.name.toLocaleLowerCase().includes(reviewTerm)).sort((a, b) => a.name.localeCompare(b.name));
  const selectedLineCount = selectedEntryCount + itemRequests.length;
  const canReview = Boolean(selectedEvent && faction && selectedLineCount);
  const canSave = canReview && !isLoading && !onOrder.isLoading && !onOrder.isError;
  const saveHint = `${initialData
    ? t('forms.factionOrderForm.updateTheOrderListWithTheChangedQuantities')
    : t('forms.factionOrderForm.createTheOrderListWithTheseQuantities')}${canReview ? '' : ` ${t('ordering.noSelection')}`}`;
  const baselineYear = previousOrder ? String(new Date(previousOrder.eventDate).getUTCFullYear()) : '';
  // Wide layouts only: the selected quantity next to last year's, e.g. "2026: 2 → 3".
  const lastYearChange = (before: number | undefined, value: string | undefined) => {
    const after = Number(value) || 0;
    if (!lastYear || !after || (before ?? 0) === after) return null;
    return <Chip size="small" variant="outlined" color={after > (before ?? 0) ? 'primary' : 'default'}
      label={`${lastYearLabel}: ${before ?? 0} → ${after}`} sx={{ display: { xs: 'none', md: 'inline-flex' }, flexShrink: 0 }} />;
  };
  // Review rows: last year's quantity whenever it differs, on every screen size.
  const lastYearNote = (before: number | undefined, value: string) => !lastYear || (before ?? 0) === (Number(value) || 0) ? null
    : <Typography variant="caption" color="text.secondary">{t('ordering.lastYearQuantity', { year: lastYearLabel, quantity: before ?? 0 })}</Typography>;
  const baselineLabel = previousOrder
    ? t('forms.factionOrderForm.useYearAsBaseline', { year: baselineYear })
    : t('forms.factionOrderForm.usePreviousYearAsBaseline');
  function copyPrevious() {
    if (!previousOrder) return;
    useUIStore.getState().showSnackbar(t('forms.factionOrderForm.baselineApplied', { year: baselineYear }), 'success');
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

  function reviewOrder() {
    if (canReview && !isLoading && formRef.current?.reportValidity()) setStep('review');
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step === 'select') {
      reviewOrder();
      return;
    }
    if (!selectedEvent || !canSave) return;
    const requestedQuantities = toPositiveIntegerQuantities(quantities);
    const requestedAssemblyQuantities = toPositiveIntegerQuantities(assemblyQuantities);
    onSubmit({
      eventType,
      eventOccurrenceId: selectedEvent.id,
      faction,
      eventDate,
      requestedPickupDate: requestedPickupDate === '' ? undefined : requestedPickupDate,
      itemIds: Object.keys(requestedQuantities),
      requestedQuantities,
      assemblyIds: Object.keys(requestedAssemblyQuantities),
      requestedAssemblyQuantities,
      itemRequests: toItemRequestInputs(itemRequests),
      notes: notes.trim(),
    });
  }

  return (
    <Box component="form" ref={formRef} onSubmit={submit} onKeyDown={(event) => {
      // Only the explicit actions advance or save; Enter in a search or quantity field must not.
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
    }}>
      <Stack spacing={2.5}>
        {step === 'select' && <>
        {/* The event period sits on the heading row, above the pickup date, so the fields keep one line. */}
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Typography variant="h6" component="h2" tabIndex={-1} ref={stepHeadingRef} sx={{ flex: 1 }}>{t('ordering.detailsStep')}</Typography>
          {eventDateHint && <Typography variant="caption" color="text.secondary">{eventDateHint}</Typography>}
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
          <FormControl fullWidth required>
            <InputLabel id="order-event-type-label">{t('nav.event')}</InputLabel>
            <Select
              labelId="order-event-type-label"
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
              {allowedEvents.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth required>
            <InputLabel id="order-faction-label">{t('common.faction')}</InputLabel>
            <Select labelId="order-faction-label" label={t('common.faction')} value={faction} onChange={(event) => setFaction(event.target.value)}>
              {allowedFactions(eventType).map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth required>
            <InputLabel id="order-event-label">{t('forms.factionOrderForm.yearlyEvent')}</InputLabel>
            <Select labelId="order-event-label" label={t('forms.factionOrderForm.yearlyEvent')} value={selectedEvent?.id ?? ''} onChange={(event) => setEventOccurrenceId(event.target.value)}>
              {eventOptions.map((entry) => <MenuItem key={entry.id} value={entry.id}>{entry.name}</MenuItem>)}
            </Select>
          </FormControl>
          {!eventOptions.length && <Alert severity="info" action={<Button title={translate('forms.factionOrderForm.openTheEventOverview')} component={RouterLink} to="/events">{t('forms.factionOrderForm.openEvents')}</Button>}>{t('forms.factionOrderForm.createAnEventForThisEventTypeFirst')}</Alert>}
          <TextField
            fullWidth
            type="date"
            label={t('forms.factionOrderForm.requestedPickupDateOptional')}
            value={requestedPickupDate}
            onChange={(event) => setPickupDateOverride({ eventId: selectedEvent?.id, value: dateFieldValue(event.target.value) })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>

        <Divider />
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ flex: 1, minWidth: 'max-content' }}>{t('ordering.itemsStep')}</Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}>
            <Box sx={{ flex: { xs: 1, sm: 'initial' } }}><OrderContentSelector value={contentView} onChange={setContentView} /></Box>
            <Tooltip arrow title={baselineLabel}>
              <Box component="span" tabIndex={previousOrder ? undefined : 0}>
                <IconButton aria-label={baselineLabel} color="primary" onClick={copyPrevious} disabled={!previousOrder}
                  sx={{ border: 1, borderColor: 'divider', borderRadius: 1, width: 44, height: 44 }}>
                  <ContentCopyIcon />
                </IconButton>
              </Box>
            </Tooltip>
          </Stack>
        </Stack>

        <Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
            <CatalogSearchField label={t('forms.factionOrderForm.searchAssembliesOrItems')}
              value={search} onChange={(value) => { setSearch(value); setItemPage(1); setAssemblyPage(1); }} />
            {contentView !== 'assemblies' && <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }}>
              <InputLabel id="order-category-label">{t('common.category')}</InputLabel>
              <Select labelId="order-category-label" label={t('common.category')} value={category} onChange={(event) => { setCategory(event.target.value); setItemPage(1); }}>
                <MenuItem value="">{t('common.allCategories')}</MenuItem>
                {categories.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </Select>
            </FormControl>}
            <ToggleButtonGroup
              exclusive
              size="small"
              value={viewMode}
              onChange={(_event, value: ResourceViewMode | null) => {
                if (!value) return;
                setViewMode(value);
                window.localStorage.setItem('faction-order-resource-view', value);
              }}
              color="primary"
              aria-label={t('forms.factionOrderForm.view')}
              sx={{ flexShrink: 0 }}
            >
              <ToggleButton title={translate('forms.factionOrderForm.displayTheCatalogAsAList')} value="list" aria-label={t('forms.factionOrderForm.listView')}><ViewListIcon /></ToggleButton>
              <ToggleButton title={translate('forms.factionOrderForm.displayTheCatalogAsTiles')} value="tiles" aria-label={t('forms.factionOrderForm.tileView')}><GridViewIcon /></ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Box>

        {contentView !== 'assemblies' && <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
            <Inventory2OutlinedIcon color="primary" />
            <Typography variant="h6">{t('nav.items')}</Typography>
          </Stack>
          {viewMode === 'tiles' ? (
            <ResizableScrollBox key={currentItemPage} storageKey="faction-order-items-height" defaultHeight={360} sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 1 }}>
              {pageItems.map((item) => {
                const isSelected = Number(quantities[item.id]) > 0;
                const image = itemImageUrl(item, undefined, '240x160');
                const available = availableByItem.get(item.id) ?? 0;
                const projected = projectedStockByItem.get(item.id) ?? available;
                return (
                  <Paper
                    key={item.id}
                    variant="outlined"
                    sx={{ p: 1, position: 'relative', display: 'flex', flexDirection: 'column', borderColor: projected < 0 ? 'warning.main' : isSelected ? 'primary.main' : 'divider', bgcolor: isSelected ? 'action.selected' : 'background.paper' }}
                  >
                    {image ? <MediaImage src={image} alt={item.name} sx={{ width: '100%', height: 76, objectFit: 'contain', borderRadius: 0.75, display: 'block', mb: 0.75 }} /> : <Box sx={{ height: 76, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75, mb: 0.75 }}><AddIcon color="disabled" /></Box>}
                    <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.3, minHeight: '2.6em', overflowWrap: 'anywhere' }}>{item.name}</Typography>
                    <Typography variant="body2" className="tabular" aria-label={`${t('enum.itemStatus.available')}: ${formatQuantity(item, projected)}`}
                      sx={{ mt: 0.5, fontWeight: 600, textAlign: 'center', color: projected < 0 ? 'warning.main' : projected > 0 ? 'success.main' : 'text.secondary' }}>
                      {formatQuantity(item, projected)}
                    </Typography>
                    <Stack direction="row" sx={{ mt: 0.75, alignItems: 'center', justifyContent: 'center' }}>
                      <QuantityControl label={`${item.name} ${t('forms.factionOrderForm.quantity')}`} value={quantities[item.id] ?? ''} onChange={(value) => setQuantity(item.id, value)} item={item}
                        onRemove={() => removeItem(item.id)} removeLabel={t('forms.factionOrderForm.removeAll')} />
                    </Stack>
                  </Paper>
                );
              })}
            </ResizableScrollBox>
          ) : (
            <ResizableScrollBox key={currentItemPage} storageKey="faction-order-items-height" defaultHeight={360} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {pageItems.map((item) => {
                const quantity = Number(quantities[item.id]) || 0;
                const available = availableByItem.get(item.id) ?? 0;
                const projected = projectedStockByItem.get(item.id) ?? available;
                return (
                  <Paper key={item.id} variant="outlined" sx={{ px: 0.75, py: 0.4, borderColor: projected < 0 ? 'warning.main' : quantity ? 'primary.main' : 'divider', bgcolor: quantity ? 'action.selected' : 'background.paper' }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Stack direction="row" spacing={1} sx={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                        <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{item.name}</Typography>
                        <Typography variant="body2" className="tabular"
                          aria-label={`${t('enum.itemStatus.available')}: ${formatQuantity(item, projected)}`} sx={{ color: projected < 0 ? 'warning.main' : projected > 0 ? 'success.main' : 'text.secondary', flexShrink: 0, whiteSpace: 'nowrap', fontWeight: 600, textAlign: 'center' }}>
                          {formatQuantity(item, projected)}
                        </Typography>
                      </Stack>
                      {lastYearChange(lastYearItems[item.id], quantities[item.id])}
                      <QuantityControl label={`${item.name} ${t('forms.factionOrderForm.quantity')}`} value={quantities[item.id] ?? ''} onChange={(value) => setQuantity(item.id, value)} item={item}
                        onRemove={() => removeItem(item.id)} removeLabel={t('forms.factionOrderForm.removeAll')} />
                    </Stack>
                  </Paper>
                );
              })}
            </ResizableScrollBox>
          )}
          <QueryFeedback isLoading={orderable.isLoading} error={orderable.error} />
          {!orderable.isLoading && !pageItems.length && <Typography color="text.secondary">{t('common.noMatchingItems')}</Typography>}
          <ServerListPagination page={itemPage - 1} size={itemPageSize} rowCount={pageItems.length}
            more={Boolean(orderable.data?.more)} loading={orderable.isFetching} pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={(page) => setItemPage(page + 1)} onSizeChange={(size) => { setItemPageSize(size); setItemPage(1); }} />
        </Box>}

        {contentView !== 'items' && <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
            <CategoryIcon color="primary" />
            <Typography variant="h6">
              {t('nav.assemblies')}
            </Typography>
          </Stack>
          {viewMode === 'tiles' ? (
            <ResizableScrollBox key={currentAssemblyPage} storageKey="faction-order-assemblies-height" defaultHeight={280} sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 1 }}>
              {pageAssemblies.map((assembly) => {
                const isSelected = Number(assemblyQuantities[assembly.id]) > 0;
                const projected = projectedAssemblyStock(assembly);
                return (
                  <Paper
                    key={assembly.id}
                    variant="outlined"
                    sx={{ p: 1, position: 'relative', display: 'flex', flexDirection: 'column', borderColor: projected < 0 ? 'warning.main' : isSelected ? 'primary.main' : 'divider', bgcolor: isSelected ? 'action.selected' : 'background.paper' }}
                  >
                    {assembly.image ? <MediaImage src={apiFileUrl(assembly.image)} alt={assembly.name} sx={{ width: '100%', height: 64, objectFit: 'contain', borderRadius: 0.75, display: 'block', mb: 0.75 }} /> : <Box sx={{ height: 64, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75, mb: 0.75 }}><CategoryIcon color="primary" /></Box>}
                    <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.3, minHeight: '2.6em', overflowWrap: 'anywhere' }}>{assembly.name}</Typography>
                    <Box sx={{ mt: 0.5, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 36 }}>
                      <Typography variant="body2" className="tabular" aria-label={`${t('enum.itemStatus.available')}: ${projected}`}
                        sx={{ fontWeight: 600, textAlign: 'center', color: projected < 0 ? 'warning.main' : projected > 0 ? 'success.main' : 'text.secondary' }}>{projected}</Typography>
                      <IconButton title={t('forms.factionOrderForm.showAssemblyContents')} size="small" onClick={() => setInfoAssembly(assembly)} aria-label={`${assembly.name}: ${t('forms.factionOrderForm.showContents')}`} sx={{ position: 'absolute', right: 0 }}><InfoOutlinedIcon fontSize="small" /></IconButton>
                    </Box>
                    <Stack direction="row" sx={{ mt: 0.75, alignItems: 'center', justifyContent: 'center' }}>
                      <QuantityControl label={`${assembly.name} ${t('forms.factionOrderForm.quantity')}`} value={assemblyQuantities[assembly.id] ?? ''} onChange={(value) => setQuantity(assembly.id, value, true)}
                        onRemove={() => removeItem(assembly.id, true)} removeLabel={t('forms.factionOrderForm.removeAll')} />
                    </Stack>
                  </Paper>
                );
              })}
            </ResizableScrollBox>
          ) : (
            <ResizableScrollBox key={currentAssemblyPage} storageKey="faction-order-assemblies-height" defaultHeight={280} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {pageAssemblies.map((assembly) => {
                const quantity = Number(assemblyQuantities[assembly.id]) || 0;
                const projected = projectedAssemblyStock(assembly);
                return (
                  <Paper key={assembly.id} variant="outlined" sx={{ px: 0.75, py: 0.4, borderColor: projected < 0 ? 'warning.main' : quantity ? 'primary.main' : 'divider', bgcolor: quantity ? 'action.selected' : 'background.paper' }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Stack direction="row" spacing={1} sx={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                        <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{assembly.name}</Typography>
                        <Typography variant="body2" className="tabular"
                          aria-label={`${t('enum.itemStatus.available')}: ${projected}`} sx={{ color: projected < 0 ? 'warning.main' : projected > 0 ? 'success.main' : 'text.secondary', flexShrink: 0, whiteSpace: 'nowrap', fontWeight: 600, textAlign: 'center' }}>
                          {projected}
                        </Typography>
                      </Stack>
                    <IconButton title={t('forms.factionOrderForm.showAssemblyContents')} size="small" onClick={() => setInfoAssembly(assembly)} aria-label={`${assembly.name}: ${t('forms.factionOrderForm.showContents')}`}><InfoOutlinedIcon fontSize="small" /></IconButton>
                      {lastYearChange(lastYearAssemblies[assembly.id], assemblyQuantities[assembly.id])}
                      <QuantityControl label={`${assembly.name} ${t('forms.factionOrderForm.quantity')}`} value={assemblyQuantities[assembly.id] ?? ''} onChange={(value) => setQuantity(assembly.id, value, true)}
                        onRemove={() => removeItem(assembly.id, true)} removeLabel={t('forms.factionOrderForm.removeAll')} />
                    </Stack>
                  </Paper>
                );
              })}
            </ResizableScrollBox>
          )}
          {!visibleAssemblies.length && <Typography color="text.secondary">{t('common.noMatchingAssemblies')}</Typography>}
          <ListPagination count={visibleAssemblies.length} page={currentAssemblyPage} onChange={setAssemblyPage}
            pageSize={assemblyPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={(size) => { setAssemblyPageSize(size); setAssemblyPage(1); }} />
        </Box>}

        <Accordion defaultExpanded={requestsInitiallyOpen} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>{t('itemRequests.title')}</Typography></AccordionSummary>
          <AccordionDetails><ItemRequestEditor value={itemRequests} onChange={setItemRequests} /></AccordionDetails>
        </Accordion>

        <TextField label={t('forms.factionOrderForm.orderNote')} value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={2} />
        </>}

        {step === 'review' && (
          <Stack spacing={1.5}>
            <Typography variant="h6" component="h2" tabIndex={-1} ref={stepHeadingRef}>{t('ordering.reviewStep')}</Typography>
            <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 1.5, py: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2">{selectedEvent?.name} · {faction}</Typography>
                <Typography variant="body2" color="text.secondary" role="status">
                  {t('common.requestedPickup')}: {requestedPickupDate === '' ? '—' : formatDate(requestedPickupDate)}
                  {' · '}{t('ordering.selectedLines', { count: selectedLineCount })}
                </Typography>
                {notes.trim() && <Typography variant="body2" color="text.secondary" noWrap title={notes.trim()}>
                  {t('forms.factionOrderForm.orderNote')}: {notes.trim()}
                </Typography>}
              </Box>
              <Button type="button" size="small" startIcon={<EditIcon />} disabled={isLoading} onClick={() => setStep('select')}>{t('common.edit')}</Button>
            </Paper>
            {/* Search only pays off on long lists. */}
            {reviewEntries.length > 10 && <CatalogSearchField label={t('ordering.searchOrder')} value={reviewSearch}
              onChange={(value) => { setReviewSearch(value); reviewPagination.setPage(1); }} />}
            <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}>
              {reviewPagination.pageItems.map((entry, index, page) => {
                const removeLabel = entry.kind === 'request' ? t('itemRequests.remove') : entry.kind === 'assembly'
                  ? t('forms.factionOrderForm.removeThisAssemblyFromTheOrderList') : t('forms.factionOrderForm.removeThisItemFromTheOrderList');
                const remove = () => {
                  if (entry.kind === 'request') setItemRequests((current) => current.filter((request) => request.key !== entry.id));
                  else removeItem(entry.id, entry.kind === 'assembly');
                };
                // Shortages sort first; captions mark where each group starts on this page.
                const groupStart = shortageLines > 0 && (index === 0 || page[index - 1].shortage !== entry.shortage);
                return <Fragment key={entry.key}>
                  {groupStart && <OrderReviewGroup label={entry.shortage ? t('ordering.needsAttention') : t('ordering.otherLines')} />}
                  <OrderReviewLine name={entry.name} stock={entry.stock}
                    details={<>
                      {entry.detail && <Typography variant="caption" color="text.secondary">{entry.detail}</Typography>}
                      {entry.request?.link && <Box sx={{ minWidth: 0, maxWidth: '60%' }}><ItemRequestLink link={entry.request.link} noWrap /></Box>}
                      {entry.request?.request && <ItemRequestOutcome request={entry.request.request} />}
                      {entry.kind === 'item' && lastYearNote(lastYearItems[entry.id], entry.value)}
                      {entry.kind === 'assembly' && lastYearNote(lastYearAssemblies[entry.id], entry.value)}
                    </>}
                    actions={<>
                      {entry.request && <ItemRequestNoteInfo note={entry.request.note} />}
                      {entry.request && <ItemRequestStatusChip status={entry.request.request?.status ?? 'open'} />}
                      {entry.request?.request && entry.request.request.status !== 'open'
                        ? <Typography variant="body2">{entry.value} ×</Typography>
                        : <QuantityControl label={`${entry.name} ${t('forms.factionOrderForm.quantity')}`} value={entry.value} item={entry.item}
                            onRemove={remove} removeLabel={removeLabel}
                            onChange={(value) => {
                              if (entry.kind !== 'request') setQuantity(entry.id, value, entry.kind === 'assembly');
                              else if (Number(value) >= 1) setItemRequests((current) => current.map((request) => request.key === entry.id ? { ...request, quantity: value } : request));
                            }} />}
                    </>} />
                </Fragment>;
              })}
              {!filteredReview.length && <Typography component="li" color="text.secondary" sx={{ p: 2 }}>{t('common.noMatchingItems')}</Typography>}
              {droppedSinceLastYear.length > 0 && <OrderReviewGroup label={t('ordering.notOrderedThisYear', { year: lastYearLabel })} />}
              {droppedSinceLastYear.map((entry) => <OrderReviewLine key={entry.key} name={entry.name}
                details={<>
                  {entry.assembly && <Typography variant="caption" color="text.secondary">{t('enum.value.assembly')}</Typography>}
                  <Typography variant="caption" color="text.secondary">{t('ordering.lastYearQuantity', { year: lastYearLabel, quantity: entry.before })}</Typography>
                </>}
                actions={<Button type="button" size="small" startIcon={<AddIcon />} onClick={() => setQuantity(entry.id, String(entry.before), entry.assembly)}>
                  {t('ordering.addAgain')}
                </Button>} />)}
              <Box component="li" sx={{ px: 0.5, py: 0.5, borderTop: 1, borderColor: 'divider' }}>
                <Button type="button" size="small" startIcon={<AddIcon />} disabled={isLoading} onClick={() => setStep('select')}>{t('ordering.addEquipment')}</Button>
              </Box>
            </Paper>
            {filteredReview.length > PAGE_SIZE_OPTIONS[0] && <ListPagination count={filteredReview.length} page={reviewPagination.page} onChange={reviewPagination.setPage}
              pageSize={reviewPagination.pageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} onPageSizeChange={reviewPagination.onPageSizeChange} />}
          </Stack>
        )}

        <QueryFeedback isLoading={onOrder.isLoading} error={onOrder.error || previous.error} />
        {/* Negative offset covers the dialog's bottom padding so rows never show below the actions. */}
        <Box sx={{ position: 'sticky', bottom: -16, bgcolor: 'background.paper', py: 1.5, zIndex: 1, borderTop: 1, borderColor: 'divider' }}>
          {/* The review summary shows the count itself. */}
          {step === 'select' && <Typography variant="body2" sx={{ mb: 1 }} role="status">{t('ordering.selectedLines', { count: selectedLineCount })}</Typography>}
          {step === 'select'
            ? <Button fullWidth type="button" variant="contained" size="large" endIcon={<ArrowForwardIcon />}
                title={canReview ? undefined : t('ordering.noSelection')} disabled={!canReview || isLoading} onClick={reviewOrder}>
                {t('ordering.reviewOrder')}
              </Button>
            : <Tooltip title={saveHint} arrow>
                <Box component="span" tabIndex={canSave ? undefined : 0} sx={{ display: 'block' }}>
                  <Button fullWidth type="submit" variant="contained" size="large" startIcon={<SaveIcon />} disabled={!canSave}>
                    {submitLabel ?? (initialData ? t('forms.factionOrderForm.updateOrderList') : t('ordering.saveDraft'))}
                  </Button>
                </Box>
              </Tooltip>}
        </Box>
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
