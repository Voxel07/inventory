import { useAuth } from '../../hooks/useAuth';
import { canEditCatalog } from '../../utils/access';
import { IconButton, Button, MenuItem } from '../shared/ActionButtons';
import { useState } from 'react';
import { Alert, Box, Checkbox, Drawer, FormControl, InputLabel, ListItemIcon, ListItemText, Menu, Paper, Link, Select, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { Item } from '../../types';
import { getItemStock, type StockCalculation } from '../../utils/stock';
import { useAppLanguage, useLocalizedText } from '../../utils/naming';
import { EVENT_TYPES, type EventType } from '../../types';
import { useStorageLocations } from '../../hooks/useStorageLocations';
import { useOperationList } from '../../hooks/useOperations';
import { operationsApi } from '../../services/operationsService';
import { locationPath } from '../../utils/locationHierarchy';
import { openCatalogRowInNewTab } from '../../utils/catalogNavigation';
import { StateMessage } from '../common/StateMessage';
import { catalogGridSx, CatalogRow, CatalogSearchBar, FilterSheetActions, type RowAction } from './CatalogParts';
import { useCompactCatalog } from '../../hooks/useCompactCatalog';
import { selectFilterColumn } from '../../utils/catalogFilters';

interface Props {
    items: Item[] | undefined;
    isLoading: boolean;
    loadingMore?: boolean;
    loadError?: boolean;
    onRetry?: () => void;
    onCreate?: () => void;
    onEdit?: (item: Item) => void;
    onDelete?: (id: string) => void;
    onDeleteMany?: (ids: string[]) => void;
    requiredQuantities?: Record<string, number>;
    onRemoveItem?: (id: string) => void;
    /** A location view uses local stock and omits the redundant location column/filter. */
    locationStock?: ReadonlyMap<string, StockCalculation>;
    /** Explains an empty list in the context it is shown in. */
    emptyHint?: string;
}

type Availability = 'none' | 'low' | 'ok';

type ItemRow = {
    id: string;
    item: Item;
    name: string;
    category: string;
    stock: number;
    totalStock: number;
    damaged: number;
    availability: Availability;
    location: string;
    events: string;
};

const PAGE_STEP = 30;

export function ItemsList({ items, isLoading, loadingMore, loadError, onRetry, onCreate, onEdit, onDelete, onDeleteMany, requiredQuantities, onRemoveItem, locationStock, emptyHint }: Props) {
    const { user } = useAuth();
    const canEditItem = (item: Item) => item.access?.privateResource ? item.access.canEdit : canEditCatalog(user);
    const canManage = Boolean(onEdit && onDelete && onDeleteMany);
    const navigate = useNavigate();
    const t = useLocalizedText();
    const language = useAppLanguage();
    const theme = useTheme();
    const compact = useCompactCatalog();
    const narrowTable = useMediaQuery(theme.breakpoints.down('lg'));
    const [eventType, setEventType] = useState<EventType | ''>('');
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selecting, setSelecting] = useState(false);
    const [locationIds, setLocationIds] = useState<string[]>([]);
    const [category, setCategory] = useState('');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
    const [menu, setMenu] = useState<{ anchor: HTMLElement; row: ItemRow } | null>(null);
    const locations = useStorageLocations({ includeInactive: true });
    const positions = useOperationList('positions:item-list', operationsApi.positions(), !locationStock && locationIds.length > 0);
    const assets = useOperationList('assets:item-list', operationsApi.assets(), !locationStock && locationIds.length > 0);
    const eventItems = (items ?? []).filter((item) => !eventType || item.eventTypes?.includes(eventType));
    const categories = [...new Set(eventItems.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const locationOptions = new Map((locations.data ?? []).map((location) => [location.id, locationPath(location, locations.data ?? [])]));
    for (const item of eventItems) {
        if (item.storageLocation && !locationOptions.has(item.storageLocation)) {
            locationOptions.set(item.storageLocation, item.expand?.storageLocation?.name ?? item.storageLocation);
        }
    }
    const matchingItemIds = new Set([
        ...(positions.data ?? []).filter((position) => locationIds.includes(position.locationId) && position.quantityOnHand > 0).map((position) => position.itemId),
        ...(assets.data ?? []).filter((asset) => asset.active && asset.currentLocationId && locationIds.includes(asset.currentLocationId)
            && !['lost', 'written_off'].includes(asset.availabilityStatus)).map((asset) => asset.itemId),
    ]);
    const filterError = !locationStock && (locations.error || (locationIds.length > 0 && (positions.error || assets.error)));
    const filtersLoading = !locationStock && locationIds.length > 0 && (positions.isLoading || assets.isLoading ||
        (!positions.isError && !positions.isComplete) || (!assets.isError && !assets.isComplete));
    const activeFilters = (category ? 1 : 0) + (eventType ? 1 : 0) + (locationIds.length ? 1 : 0);

    const allRows: ItemRow[] = eventItems
        .filter((item) => !locationStock || locationStock.has(item.id))
        .map((item): ItemRow => {
            const stock = locationStock?.get(item.id) ?? getItemStock(item);
            const location = item.expand?.storageLocation;
            return {
                id: item.id,
                item,
                name: item.name,
                category: [item.category, item.subcategory].filter(Boolean).join(' · '),
                stock: stock.remaining,
                totalStock: stock.totalStock,
                damaged: stock.damaged,
                availability: stock.remaining <= 0 ? 'none' : !locationStock && stock.remaining <= (item.minStock ?? 5) ? 'low' : 'ok',
                location: location ? [location.name, location.location, location.position].filter(Boolean).join(' / ') : item.storageLocation || '—',
                events: item.eventTypes?.join(', ') || '—',
            };
        });
    // Search applies everywhere; the compact layout's filter sheet adds category, event and location filters.
    const rows = allRows
        .filter((row) => row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
        .filter((row) => !category || row.item.category === category)
        .filter((row) => locationStock || locationIds.length === 0 || locationIds.includes(row.item.storageLocation) || matchingItemIds.has(row.id));

    const availabilityColor = { none: 'error.main', low: 'warning.main', ok: 'success.main' } as const;
    function availabilityText(row: ItemRow) {
        const base = row.availability === 'none'
            ? t('Nicht verfügbar', 'None available')
            : t(`${row.stock} von ${row.totalStock} verfügbar`, `${row.stock} of ${row.totalStock} available`);
        const low = row.availability === 'low' ? ` · ${t('niedrig', 'low')}` : '';
        const damaged = row.damaged > 0 ? ` · ${row.damaged} ${t('defekt', 'damaged')}` : '';
        return base + low + damaged;
    }

    function clearFilters() {
        setCategory('');
        setEventType('');
        setLocationIds([]);
    }

    function rowActions(row: ItemRow): RowAction[] {
        const editable = canEditItem(row.item);
        return [
            ...(canManage && editable ? [
                { label: t('Bearbeiten', 'Edit'), icon: <EditIcon fontSize="small" />, onClick: () => onEdit?.(row.item) },
                { label: t('Löschen', 'Delete'), icon: <DeleteIcon fontSize="small" />, onClick: () => onDelete?.(row.id), destructive: true },
            ] : []),
            ...(onRemoveItem ? [{ label: t('Aus Baugruppe entfernen', 'Remove from assembly'), icon: <DeleteIcon fontSize="small" />, onClick: () => onRemoveItem(row.id), destructive: true }] : []),
        ];
    }

    const columns: GridColDef<ItemRow>[] = [
        { field: 'name', headerName: t('Name', 'Name'), flex: 1.5, minWidth: 200,
            renderCell: ({ row }) => <Box sx={{ minWidth: 0 }}>
                <Link component={RouterLink} to={`/items/${row.id}`} onClick={(event) => event.stopPropagation()} underline="hover" color="text.primary" sx={{ fontWeight: 600, display: 'block', whiteSpace: 'normal', lineHeight: 1.3 }}>{row.name}</Link>
                {narrowTable && row.category && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{row.category}</Typography>}
            </Box> },
        ...(requiredQuantities ? [{ field: 'required', headerName: t('Menge je Baugruppe', 'Per assembly'), type: 'number', width: 130, valueGetter: (_value: unknown, row: ItemRow) => requiredQuantities[row.id] ?? 1 } satisfies GridColDef<ItemRow>] : []),
        { field: 'category', headerName: t('Kategorie', 'Category'), flex: 1, minWidth: 150, ...selectFilterColumn(allRows, (row) => [row.item.category]) },
        { field: 'stock', headerName: locationStock ? t('Verfügbar hier', 'Available here') : t('Verfügbar', 'Available'), type: 'number', width: 210,
            renderCell: ({ row }) => <Typography variant="body2" className="tabular" sx={{ color: availabilityColor[row.availability], fontWeight: 600, whiteSpace: 'normal', lineHeight: 1.3, textAlign: 'right' }}>
                {availabilityText(row)}
            </Typography> },
        ...(!locationStock ? [{ field: 'location', headerName: t('Lagerort', 'Location'), flex: 1, minWidth: 150, ...selectFilterColumn(allRows, (row) => [row.location === '—' ? undefined : row.location]) } satisfies GridColDef<ItemRow>] : []),
        { field: 'events', headerName: t('Events', 'Events'), width: 130, ...selectFilterColumn(allRows, (row) => row.item.eventTypes ?? []) },
        ...(canManage || onRemoveItem ? [{ field: 'actions', headerName: t('Aktionen', 'Actions'), width: canManage ? 104 : 72, sortable: false, filterable: false,
            renderCell: ({ row }: { row: ItemRow }) => <Stack direction="row">
                {canManage && <IconButton disabled={!canEditItem(row.item)} title={t('Bearbeiten', 'Edit')} onClick={(event) => { event.stopPropagation(); if (canEditItem(row.item)) onEdit?.(row.item); }}><EditIcon fontSize="small" /></IconButton>}
                {canManage && <IconButton disabled={!canEditItem(row.item)} title={t('Löschen', 'Delete')} color="error" onClick={(event) => { event.stopPropagation(); if (canEditItem(row.item)) onDelete?.(row.id); }}><DeleteIcon fontSize="small" /></IconButton>}
                {onRemoveItem && <IconButton title={t('Aus Baugruppe entfernen', 'Remove from assembly')} color="error" onClick={(event) => { event.stopPropagation(); onRemoveItem(row.id); }}><DeleteIcon fontSize="small" /></IconButton>}
            </Stack> } satisfies GridColDef<ItemRow>] : []),
    ];

    function updateSelection(model: GridRowSelectionModel) {
        const ids = model.type === 'exclude'
            ? rows.map((row) => row.id).filter((id) => !model.ids.has(id))
            : [...model.ids].map(String);
        setSelectedIds(new Set(ids.filter(id => rows.some(row => row.id === id && canEditItem(row.item)))));
    }

    function toggleSelected(id: string) {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    const filterControls = <>
        <TextField select label={t('Kategorie', 'Category')} value={category} size={compact ? 'medium' : 'small'} fullWidth
            onChange={(event) => setCategory(event.target.value)}>
            <MenuItem value="">{t('Alle Kategorien', 'All categories')}</MenuItem>
            {categories.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>
        <TextField select label={t('Event', 'Event')} value={eventType} size={compact ? 'medium' : 'small'} fullWidth
            onChange={(event) => { setEventType(event.target.value as EventType | ''); setCategory(''); }}>
            <MenuItem value="">{t('Alle Events', 'All events')}</MenuItem>
            {EVENT_TYPES.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>
        {!locationStock && <FormControl size={compact ? 'medium' : 'small'} fullWidth sx={{ minWidth: 0 }}>
            <InputLabel id="item-location-filter-label">{t('Lagerorte', 'Locations')}</InputLabel>
            <Select multiple labelId="item-location-filter-label" label={t('Lagerorte', 'Locations')} value={locationIds}
                onChange={(event) => { const ids = typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value; setLocationIds(ids.includes('') ? [] : ids); }}
                renderValue={(ids) => ids.map((id) => locationOptions.get(id) ?? id).join(', ')}>
                <MenuItem value="">{t('Alle Lagerorte', 'All locations')}</MenuItem>
                {[...locationOptions].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <MenuItem key={id} value={id}>
                    <Checkbox checked={locationIds.includes(id)} size="small" /><ListItemText primary={name} />
                </MenuItem>)}
            </Select>
        </FormControl>}
    </>;

    const initialLoading = !items && (isLoading || (!loadError && loadingMore));
    const initialError = !items?.length && loadError && !isLoading;
    const empty = !initialLoading && !initialError && (items?.length ?? 0) === 0;
    const noMatches = !initialLoading && !initialError && !empty && rows.length === 0 && !filtersLoading;

    const content = (() => {
        if (initialError) return <StateMessage kind="error" title={t('Artikel konnten nicht geladen werden', 'Could not load items')}
            description={t('Der Katalog ist gerade nicht erreichbar. Deine Daten sind nicht verloren.', 'The catalog cannot be reached right now. Nothing has been lost.')}
            action={onRetry && <Button variant="contained" onClick={onRetry}>{t('Erneut versuchen', 'Try again')}</Button>} />;
        if (initialLoading) return <StateMessage kind="loading" title={t('Artikel werden geladen…', 'Loading items…')} />;
        if (empty) return <StateMessage kind="empty" title={t('Noch keine Artikel', 'No items yet')}
            description={emptyHint ?? t('Lege den ersten Artikel an oder importiere eine CSV-Datei.', 'Add the first item or import a CSV file.')}
            action={onCreate && <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>{t('Artikel hinzufügen', 'Add item')}</Button>} />;
        if (noMatches) return <StateMessage kind="no-matches" title={t('Keine passenden Artikel', 'No matching items')}
            description={t('Prüfe die Schreibweise oder entferne Filter.', 'Check the spelling or remove filters.')}
            action={<Button variant="outlined" onClick={() => { setSearch(''); clearFilters(); }}>{t('Suche und Filter zurücksetzen', 'Clear search and filters')}</Button>} />;
        if (compact) return <>
            <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }} aria-label={t('Artikel', 'Items')}>
                {rows.slice(0, visibleCount).map((row) => <CatalogRow key={row.id}
                    to={`/items/${row.id}`}
                    title={row.name}
                    primary={<Box component="span" sx={{ color: availabilityColor[row.availability], fontWeight: 600 }}>{availabilityText(row)}</Box>}
                    primarySuffix={!locationStock && row.location !== '—' ? row.location : undefined}
                    secondary={[requiredQuantities ? `${requiredQuantities[row.id] ?? 1}× ${t('je Baugruppe', 'per assembly')}` : '', row.category, row.events !== '—' ? row.events : ''].filter(Boolean).join(' · ')}
                    selectable={selecting && canEditItem(row.item)}
                    selected={selectedIds.has(row.id)}
                    onToggleSelected={() => toggleSelected(row.id)}
                    onOpenMenu={(anchor) => setMenu({ anchor, row })}
                />)}
            </Paper>
            {rows.length > visibleCount && <Button fullWidth variant="outlined" sx={{ mt: 1.5 }} onClick={() => setVisibleCount((count) => count + PAGE_STEP)}>
                {t(`Weitere anzeigen (${rows.length - visibleCount} übrig)`, `Show more (${rows.length - visibleCount} remaining)`)}
            </Button>}
        </>;
        return <DataGrid rows={rows} columns={columns}
            columnVisibilityModel={{ category: !narrowTable, events: !narrowTable }}
            loading={isLoading || filtersLoading} density="compact" getRowHeight={() => 'auto'} autoHeight checkboxSelection={canManage}
            slotProps={{ row: { onAuxClick: event => openCatalogRowInNewTab(event, '/items') } }}
            isRowSelectable={({ row }) => canEditItem(row.item)} disableRowSelectionOnClick onRowClick={({ row }, event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey) navigate(`/items/${row.id}`); }}
            rowSelectionModel={{ type: 'include', ids: selectedIds }} onRowSelectionModelChange={updateSelection}
            initialState={{ pagination: { paginationModel: { page: 0, pageSize: 25 } } }}
            pageSizeOptions={[25, 50, 100]} localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
            sx={catalogGridSx} />;
    })();

    return <Box>
        {compact ? <>
            <CatalogSearchBar search={search} onSearch={setSearch} label={t('Artikel suchen', 'Search items')}
                activeFilters={activeFilters} onOpenFilters={() => setFiltersOpen(true)} onClearFilters={clearFilters}
                selecting={canManage ? selecting : undefined} onToggleSelecting={() => { setSelecting((value) => !value); setSelectedIds(new Set()); }} />
            <Drawer anchor="bottom" open={filtersOpen} onClose={() => setFiltersOpen(false)}
                slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85dvh', pb: 'env(safe-area-inset-bottom)' } } }}>
                <Stack spacing={2} sx={{ p: 2 }} role="group" aria-labelledby="item-filter-title">
                    <Typography id="item-filter-title" variant="h6" component="h2">{t('Filter', 'Filters')}</Typography>
                    {filterControls}
                    <FilterSheetActions resultCount={rows.length} activeFilters={activeFilters} onClear={clearFilters} onDone={() => setFiltersOpen(false)} />
                </Stack>
            </Drawer>
        </> : <TextField type="search" label={t('Nach Name suchen', 'Search by name')} value={search}
            onChange={(event) => setSearch(event.target.value)} size="small" fullWidth sx={{ mb: 1.5 }} />}
        {filterError && <Alert severity="error" sx={{ mb: 1 }} action={<Button size="small" onClick={() => { void locations.refetch(); void positions.refetch(); void assets.refetch(); }}>{t('Erneut laden', 'Retry')}</Button>}>
            {t('Lagerortfilter konnten nicht vollständig geladen werden.', 'Could not load all location filter data.')}
        </Alert>}
        {loadError && !initialError && <Alert severity="warning" sx={{ mb: 1.5 }} action={onRetry && <Button size="small" onClick={onRetry}>{t('Erneut laden', 'Retry')}</Button>}>
            {t(`Es konnten nur ${items?.length ?? 0} Artikel geladen werden. Die Liste ist unvollständig.`, `Only ${items?.length ?? 0} items could be loaded. The list is incomplete.`)}
        </Alert>}
        {canManage && selectedIds.size > 0 && <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1, pl: 2, mb: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }}>{t(`${selectedIds.size} Artikel ausgewählt`, `${selectedIds.size} items selected`)}</Typography>
            <Button color="error" startIcon={<DeleteIcon />} onClick={() => onDeleteMany?.([...selectedIds])}>
                {t('Auswahl löschen', 'Delete selected')}
            </Button>
        </Paper>}
        {content}
        {loadingMore && !initialLoading && <Typography variant="body2" color="text.secondary" role="status" sx={{ mt: 1 }}>{t('Weitere Einträge werden geladen…', 'Loading more entries…')}</Typography>}
        <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
            <MenuItem component={RouterLink} to={menu ? `/items/${menu.row.id}` : '#'} onClick={() => setMenu(null)}>
                <ListItemText>{t('Öffnen', 'Open')}</ListItemText>
            </MenuItem>
            {menu && rowActions(menu.row).map((action) => <MenuItem key={action.label} onClick={() => { setMenu(null); action.onClick(); }} sx={action.destructive ? { color: 'error.main' } : undefined}>
                <ListItemIcon sx={action.destructive ? { color: 'error.main' } : undefined}>{action.icon}</ListItemIcon>
                <ListItemText>{action.label}</ListItemText>
            </MenuItem>)}
        </Menu>
    </Box>;
}
