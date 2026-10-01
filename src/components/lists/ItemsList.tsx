import { IconButton, Button } from '../shared/ActionButtons';
import { useState } from 'react';
import { Alert, Box, Checkbox, FormControl, InputLabel, ListItemText, MenuItem, Paper, Select, Stack, TextField, Typography, useMediaQuery } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { useNavigate } from 'react-router-dom';
import type { Item } from '../../types';
import { getItemStock } from '../../utils/stock';
import { translate, useAppLanguage, useLocalizedText } from '../../utils/naming';
import { useUIStore } from '../../store/uiStore';
import { useStorageLocations } from '../../hooks/useStorageLocations';
import { useOperationList } from '../../hooks/useOperations';
import { operationsApi } from '../../services/operationsService';
import { locationPath } from '../../utils/locationHierarchy';

interface Props {
    items: Item[] | undefined;
    isLoading: boolean;
    loadingMore?: boolean;
    loadError?: boolean;
    onRetry?: () => void;
    onEdit?: (item: Item) => void;
    onDelete?: (id: string) => void;
    onDeleteMany?: (ids: string[]) => void;
    showAllEvents?: boolean;
}

type ItemRow = {
    id: string;
    item: Item;
    name: string;
    category: string;
    stock: number;
    totalStock: number;
    damaged: number;
    value: number;
    location: string;
    events: string;
};

export function ItemsList({ items, isLoading, loadingMore, loadError, onRetry, onEdit, onDelete, onDeleteMany, showAllEvents = false }: Props) {
    const canManage = Boolean(onEdit && onDelete && onDeleteMany);
    const navigate = useNavigate();
    const t = useLocalizedText();
    const language = useAppLanguage();
    const isMobile = useMediaQuery('(max-width:599.95px)');
    const activeEventType = useUIStore((state) => state.activeEventType);
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [locationIds, setLocationIds] = useState<string[]>([]);
    const [category, setCategory] = useState('');
    const locations = useStorageLocations({ includeInactive: true });
    const positions = useOperationList('positions:item-list', operationsApi.positions(), locationIds.length > 0);
    const assets = useOperationList('assets:item-list', operationsApi.assets(), locationIds.length > 0);
    const eventItems = (items ?? []).filter((item) => showAllEvents || item.eventTypes?.includes(activeEventType));
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
    const filterError = locations.error || (locationIds.length > 0 && (positions.error || assets.error));
    const filtersLoading = locationIds.length > 0 && (positions.isLoading || assets.isLoading ||
        (!positions.isError && !positions.isComplete) || (!assets.isError && !assets.isComplete));

    const rows: ItemRow[] = (() => eventItems
        .filter((item) => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
        .filter((item) => !category || item.category === category)
        .filter((item) => locationIds.length === 0 || locationIds.includes(item.storageLocation) || matchingItemIds.has(item.id))
        .map((item) => {
            const stock = getItemStock(item);
            const location = item.expand?.storageLocation;
            return {
                id: item.id,
                item,
                name: item.name,
                category: [item.category, item.subcategory].filter(Boolean).join(' · '),
                stock: stock.remaining,
                totalStock: stock.totalStock,
                damaged: stock.damaged,
                value: item.value ?? 0,
                location: location ? [location.name, location.location, location.position].filter(Boolean).join(' / ') : item.storageLocation || '—',
                events: item.eventTypes?.join(', ') || '—',
            };
        }))();

    const columns: GridColDef<ItemRow>[] = [
        { field: 'name', headerName: t('Name', 'Name'), flex: 1.5, minWidth: 180,
            renderCell: ({ row }) => <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.name}</Typography> },
        { field: 'category', headerName: t('Kategorie', 'Category'), flex: 1, minWidth: 150 },
        { field: 'stock', headerName: t('Bestand', 'Stock'), type: 'number', width: 155,
            renderCell: ({ row }) => <Typography variant="body2" sx={{ color: row.stock <= 0 ? 'error.main' : row.stock <= (row.item.minStock ?? 5) ? 'warning.main' : 'success.main', fontWeight: 700 }}>
                {row.stock}/{row.totalStock}{row.damaged > 0 ? ` · ${row.damaged} ${t('defekt', 'damaged')}` : ''}
            </Typography> },
        { field: 'value', headerName: t('Einzelwert', 'Unit value'), type: 'number', width: 125,
            valueFormatter: (value: number) => `${value.toFixed(2)} €` },
        { field: 'location', headerName: t('Lagerort', 'Storage location'), flex: 1, minWidth: 150 },
        { field: 'events', headerName: t('Events', 'Events'), width: 145 },
        ...(canManage ? [{ field: 'actions', headerName: t('Aktionen', 'Actions'), width: 110, sortable: false, filterable: false,
            renderCell: ({ row }: { row: ItemRow }) => <Stack direction="row">
              <IconButton title={t('Bearbeiten', 'Edit')} size="small" onClick={(event) => { event.stopPropagation(); onEdit?.(row.item); }}><EditIcon fontSize="small" /></IconButton>
              <IconButton title={t('Löschen', 'Delete')} size="small" color="error" onClick={(event) => { event.stopPropagation(); onDelete?.(row.id); }}><DeleteIcon fontSize="small" /></IconButton>
            </Stack> } satisfies GridColDef<ItemRow>] : []),
    ];

    function updateSelection(model: GridRowSelectionModel) {
        const ids = model.type === 'exclude'
            ? rows.map((row) => row.id).filter((id) => !model.ids.has(id))
            : [...model.ids].map(String);
        setSelectedIds(new Set(ids));
    }

    return <Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)' }, gap: 1, mb: 2 }}>
            <TextField label={t('Nach Name suchen', 'Search by name')} value={search}
                onChange={(event) => setSearch(event.target.value)} size="small" fullWidth />
            <TextField select label={t('Kategorie', 'Category')} value={category} size="small" fullWidth
                onChange={(event) => setCategory(event.target.value)}>
                <MenuItem value="">{t('Alle Kategorien', 'All categories')}</MenuItem>
                {categories.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
            </TextField>
            <FormControl size="small" fullWidth sx={{ minWidth: 0 }}>
                <InputLabel id="item-location-filter-label">{t('Lagerorte', 'Locations')}</InputLabel>
                <Select multiple labelId="item-location-filter-label" label={t('Lagerorte', 'Locations')} value={locationIds}
                    onChange={(event) => { const ids = typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value; setLocationIds(ids.includes('') ? [] : ids); }}
                    renderValue={(ids) => ids.map((id) => locationOptions.get(id) ?? id).join(', ')}>
                    <MenuItem value="">{t('Alle Lagerorte', 'All locations')}</MenuItem>
                    {[...locationOptions].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <MenuItem key={id} value={id}>
                        <Checkbox checked={locationIds.includes(id)} size="small" /><ListItemText primary={name} />
                    </MenuItem>)}
                </Select>
            </FormControl>
        </Box>
        {filterError && <Alert severity="error" sx={{ mb: 1 }} action={<Button size="small" onClick={() => { void locations.refetch(); void positions.refetch(); void assets.refetch(); }}>{t('Erneut laden', 'Retry')}</Button>}>
            {t('Lagerortfilter konnten nicht vollständig geladen werden.', 'Could not load all location filter data.')}
        </Alert>}
        {canManage && selectedIds.size > 0 && <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1, mb: 2 }}>
            <Typography sx={{ fontWeight: 700 }}>{t(`${selectedIds.size} Artikel ausgewählt`, `${selectedIds.size} items selected`)}</Typography>
            <Button title={translate('Das Löschen der ausgewählten Artikel bestätigen', 'Review deletion of the selected items')} color="error" size="small" startIcon={<DeleteIcon />} onClick={() => onDeleteMany?.([...selectedIds])}>
                {t('Auswahl löschen', 'Delete selected')}
            </Button>
        </Paper>}
        <Box sx={{ width: '100%' }}>
            <DataGrid rows={rows} columns={columns} loading={isLoading || filtersLoading} density="compact" rowHeight={isMobile ? 60 : 52} autoHeight checkboxSelection={canManage}
                disableRowSelectionOnClick onRowClick={({ row }) => navigate(`/items/${row.id}`)}
                rowSelectionModel={{ type: 'include', ids: selectedIds }} onRowSelectionModelChange={updateSelection}
                initialState={{ pagination: { paginationModel: { page: 0, pageSize: 20 } } }}
                pageSizeOptions={[20, 50, 100]} localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
                sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' },
                    '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' } }} />
        </Box>
        {loadingMore && <Typography variant="caption" color="text.secondary">{t('Weitere Einträge werden geladen…', 'Loading more entries…')}</Typography>}
        {loadError && <Button title={translate('Die Daten erneut laden', 'Retry loading the data')} size="small" onClick={onRetry}>{t('Weitere Einträge konnten nicht geladen werden. Erneut versuchen', 'Could not load more entries. Retry')}</Button>}
    </Box>;
}
