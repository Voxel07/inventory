import { useEffect, useMemo, useState } from 'react';
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
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CategoryIcon from '@mui/icons-material/Category';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import SaveIcon from '@mui/icons-material/Save';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewListIcon from '@mui/icons-material/ViewList';
import type { Assembly, EventType, FactionOrder, FactionOrderFormData, Item, StorageLocation } from '../../types';
import { EVENT_TYPES, FACTIONS_BY_EVENT } from '../../types';
import { useTranslate } from '../../utils/naming';
import {
  factionOrderAssemblyBaseline,
  factionOrderItemBaseline,
  findPreviousFactionOrder,
} from '../../utils/factionOrderHistory';
import { useUIStore } from '../../store/uiStore';
import { useTransactions } from '../../hooks/useTransactions';
import { useDamageReports } from '../../hooks/useDamageReports';
import { calculateItemStock } from '../../utils/stock';
import { itemImageUrl } from '../../utils/itemImages';
import { assemblyAvailability } from '../../utils/factionOrderQuantities';

type ResourceViewMode = 'list' | 'tiles';

interface Props {
  items: Item[];
  assemblies: Assembly[];
  storageLocations: StorageLocation[];
  orders: FactionOrder[];
  initialData?: FactionOrder;
  defaultEventType?: EventType;
  defaultFaction?: string;
  submitLabel?: string;
  isLoading?: boolean;
  allowedFactionKeys?: string[];
  onSubmit: (data: FactionOrderFormData) => void;
}

function numericValues(values: Record<string, string>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([id, value]) => [id, Number(value)] as const)
      .filter(([, value]) => Number.isInteger(value) && value > 0),
  );
}

export function FactionOrderForm({
  items,
  assemblies,
  storageLocations,
  orders,
  initialData,
  defaultEventType = 'DE',
  defaultFaction,
  submitLabel,
  isLoading,
  allowedFactionKeys,
  onSubmit,
}: Props) {
  const t = useTranslate();
  const setActiveEventType = useUIStore((state) => state.setActiveEventType);
  const initialEventType = initialData?.eventType ?? defaultEventType;
  const allowedEvents = EVENT_TYPES.filter((type) => !allowedFactionKeys || FACTIONS_BY_EVENT[type].some((candidate) => allowedFactionKeys.includes(`${type}:${candidate}`)));
  const allowedFactions = (type: EventType) => FACTIONS_BY_EVENT[type].filter((candidate) => !allowedFactionKeys || allowedFactionKeys.includes(`${type}:${candidate}`));
  const [eventType, setEventType] = useState<EventType>(initialEventType);
  const [faction, setFaction] = useState(
    initialData?.faction ?? defaultFaction ?? allowedFactions(initialEventType)[0] ?? '',
  );
  const [eventDate, setEventDate] = useState(
    initialData?.eventDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [pickupLocation, setPickupLocation] = useState(initialData?.pickupLocation ?? storageLocations[0]?.id ?? '');
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initialData ? factionOrderItemBaseline(initialData) : {}).map(([id, value]) => [id, String(value)])),
  );
  const [assemblyQuantities, setAssemblyQuantities] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initialData ? factionOrderAssemblyBaseline(initialData) : {}).map(([id, value]) => [id, String(value)])),
  );
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ResourceViewMode>(() => {
    const saved = window.localStorage.getItem('faction-order-resource-view');
    return saved === 'list' ? 'list' : 'tiles';
  });
  const [comparison, setComparison] = useState<FactionOrder | undefined>();
  const { data: transactions } = useTransactions();
  const { data: damageReports } = useDamageReports();

  const availableByItem = useMemo(() => new Map(items.map((item) => [
    item.id,
    calculateItemStock(item.id, transactions, damageReports, item.amount ?? 0).remaining,
  ])), [damageReports, items, transactions]);

  useEffect(() => {
    if (initialData) return;
    setEventType(defaultEventType);
    setFaction(
      defaultFaction && allowedFactions(defaultEventType).includes(defaultFaction)
        ? defaultFaction
        : allowedFactions(defaultEventType)[0] ?? '',
    );
  }, [defaultEventType, defaultFaction, initialData]);

  useEffect(() => {
    if (!pickupLocation && storageLocations[0]) setPickupLocation(storageLocations[0].id);
  }, [pickupLocation, storageLocations]);

  useEffect(() => {
    const options = allowedFactions(eventType);
    if (!options.includes(faction)) setFaction(options[0] ?? '');
  }, [eventType, faction, allowedFactionKeys]);

  const previousOrder = useMemo(
    () => findPreviousFactionOrder(orders, {
      eventType,
      faction,
      eventDate,
      excludeId: initialData?.id,
    }),
    [eventDate, eventType, faction, initialData?.id, orders],
  );

  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return items
      .filter((item) => {
        if (Number(quantities[item.id]) > 0) return true;
        if (term) return `${item.name} ${item.category} ${item.subcategory ?? ''}`.toLocaleLowerCase().includes(term);
        return item.eventTypes?.includes(eventType);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [eventType, items, quantities, search]);

  const visibleAssemblies = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return assemblies
      .filter((assembly) => {
        if (Number(assemblyQuantities[assembly.id]) > 0) return true;
        if (term) return `${assembly.name} ${assembly.description ?? ''}`.toLocaleLowerCase().includes(term);
        return assembly.eventTypes?.includes(eventType);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assemblies, assemblyQuantities, eventType, search]);

  const currentQuantities = numericValues(quantities);
  const currentAssemblyQuantities = numericValues(assemblyQuantities);
  const changes = useMemo(() => {
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
  }, [assemblies, comparison, currentAssemblyQuantities, currentQuantities, items]);

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
    if (previousOrder.pickupLocation) setPickupLocation(previousOrder.pickupLocation);
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

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const requestedQuantities = numericValues(quantities);
    const requestedAssemblyQuantities = numericValues(assemblyQuantities);
    onSubmit({
      eventType,
      faction,
      eventDate,
      pickupLocation,
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
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <FormControl fullWidth>
            <InputLabel>{t('Event', 'Event')}</InputLabel>
            <Select
              label={t('Event', 'Event')}
              value={eventType}
              onChange={(event) => {
                const value = event.target.value as EventType;
                setEventType(value);
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
          <TextField
            fullWidth
            type="date"
            label={t('Eventdatum', 'Event date')}
            value={eventDate}
            onChange={(event) => setEventDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            required
          />
          <FormControl fullWidth required>
            <InputLabel>{t('Abholort', 'Pickup location')}</InputLabel>
            <Select
              label={t('Abholort', 'Pickup location')}
              value={pickupLocation}
              onChange={(event) => setPickupLocation(event.target.value)}
            >
              {storageLocations.map((location) => (
                <MenuItem key={location.id} value={location.id}>
                  {[location.name, location.area, location.position].filter(Boolean).join(' · ')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

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
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField
              fullWidth
              size="small"
              label={t('Baugruppen oder Artikel suchen', 'Search assemblies or items')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
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
            <Typography variant="h6">{t('Benötigte Baugruppen', 'Requested assemblies')}</Typography>
          </Stack>
          {viewMode === 'tiles' ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 1, maxHeight: { xs: '42vh', sm: 330 }, overflowY: 'auto', pr: 0.5 }}>
              {visibleAssemblies.map((assembly) => {
                const isSelected = Number(assemblyQuantities[assembly.id]) > 0;
                const available = assemblyAvailability(assembly, (itemId) => availableByItem.get(itemId) ?? 0);
                return (
                  <Paper
                    key={assembly.id}
                    variant="outlined"
                    sx={{ p: 1, borderColor: isSelected ? 'primary.main' : 'divider', bgcolor: isSelected ? 'rgba(227, 6, 19, 0.045)' : 'background.paper' }}
                  >
                    <Box sx={{ height: 64, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75, mb: 0.75 }}><CategoryIcon color="primary" /></Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.15, minHeight: '2.3em' }}>{assembly.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{Object.keys(assembly.itemQuantities ?? {}).length} {t('Komponenten', 'components')}</Typography>
                    <Typography variant="caption" color={available ? 'success.main' : 'error.main'}>{t('Verfügbar', 'Available')}: {available}</Typography>
                    <Stack direction="row" sx={{ mt: 0.75, alignItems: 'center', justifyContent: 'space-between' }}>
                      <IconButton size="small" disabled={!isSelected} onClick={() => changeQuantity(assembly.id, -1, true)}><RemoveIcon fontSize="small" /></IconButton>
                      <Typography sx={{ fontWeight: 800 }}>{assemblyQuantities[assembly.id] ?? 0}</Typography>
                      <IconButton size="small" color="primary" onClick={() => changeQuantity(assembly.id, 1, true)}><AddIcon fontSize="small" /></IconButton>
                    </Stack>
                  </Paper>
                );
              })}
            </Box>
          ) : (
            <Stack spacing={0.75} sx={{ maxHeight: { xs: '42vh', sm: 330 }, overflowY: 'auto', pr: 0.5 }}>
              {visibleAssemblies.map((assembly) => {
                const quantity = Number(assemblyQuantities[assembly.id]) || 0;
                const available = assemblyAvailability(assembly, (itemId) => availableByItem.get(itemId) ?? 0);
                return (
                  <Paper key={assembly.id} variant="outlined" sx={{ p: 0.75, borderColor: quantity ? 'primary.main' : 'divider', bgcolor: quantity ? 'rgba(227, 6, 19, 0.045)' : 'background.paper' }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Box sx={{ width: 44, height: 44, flexShrink: 0, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75 }}><CategoryIcon color="primary" /></Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700 }} noWrap>{assembly.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{Object.keys(assembly.itemQuantities ?? {}).length} {t('Komponenten', 'components')} · {t('Verfügbar', 'Available')}: {available}</Typography>
                      </Box>
                      <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0 }}>
                        <IconButton size="small" disabled={!quantity} onClick={() => changeQuantity(assembly.id, -1, true)}><RemoveIcon fontSize="small" /></IconButton>
                        <Typography sx={{ width: 28, textAlign: 'center', fontWeight: 800 }}>{quantity}</Typography>
                        <IconButton size="small" color="primary" onClick={() => changeQuantity(assembly.id, 1, true)}><AddIcon fontSize="small" /></IconButton>
                      </Stack>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
          {!visibleAssemblies.length && <Typography color="text.secondary">{t('Keine passenden Baugruppen.', 'No matching assemblies.')}</Typography>}
        </Box>

        <Box>
          <Typography variant="h6">{t('Benötigte Artikel', 'Requested items')}</Typography>
          {viewMode === 'tiles' ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 1, maxHeight: { xs: '52vh', sm: 440 }, overflowY: 'auto', pr: 0.5 }}>
              {visibleItems.map((item) => {
                const isSelected = Number(quantities[item.id]) > 0;
                const image = itemImageUrl(item, undefined, '240x160');
                return (
                  <Paper
                    key={item.id}
                    variant="outlined"
                    sx={{ p: 1, borderColor: isSelected ? 'primary.main' : 'divider', bgcolor: isSelected ? 'rgba(227, 6, 19, 0.045)' : 'background.paper' }}
                  >
                    {image ? <Box component="img" src={image} alt={item.name} sx={{ width: '100%', height: 76, objectFit: 'cover', borderRadius: 0.75, display: 'block', mb: 0.75 }} /> : <Box sx={{ height: 76, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75, mb: 0.75 }}><AddIcon color="disabled" /></Box>}
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.15, minHeight: '2.3em' }}>{item.name}</Typography>
                    <Typography variant="caption" color={availableByItem.get(item.id) ? 'success.main' : 'error.main'}>{t('Verfügbar', 'Available')}: {availableByItem.get(item.id) ?? 0}</Typography>
                    <Stack direction="row" sx={{ mt: 0.75, alignItems: 'center', justifyContent: 'space-between' }}>
                      <IconButton size="small" disabled={!isSelected} onClick={() => changeQuantity(item.id, -1)}><RemoveIcon fontSize="small" /></IconButton>
                      <Typography sx={{ fontWeight: 800 }}>{quantities[item.id] ?? 0}</Typography>
                      <IconButton size="small" color="primary" onClick={() => changeQuantity(item.id, 1)}><AddIcon fontSize="small" /></IconButton>
                    </Stack>
                  </Paper>
                );
              })}
            </Box>
          ) : (
            <Stack spacing={0.75} sx={{ maxHeight: { xs: '52vh', sm: 440 }, overflowY: 'auto', pr: 0.5 }}>
              {visibleItems.map((item) => {
                const quantity = Number(quantities[item.id]) || 0;
                const image = itemImageUrl(item, undefined, '96x96');
                return (
                  <Paper key={item.id} variant="outlined" sx={{ p: 0.75, borderColor: quantity ? 'primary.main' : 'divider', bgcolor: quantity ? 'rgba(227, 6, 19, 0.045)' : 'background.paper' }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      {image
                        ? <Box component="img" src={image} alt={item.name} sx={{ width: 48, height: 48, flexShrink: 0, objectFit: 'cover', borderRadius: 0.75 }} />
                        : <Box sx={{ width: 48, height: 48, flexShrink: 0, bgcolor: 'grey.100', display: 'grid', placeItems: 'center', borderRadius: 0.75 }}><GridViewIcon color="disabled" /></Box>}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700 }} noWrap>{item.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{item.category} · {t('Verfügbar', 'Available')}: {availableByItem.get(item.id) ?? 0}</Typography>
                      </Box>
                      <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0 }}>
                        <IconButton size="small" disabled={!quantity} onClick={() => changeQuantity(item.id, -1)}><RemoveIcon fontSize="small" /></IconButton>
                        <Typography sx={{ width: 28, textAlign: 'center', fontWeight: 800 }}>{quantity}</Typography>
                        <IconButton size="small" color="primary" onClick={() => changeQuantity(item.id, 1)}><AddIcon fontSize="small" /></IconButton>
                      </Stack>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
          {!visibleItems.length && <Typography color="text.secondary">{t('Keine passenden Artikel.', 'No matching items.')}</Typography>}
        </Box>

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
          disabled={isLoading || !pickupLocation || (Object.keys(currentQuantities).length === 0 && Object.keys(currentAssemblyQuantities).length === 0)}
        >
          {submitLabel ?? t('Bestellliste erstellen', 'Create order list')}
        </Button>
      </Stack>
    </Box>
  );
}
