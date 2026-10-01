import { IconButton, Button } from '../shared/ActionButtons';
import { useState } from 'react';
import { Box, Link, Paper, Stack, TextField,  Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { Assembly, Item } from '../../types';
import { translate, useAppLanguage, useLocalizedText } from '../../utils/naming';
import { assemblyAvailability } from '../../utils/factionOrderQuantities';
import { getItemStock } from '../../utils/stock';
import { openCatalogRowInNewTab } from '../../utils/catalogNavigation';

interface Props {
    assemblies: Assembly[] | undefined;
    items: Item[] | undefined;
    isLoading: boolean;
    loadingMore?: boolean;
    loadError?: boolean;
    onRetry?: () => void;
    onEdit?: (assembly: Assembly) => void;
    onDelete?: (id: string) => void;
    onDeleteMany?: (ids: string[]) => void;
}

type AssemblyPart = { id: string; name: string; quantity: number };
type AssemblyRow = {
    id: string;
    assembly: Assembly;
    name: string;
    description: string;
    parts: AssemblyPart[];
    components: string;
    stock: number;
    totalStock: number;
    stockReady: boolean;
    totalValue: number;
};

export function AssembliesList({ assemblies, items, isLoading, loadingMore, loadError, onRetry, onEdit, onDelete, onDeleteMany }: Props) {
    const canManage = Boolean(onEdit && onDelete && onDeleteMany);
    const t = useLocalizedText();
    const language = useAppLanguage();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const rows: AssemblyRow[] = (() => {
        const itemById = new Map((items ?? []).map((item) => [item.id, item]));
        const stockById = new Map((items ?? []).map((item) => [item.id, getItemStock(item)]));
        return (assemblies ?? []).map((assembly) => {
            const expandedById = new Map((assembly.expand?.itemIds ?? []).map((item) => [item.id, item]));
            const componentIds = [...new Set([...(assembly.itemIds ?? []), ...Object.keys(assembly.itemQuantities ?? {})])];
            const parts = componentIds.map((id) => ({
                id,
                name: search.trim() ? itemById.get(id)?.name ?? expandedById.get(id)?.name ?? id : '',
                quantity: assembly.itemQuantities?.[id] ?? 1,
            }));
            return {
                id: assembly.id,
                assembly,
                name: assembly.name,
                description: assembly.description,
                parts,
                components: search.trim() ? parts.map((part) => part.name).join(' ') : '',
                stockReady: componentIds.every(id => itemById.has(id)),
                stock: assemblyAvailability(assembly, (id) => stockById.get(id)?.remaining ?? 0),
                totalStock: assemblyAvailability(assembly, (id) => stockById.get(id)?.totalStock ?? 0),
                totalValue: parts.reduce((sum, part) => sum + (itemById.get(part.id)?.value ?? expandedById.get(part.id)?.value ?? 0) * part.quantity, 0),
            };
        }).filter((row) => `${row.name} ${row.components}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    })();

    const columns: GridColDef<AssemblyRow>[] = [
        { field: 'name', headerName: t('Name', 'Name'), flex: 1.2, minWidth: 180,
            renderCell: ({ row }) => <Link component={RouterLink} to={`/assemblies/${row.id}`} onClick={(event) => event.stopPropagation()} underline="hover" color="text.primary" sx={{ fontWeight: 600 }}>{row.name}</Link> },
        { field: 'description', headerName: t('Beschreibung', 'Description'), flex: 1, minWidth: 160 },
        { field: 'stock', headerName: t('Bestand', 'Stock'), type: 'number', width: 120,
            renderCell: ({ row }) => <Typography variant="body2" sx={{ color: !row.stockReady ? 'text.secondary' : row.stock > 0 ? 'success.main' : 'error.main', fontWeight: 700 }}>{row.stockReady ? `${row.stock}/${row.totalStock}` : '…'}</Typography> },
        { field: 'totalValue', headerName: t('Gesamtwert', 'Total value'), type: 'number', width: 130,
            valueFormatter: (value: number) => `${value.toFixed(2)} €` },
        ...(canManage ? [{ field: 'actions', headerName: t('Aktionen', 'Actions'), width: 110, sortable: false, filterable: false,
            renderCell: ({ row }: { row: AssemblyRow }) => <Stack direction="row">
              <IconButton title={t('Bearbeiten', 'Edit')} size="small" onClick={(event) => { event.stopPropagation(); onEdit?.(row.assembly); }}><EditIcon fontSize="small" /></IconButton>
              <IconButton title={t('Löschen', 'Delete')} size="small" color="error" onClick={(event) => { event.stopPropagation(); onDelete?.(row.id); }}><DeleteIcon fontSize="small" /></IconButton>
            </Stack> } satisfies GridColDef<AssemblyRow>] : []),
    ];

    function updateSelection(model: GridRowSelectionModel) {
        const ids = model.type === 'exclude'
            ? rows.map((row) => row.id).filter((id) => !model.ids.has(id))
            : [...model.ids].map(String);
        setSelectedIds(new Set(ids));
    }

    return <Box>
        <TextField label={t('Nach Name oder Komponente suchen', 'Search by name or component')} value={search}
            onChange={(event) => setSearch(event.target.value)} size="small" fullWidth sx={{ mb: 2 }} />
        {canManage && selectedIds.size > 0 && <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1, mb: 2 }}>
            <Typography sx={{ fontWeight: 700 }}>{t(`${selectedIds.size} Baugruppen ausgewählt`, `${selectedIds.size} assemblies selected`)}</Typography>
            <Button title={translate('Das Löschen der ausgewählten Baugruppen bestätigen', 'Review deletion of the selected assemblies')} color="error" size="small" startIcon={<DeleteIcon />} onClick={() => onDeleteMany?.([...selectedIds])}>
                {t('Auswahl löschen', 'Delete selected')}
            </Button>
        </Paper>}
        <Box sx={{ width: '100%' }}>
            <DataGrid rows={rows} columns={columns} loading={isLoading} density="compact" autoHeight checkboxSelection={canManage}
                slotProps={{ row: { onAuxClick: event => openCatalogRowInNewTab(event, '/assemblies') } }}
                rowHeight={44} disableRowSelectionOnClick
                onRowClick={({ row }, event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey) navigate(`/assemblies/${row.id}`); }}
                rowSelectionModel={{ type: 'include', ids: selectedIds }} onRowSelectionModelChange={updateSelection}
                initialState={{ pagination: { paginationModel: { page: 0, pageSize: 20 } } }}
                pageSizeOptions={[20, 50, 100]} localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
                sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' },
                    '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', py: 0.5 } }} />
        </Box>
        {loadingMore && <Typography variant="caption" color="text.secondary">{t('Weitere Einträge werden geladen…', 'Loading more entries…')}</Typography>}
        {loadError && <Button title={translate('Die Daten erneut laden', 'Retry loading the data')} size="small" onClick={onRetry}>{t('Weitere Einträge konnten nicht geladen werden. Erneut versuchen', 'Could not load more entries. Retry')}</Button>}
    </Box>;
}
