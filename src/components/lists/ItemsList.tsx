import { useAuth } from '../../hooks/useAuth';
import { useFactionCatalog } from '../../hooks/useFactionCatalog';
import { canEditCatalog } from '../../utils/access';
import { IconButton, Button, MenuItem } from '../shared/ActionButtons';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Box, Checkbox, FormControl, InputLabel, ListItemIcon, ListItemText, Menu, Paper, Link, Select, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { Item } from '../../types';
import { formatQuantity, getItemStock, stockRatio, type StockCalculation } from '../../utils/stock';
import { useAppLanguage, useT } from '../../utils/naming';
import type { EventType } from '../../types';
import { useStorageLocations } from '../../hooks/useStorageLocations';
import { useItemCategories, type ItemQuery } from '../../hooks/useItems';
import { locationPath, locationLabel } from '../../utils/locationHierarchy';
import { openCatalogRowInNewTab } from '../../utils/catalogNavigation';
import { StateMessage } from '../common/StateMessage';
import { catalogGridSx } from './catalogGrid';
import { CatalogRow, CatalogSearchBar, FilterSheet, type RowAction } from './CatalogParts';
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
    /** The page's scope switch, shown above the search beside bulk selection. */
    scope?: ReactNode;
    /** Hides search and filters for short bounded lists, e.g. an assembly's components. */
    searchFrom?: number;
    /**
     * Catalog mode: `items` are server pages already filtered by `query`; filter controls edit the query and
     * the remaining pages of `list` load in the background once the first page is shown. Without it, `items`
     * is a bounded set filtered here.
     */
    server?: { query: ItemQuery; onQueryChange: (query: ItemQuery) => void; list: { hasNextPage: boolean; isFetchingNextPage: boolean; isFetchNextPageError: boolean; fetchNextPage: () => unknown } };
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

export function ItemsList({ items, isLoading, loadingMore, loadError, onRetry, onCreate, onEdit, onDelete, onDeleteMany, requiredQuantities, onRemoveItem, locationStock, emptyHint, scope, searchFrom, server }: Props) {
    const { user } = useAuth();
    const canEditItem = (item: Item) => item.access?.privateResource ? item.access.canEdit : canEditCatalog(user);
    const canManage = Boolean(onEdit && onDelete && onDeleteMany);
    const navigate = useNavigate();
    const t = useT();
    const { eventTypes } = useFactionCatalog();
    const language = useAppLanguage();
    const theme = useTheme();
    const compact = useCompactCatalog();
    const narrowTable = useMediaQuery(theme.breakpoints.down('lg'));
    const [localEventType, setLocalEventType] = useState<EventType | ''>('');
    const [localSearch, setLocalSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selecting, setSelecting] = useState(false);
    const [localCategory, setLocalCategory] = useState('');
    // Catalog mode keeps the filters in the server query; a bounded list filters its own rows.
    const query = server?.query;
    const update = (patch: ItemQuery) => server?.onQueryChange({ ...server.query, ...patch });
    const eventType = (query ? query.eventType ?? '' : localEventType) as EventType | '';
    const setEventType = (value: EventType | '') => query ? update({ eventType: value || undefined }) : setLocalEventType(value);
    const search = query ? query.search ?? '' : localSearch;
    const setSearch = (value: string) => query ? update({ search: value || undefined }) : setLocalSearch(value);
    const category = query ? query.category ?? '' : localCategory;
    const setCategory = (value: string) => query ? update({ category: value || undefined }) : setLocalCategory(value);
    const locationIds: string[] = [...(query?.locationId ?? [])];
    const setLocationIds = (ids: string[]) => update({ locationId: ids.length ? ids : undefined });
    const serverCategories = useItemCategories();
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
    const [menu, setMenu] = useState<{ anchor: HTMLElement; row: ItemRow } | null>(null);
    const list = server?.list;
    const loadNextPage = Boolean(list?.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError);
    const fetchNextPage = list?.fetchNextPage;
    // Each finished page starts the next one; a failed page stops until the user retries it.
    useEffect(() => {
        if (loadNextPage) void fetchNextPage?.();
    }, [loadNextPage, fetchNextPage]);
    const locations = useStorageLocations({ includeInactive: true });
    const eventItems = (items ?? []).filter((item) => query || !eventType || item.eventTypes?.includes(eventType));
    const categories = query ? serverCategories.data ?? []
        : [...new Set(eventItems.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const locationOptions = new Map((locations.data ?? []).map((location) => [location.id, locationPath(location, locations.data ?? [])]));
    for (const item of eventItems) {
        if (item.storageLocation && !locationOptions.has(item.storageLocation)) {
            locationOptions.set(item.storageLocation, item.expand?.storageLocation?.name ?? item.storageLocation);
        }
    }
    const filterError = !locationStock && query && locations.error;
    const filtersLoading = false;
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
                availability: stock.remaining <= 0 ? 'none' : !locationStock && stock.remaining <= (item.minStock ?? 0) ? 'low' : 'ok',
                location: location ? [locationLabel(location), item.positionDetails].filter(Boolean).join(' · ') : item.storageLocation || '—',
                events: item.eventTypes?.join(', ') || '—',
            };
        });
    // Search applies everywhere; the compact layout's filter sheet adds category, event and location filters.
    const rows = query ? allRows : allRows
        .filter((row) => row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
        .filter((row) => !category || row.item.category === category);

    const availabilityColor = { none: 'error.main', low: 'warning.main', ok: 'success.main' } as const;
    /** Availability keeps its traffic-light color; damaged units always read as an error. */
    function availabilityText(row: ItemRow) {
        const base = stockRatio(row.stock, row.totalStock, row.item.isConsumable, row.item);
        const low = row.availability === 'low' ? ` · ${t('lists.itemsList.low')}` : '';
        return <>
            <Box component="span" sx={{ color: availabilityColor[row.availability] }}>{base + low}</Box>
            {row.damaged > 0 && <Box component="span" sx={{ color: 'error.main' }}> · {formatQuantity(row.item, row.damaged)} {t('lists.itemsList.damaged')}</Box>}
        </>;
    }

    function clearFilters() {
        if (query) { update({ category: undefined, eventType: undefined, locationId: undefined }); return; }
        setCategory('');
        setEventType('');
    }

    function rowActions(row: ItemRow): RowAction[] {
        const editable = canEditItem(row.item);
        return [
            ...(canManage && editable ? [
                { label: t('common.edit'), icon: <EditIcon fontSize="small" />, onClick: () => onEdit?.(row.item) },
                { label: t('common.delete'), icon: <DeleteIcon fontSize="small" />, onClick: () => onDelete?.(row.id), destructive: true },
            ] : []),
            ...(onRemoveItem ? [{ label: t('lists.itemsList.removeFromAssembly'), icon: <DeleteIcon fontSize="small" />, onClick: () => onRemoveItem(row.id), destructive: true }] : []),
        ];
    }

    const columns: GridColDef<ItemRow>[] = [
        { field: 'name', headerName: t('profile.name'), flex: 1.5, minWidth: 200,
            renderCell: ({ row }) => <Box sx={{ minWidth: 0 }}>
                <Link component={RouterLink} to={`/items/${row.id}`} onClick={(event) => event.stopPropagation()} underline="hover" color="text.primary" sx={{ fontWeight: 600, display: 'block', whiteSpace: 'normal', lineHeight: 1.3 }}>{row.name}</Link>
                {narrowTable && row.category && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{row.category}</Typography>}
            </Box> },
        ...(requiredQuantities ? [{ field: 'required', headerName: t('lists.itemsList.perAssembly'), type: 'number', width: 130, valueGetter: (_value: unknown, row: ItemRow) => requiredQuantities[row.id] ?? 1 } satisfies GridColDef<ItemRow>] : []),
        { field: 'category', headerName: t('common.category'), flex: 1, minWidth: 150, ...selectFilterColumn(allRows, (row) => [row.item.category]) },
        { field: 'stock', headerName: locationStock ? t('lists.itemsList.availableHere') : t('enum.itemStatus.available'), type: 'number', width: 210,
            renderCell: ({ row }) => <Typography variant="body2" className="tabular" sx={{ fontWeight: 600, whiteSpace: 'normal', lineHeight: 1.3, textAlign: 'right' }}>
                {availabilityText(row)}
            </Typography> },
        ...(!locationStock ? [{ field: 'location', headerName: t('enum.value.location'), flex: 1, minWidth: 150, ...selectFilterColumn(allRows, (row) => [row.location === '—' ? undefined : row.location]) } satisfies GridColDef<ItemRow>] : []),
        { field: 'events', headerName: t('nav.events'), width: 130, ...selectFilterColumn(allRows, (row) => row.item.eventTypes ?? []) },
        ...(canManage || onRemoveItem ? [{ field: 'actions', headerName: t('common.actions'), width: canManage ? 104 : 72, sortable: false, filterable: false,
            renderCell: ({ row }: { row: ItemRow }) => <Stack direction="row">
                {canManage && <IconButton disabled={!canEditItem(row.item)} title={t('common.edit')} onClick={(event) => { event.stopPropagation(); if (canEditItem(row.item)) onEdit?.(row.item); }}><EditIcon fontSize="small" /></IconButton>}
                {canManage && <IconButton disabled={!canEditItem(row.item)} title={t('common.delete')} color="error" onClick={(event) => { event.stopPropagation(); if (canEditItem(row.item)) onDelete?.(row.id); }}><DeleteIcon fontSize="small" /></IconButton>}
                {onRemoveItem && <IconButton title={t('lists.itemsList.removeFromAssembly')} color="error" onClick={(event) => { event.stopPropagation(); onRemoveItem(row.id); }}><DeleteIcon fontSize="small" /></IconButton>}
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
        <TextField select label={t('common.category')} value={category} size={compact ? 'medium' : 'small'} fullWidth
            onChange={(event) => setCategory(event.target.value)}>
            <MenuItem value="">{t('common.allCategories')}</MenuItem>
            {categories.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>
        <TextField select label={t('nav.event')} value={eventType} size={compact ? 'medium' : 'small'} fullWidth
            onChange={(event) => { setEventType(event.target.value as EventType | ''); setCategory(''); }}>
            <MenuItem value="">{t('lists.itemsList.allEvents')}</MenuItem>
            {eventTypes.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>
        {query && !locationStock && <FormControl size={compact ? 'medium' : 'small'} fullWidth sx={{ minWidth: 0 }}>
            <InputLabel id="item-location-filter-label">{t('lists.itemsList.locations')}</InputLabel>
            <Select multiple labelId="item-location-filter-label" label={t('lists.itemsList.locations')} value={locationIds}
                onChange={(event) => { const ids = typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value; setLocationIds(ids.includes('') ? [] : ids); }}
                renderValue={(ids) => ids.map((id) => locationOptions.get(id) ?? id).join(', ')}>
                <MenuItem value="">{t('lists.itemsList.allLocations')}</MenuItem>
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
        if (initialError) return <StateMessage kind="error" title={t('lists.itemsList.couldNotLoadItems')}
            description={t('lists.itemsList.theCatalogCannotBeReachedRightNowNothingHasBeen')}
            action={onRetry && <Button variant="contained" onClick={onRetry}>{t('common.tryAgain')}</Button>} />;
        if (initialLoading) return <StateMessage kind="loading" title={t('lists.itemsList.loadingItems')} />;
        if (empty) return <StateMessage kind="empty" title={t('lists.itemsList.noItemsYet')}
            description={emptyHint ?? t('lists.itemsList.addTheFirstItemOrImportACSVFile')}
            action={onCreate && <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>{t('common.addItem')}</Button>} />;
        if (noMatches) return <StateMessage kind="no-matches" title={t('lists.itemsList.noMatchingItems')}
            description={t('lists.itemsList.checkTheSpellingOrRemoveFilters')}
            action={<Button variant="outlined" onClick={() => { setSearch(''); clearFilters(); }}>{t('lists.itemsList.clearSearchAndFilters')}</Button>} />;
        if (compact) return <>
            <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }} aria-label={t('nav.items')}>
                {rows.slice(0, visibleCount).map((row) => <CatalogRow key={row.id}
                    to={`/items/${row.id}`}
                    title={row.name}
                    primary={<Box component="span" sx={{ fontWeight: 600 }}>{availabilityText(row)}</Box>}
                    secondary={requiredQuantities ? `${requiredQuantities[row.id] ?? 1}× ${t('lists.itemsList.perAssembly2')}` : undefined}
                    selectable={selecting && canEditItem(row.item)}
                    selected={selectedIds.has(row.id)}
                    onToggleSelected={() => toggleSelected(row.id)}
                    onOpenMenu={(anchor) => setMenu({ anchor, row })}
                />)}
            </Paper>
            {rows.length > visibleCount && <Button fullWidth variant="outlined" sx={{ mt: 1.5 }} onClick={() => setVisibleCount((count) => count + PAGE_STEP)}>
                {t('common.showMoreRemainingCountRemaining', { remainingCount: String(rows.length - visibleCount) })}
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

    const showSearch = !searchFrom || allRows.length >= searchFrom || Boolean(search) || activeFilters > 0;

    return <Box>
        {!showSearch ? null : compact ? <>
            <CatalogSearchBar scope={scope} search={search} onSearch={setSearch} label={t('common.searchItems')}
                activeFilters={activeFilters} onOpenFilters={() => setFiltersOpen(true)} onClearFilters={clearFilters}
                selecting={canManage ? selecting : undefined} onToggleSelecting={() => { setSelecting((value) => !value); setSelectedIds(new Set()); }} />
            <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} resultCount={rows.length} activeFilters={activeFilters} onClear={clearFilters}>
                {filterControls}
            </FilterSheet>
        </> : <>
            {scope && <Box sx={{ mb: 2 }}>{scope}</Box>}
            <TextField type="search" label={t('lists.itemsList.searchByName')} value={search}
                onChange={(event) => setSearch(event.target.value)} size="small" fullWidth sx={{ mb: 1.5 }} />
        </>}
        {filterError && <Alert severity="error" sx={{ mb: 1 }} action={<Button size="small" onClick={() => { void locations.refetch(); }}>{t('common.retry')}</Button>}>
            {t('lists.itemsList.couldNotLoadAllLocationFilterData')}
        </Alert>}
        {loadError && !initialError && <Alert severity="warning" sx={{ mb: 1.5 }} action={onRetry && <Button size="small" onClick={onRetry}>{t('common.retry')}</Button>}>
            {t('lists.itemsList.onlyItemCountItemsCouldBeLoadedTheListIsIncomplete', { itemCount: String(items?.length ?? 0) })}
        </Alert>}
        {canManage && selectedIds.size > 0 && <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1, pl: 2, mb: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }}>{t('lists.itemsList.selectedIdCountItemsSelected', { selectedIdCount: String(selectedIds.size) })}</Typography>
            <Button color="error" startIcon={<DeleteIcon />} onClick={() => onDeleteMany?.([...selectedIds])}>
                {t('lists.itemsList.deleteSelected')}
            </Button>
        </Paper>}
        {content}
        {list?.isFetchNextPageError && <Alert severity="warning" sx={{ mt: 1.5 }} action={<Button size="small" onClick={() => { void list.fetchNextPage(); }}>{t('common.retry')}</Button>}>
            {t('lists.itemsList.onlyItemCountItemsCouldBeLoadedTheListIsIncomplete', { itemCount: String(items?.length ?? 0) })}
        </Alert>}
        {(loadingMore || list?.isFetchingNextPage) && !initialLoading && <Typography variant="body2" color="text.secondary" role="status" sx={{ mt: 1 }}>{t('lists.itemsList.loadingMoreEntries')}</Typography>}
        <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
            <MenuItem component={RouterLink} to={menu ? `/items/${menu.row.id}` : '#'} onClick={() => setMenu(null)}>
                <ListItemText>{t('common.open')}</ListItemText>
            </MenuItem>
            {menu && rowActions(menu.row).map((action) => <MenuItem key={action.label} onClick={() => { setMenu(null); action.onClick(); }} sx={action.destructive ? { color: 'error.main' } : undefined}>
                <ListItemIcon sx={action.destructive ? { color: 'error.main' } : undefined}>{action.icon}</ListItemIcon>
                <ListItemText>{action.label}</ListItemText>
            </MenuItem>)}
        </Menu>
    </Box>;
}
