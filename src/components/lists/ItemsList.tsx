import { useState } from 'react';
import { Box, Button, IconButton, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { useNavigate } from 'react-router-dom';
import type { Item } from '../../types';
import { getItemStock } from '../../utils/stock';
import { useAppLanguage, useLocalizedText } from '../../utils/naming';
import { useUIStore } from '../../store/uiStore';
import { CatalogInstructionsDialog } from './CatalogInstructionsDialog';

interface Props {
    items: Item[] | undefined;
    isLoading: boolean;
    loadingMore?: boolean;
    loadError?: boolean;
    onRetry?: () => void;
    onEdit?: (item: Item) => void;
    onDelete?: (id: string) => void;
    onDeleteMany?: (ids: string[]) => void;
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

export function ItemsList({ items, isLoading, loadingMore, loadError, onRetry, onEdit, onDelete, onDeleteMany }: Props) {
    const canManage = Boolean(onEdit && onDelete && onDeleteMany);
    const navigate = useNavigate();
    const t = useLocalizedText();
    const language = useAppLanguage();
    const activeEventType = useUIStore((state) => state.activeEventType);
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [infoItem, setInfoItem] = useState<Item | null>(null);

    const rows: ItemRow[] = (() => (items ?? [])
        .filter((item) => item.eventTypes?.includes(activeEventType))
        .filter((item) => `${item.name} ${item.category} ${item.subcategory ?? ''} ${item.sku ?? ''}`
            .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
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
        { field: 'info', headerName: t('Hinweis', 'Instructions'), width: 90, sortable: false, filterable: false,
            renderCell: ({ row }) => <Tooltip title={t('Besondere Anweisungen anzeigen', 'Show special instructions')}>
                <IconButton color="info" size="small" aria-label={t(`Hinweise für ${row.name}`, `Instructions for ${row.name}`)}
                    onClick={(event) => { event.stopPropagation(); setInfoItem(row.item); }}>
                    <InfoOutlinedIcon fontSize="small" />
                </IconButton>
            </Tooltip> },
        ...(canManage ? [{ field: 'actions', headerName: t('Aktionen', 'Actions'), width: 110, sortable: false, filterable: false,
            renderCell: ({ row }: { row: ItemRow }) => <Stack direction="row">
                <Tooltip title={t('Bearbeiten', 'Edit')}><IconButton size="small" onClick={(event) => { event.stopPropagation(); onEdit?.(row.item); }}><EditIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title={t('Löschen', 'Delete')}><IconButton size="small" color="error" onClick={(event) => { event.stopPropagation(); onDelete?.(row.id); }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
            </Stack> } satisfies GridColDef<ItemRow>] : []),
    ];

    function updateSelection(model: GridRowSelectionModel) {
        const ids = model.type === 'exclude'
            ? rows.map((row) => row.id).filter((id) => !model.ids.has(id))
            : [...model.ids].map(String);
        setSelectedIds(new Set(ids));
    }

    return <Box>
        <TextField label={t('Nach Name oder Kategorie suchen', 'Search by name or category')} value={search}
            onChange={(event) => setSearch(event.target.value)} size="small" fullWidth sx={{ mb: 2 }} />
        {canManage && selectedIds.size > 0 && <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1, mb: 2 }}>
            <Typography sx={{ fontWeight: 700 }}>{t(`${selectedIds.size} Artikel ausgewählt`, `${selectedIds.size} items selected`)}</Typography>
            <Button color="error" size="small" startIcon={<DeleteIcon />} onClick={() => onDeleteMany?.([...selectedIds])}>
                {t('Auswahl löschen', 'Delete selected')}
            </Button>
        </Paper>}
        <Box sx={{ width: '100%' }}>
            <DataGrid rows={rows} columns={columns} loading={isLoading} density="compact" autoHeight checkboxSelection={canManage}
                disableRowSelectionOnClick onRowClick={({ row }) => { if (canManage) navigate(`/items/${row.id}`); }}
                rowSelectionModel={{ type: 'include', ids: selectedIds }} onRowSelectionModelChange={updateSelection}
                initialState={{ pagination: { paginationModel: { page: 0, pageSize: 20 } } }}
                pageSizeOptions={[20, 50, 100]} localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
                sx={{ '& .MuiDataGrid-row': { cursor: canManage ? 'pointer' : 'default' },
                    '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' } }} />
        </Box>
        {loadingMore && <Typography variant="caption" color="text.secondary">{t('Weitere Einträge werden geladen…', 'Loading more entries…')}</Typography>}
        {loadError && <Button size="small" onClick={onRetry}>{t('Weitere Einträge konnten nicht geladen werden. Erneut versuchen', 'Could not load more entries. Retry')}</Button>}
        <CatalogInstructionsDialog open={Boolean(infoItem)} title={infoItem?.name ?? ''} hint={infoItem?.hint}
            onClose={() => setInfoItem(null)} />
    </Box>;
}
