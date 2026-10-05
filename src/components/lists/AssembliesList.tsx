import { useAuth } from '../../hooks/useAuth';
import { canEditCatalog } from '../../utils/access';
import { IconButton, Button, MenuItem } from '../shared/ActionButtons';
import { useState } from 'react';
import { Alert, Box, Link, ListItemIcon, ListItemText, Menu, Paper, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { Assembly, Item } from '../../types';
import { useAppLanguage, useLocalizedText } from '../../utils/naming';
import { assemblyAvailability } from '../../utils/factionOrderQuantities';
import { getItemStock } from '../../utils/stock';
import { openCatalogRowInNewTab } from '../../utils/catalogNavigation';
import { StateMessage } from '../common/StateMessage';
import { catalogGridSx } from './catalogGrid';
import { CatalogRow, CatalogSearchBar, type RowAction } from './CatalogParts';
import { useCompactCatalog } from '../../hooks/useCompactCatalog';
import { selectFilterColumn } from '../../utils/catalogFilters';

interface Props {
    assemblies: Assembly[] | undefined;
    items: Item[] | undefined;
    isLoading: boolean;
    loadingMore?: boolean;
    loadError?: boolean;
    onRetry?: () => void;
    onCreate?: () => void;
    onEdit?: (assembly: Assembly) => void;
    onDelete?: (id: string) => void;
    onDeleteMany?: (ids: string[]) => void;
    /** Explains an empty list in the context it is shown in. */
    emptyHint?: string;
}

type AssemblyRow = {
    id: string;
    assembly: Assembly;
    name: string;
    category: string;
    categories: string[];
    location: string;
    locations: string[];
    events: string;
    components: string;
    stock: number;
    totalStock: number;
    stockReady: boolean;
};

const PAGE_STEP = 30;

export function AssembliesList({ assemblies, items, isLoading, loadingMore, loadError, onRetry, onCreate, onEdit, onDelete, onDeleteMany, emptyHint }: Props) {
    const { user } = useAuth();
    const canEditAssembly = (assembly: Assembly) => assembly.access?.privateResource ? assembly.access.canEdit : canEditCatalog(user);
    const canManage = Boolean(onEdit && onDelete && onDeleteMany);
    const t = useLocalizedText();
    const language = useAppLanguage();
    const theme = useTheme();
    const compact = useCompactCatalog();
    const narrowTable = useMediaQuery(theme.breakpoints.down('lg'));
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selecting, setSelecting] = useState(false);
    const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
    const [menu, setMenu] = useState<{ anchor: HTMLElement; row: AssemblyRow } | null>(null);

    const allRows: AssemblyRow[] = (() => {
        const itemById = new Map((items ?? []).map((item) => [item.id, item]));
        const stockById = new Map((items ?? []).map((item) => [item.id, getItemStock(item)]));
        return (assemblies ?? []).map((assembly) => {
            const expandedById = new Map((assembly.expand?.itemIds ?? []).map((item) => [item.id, item]));
            const componentIds = [...new Set([...(assembly.itemIds ?? []), ...Object.keys(assembly.itemQuantities ?? {})])];
            const componentItems = componentIds.map((id) => itemById.get(id) ?? expandedById.get(id));
            const categories = componentItems.map((item) => [item?.category, item?.subcategory].filter(Boolean).join(' · '));
            const locations = [...new Set(componentItems.map((item) => {
                const location = item?.expand?.storageLocation;
                return location ? [location.name, location.location, location.position].filter(Boolean).join(' / ') : item?.storageLocation;
            }).filter((location): location is string => Boolean(location)))];
            return {
                id: assembly.id,
                assembly,
                name: assembly.name,
                category: [...new Set(categories.filter(Boolean))].join(', ') || '—',
                categories: componentItems.map((item) => item?.category).filter((category): category is string => Boolean(category)),
                location: locations.join(', ') || '—',
                locations,
                events: assembly.eventTypes?.join(', ') || '—',
                components: search.trim() ? componentIds.map((id, index) => componentItems[index]?.name ?? id).join(' ') : '',
                stockReady: componentIds.every(id => itemById.has(id)),
                stock: assemblyAvailability(assembly, (id) => stockById.get(id)?.remaining ?? 0),
                totalStock: assemblyAvailability(assembly, (id) => stockById.get(id)?.totalStock ?? 0),
            };
        });
    })();
    const rows = allRows.filter((row) => `${row.name} ${row.components}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

    const availabilityText = (row: AssemblyRow) => !row.stockReady ? t('Bestand wird berechnet…', 'Calculating stock…')
        : row.stock > 0 ? t(`${row.stock} von ${row.totalStock} baubar`, `${row.stock} of ${row.totalStock} buildable`)
        : t('Nicht baubar', 'None buildable');
    const availabilityColor = (row: AssemblyRow) => !row.stockReady ? 'text.secondary' : row.stock > 0 ? 'success.main' : 'error.main';

    function rowActions(row: AssemblyRow): RowAction[] {
        return canManage && canEditAssembly(row.assembly) ? [
            { label: t('Bearbeiten', 'Edit'), icon: <EditIcon fontSize="small" />, onClick: () => onEdit?.(row.assembly) },
            { label: t('Löschen', 'Delete'), icon: <DeleteIcon fontSize="small" />, onClick: () => onDelete?.(row.id), destructive: true },
        ] : [];
    }

    const columns: GridColDef<AssemblyRow>[] = [
        { field: 'name', headerName: t('Name', 'Name'), flex: 1.5, minWidth: 200,
            renderCell: ({ row }) => <Box sx={{ minWidth: 0 }}>
                <Link component={RouterLink} to={`/assemblies/${row.id}`} onClick={(event) => event.stopPropagation()} underline="hover" color="text.primary" sx={{ fontWeight: 600, display: 'block', whiteSpace: 'normal', lineHeight: 1.3 }}>{row.name}</Link>
                {narrowTable && row.category !== '—' && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{row.category}</Typography>}
            </Box> },
        { field: 'category', headerName: t('Kategorie', 'Category'), flex: 1, minWidth: 150, ...selectFilterColumn(allRows, (row) => row.categories) },
        { field: 'stock', headerName: t('Verfügbar', 'Available'), type: 'number', width: 180,
            renderCell: ({ row }) => <Typography variant="body2" className="tabular" sx={{ color: availabilityColor(row), fontWeight: 600, whiteSpace: 'normal', textAlign: 'right' }}>{availabilityText(row)}</Typography> },
        { field: 'location', headerName: t('Lagerort', 'Location'), flex: 1, minWidth: 150, ...selectFilterColumn(allRows, (row) => row.locations) },
        { field: 'events', headerName: t('Events', 'Events'), width: 130, ...selectFilterColumn(allRows, (row) => row.assembly.eventTypes ?? []) },
        ...(canManage ? [{ field: 'actions', headerName: t('Aktionen', 'Actions'), width: 104, sortable: false, filterable: false,
            renderCell: ({ row }: { row: AssemblyRow }) => <Stack direction="row">
              <IconButton disabled={!canEditAssembly(row.assembly)} title={t('Bearbeiten', 'Edit')} onClick={(event) => { event.stopPropagation(); if (canEditAssembly(row.assembly)) onEdit?.(row.assembly); }}><EditIcon fontSize="small" /></IconButton>
              <IconButton disabled={!canEditAssembly(row.assembly)} title={t('Löschen', 'Delete')} color="error" onClick={(event) => { event.stopPropagation(); if (canEditAssembly(row.assembly)) onDelete?.(row.id); }}><DeleteIcon fontSize="small" /></IconButton>
            </Stack> } satisfies GridColDef<AssemblyRow>] : []),
    ];

    function updateSelection(model: GridRowSelectionModel) {
        const ids = model.type === 'exclude'
            ? rows.map((row) => row.id).filter((id) => !model.ids.has(id))
            : [...model.ids].map(String);
        setSelectedIds(new Set(ids.filter(id => rows.some(row => row.id === id && canEditAssembly(row.assembly)))));
    }

    function toggleSelected(id: string) {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    const initialLoading = !assemblies && (isLoading || (!loadError && loadingMore));
    const initialError = !assemblies?.length && loadError && !isLoading;
    const empty = !initialLoading && !initialError && (assemblies?.length ?? 0) === 0;
    const noMatches = !initialLoading && !initialError && !empty && rows.length === 0;

    const content = (() => {
        if (initialError) return <StateMessage kind="error" title={t('Baugruppen konnten nicht geladen werden', 'Could not load assemblies')}
            description={t('Der Katalog ist gerade nicht erreichbar. Deine Daten sind nicht verloren.', 'The catalog cannot be reached right now. Nothing has been lost.')}
            action={onRetry && <Button variant="contained" onClick={onRetry}>{t('Erneut versuchen', 'Try again')}</Button>} />;
        if (initialLoading) return <StateMessage kind="loading" title={t('Baugruppen werden geladen…', 'Loading assemblies…')} />;
        if (empty) return <StateMessage kind="empty" title={t('Noch keine Baugruppen', 'No assemblies yet')}
            description={emptyHint ?? t('Baugruppen bündeln Artikel, die gemeinsam ausgegeben werden.', 'Assemblies bundle items that are issued together.')}
            action={onCreate && <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>{t('Baugruppe hinzufügen', 'Add assembly')}</Button>} />;
        if (noMatches) return <StateMessage kind="no-matches" title={t('Keine passenden Baugruppen', 'No matching assemblies')}
            description={t('Prüfe die Schreibweise oder suche nach einem enthaltenen Artikel.', 'Check the spelling or search for a contained item.')}
            action={<Button variant="outlined" onClick={() => setSearch('')}>{t('Suche zurücksetzen', 'Clear search')}</Button>} />;
        if (compact) return <>
            <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }} aria-label={t('Baugruppen', 'Assemblies')}>
                {rows.slice(0, visibleCount).map((row) => <CatalogRow key={row.id} to={`/assemblies/${row.id}`} title={row.name}
                    primary={<Box component="span" sx={{ color: availabilityColor(row), fontWeight: 600 }}>{availabilityText(row)}</Box>}
                    primarySuffix={row.location !== '—' ? row.location : undefined}
                    secondary={[row.category !== '—' ? row.category : '', row.events !== '—' ? row.events : ''].filter(Boolean).join(' · ')}
                    selectable={selecting && canEditAssembly(row.assembly)} selected={selectedIds.has(row.id)} onToggleSelected={() => toggleSelected(row.id)}
                    onOpenMenu={(anchor) => setMenu({ anchor, row })} />)}
            </Paper>
            {rows.length > visibleCount && <Button fullWidth variant="outlined" sx={{ mt: 1.5 }} onClick={() => setVisibleCount((count) => count + PAGE_STEP)}>
                {t(`Weitere anzeigen (${rows.length - visibleCount} übrig)`, `Show more (${rows.length - visibleCount} remaining)`)}
            </Button>}
        </>;
        return <DataGrid rows={rows} columns={columns} columnVisibilityModel={{ category: !narrowTable, events: !narrowTable }}
            loading={isLoading} density="compact" getRowHeight={() => 'auto'} autoHeight checkboxSelection={canManage}
            slotProps={{ row: { onAuxClick: event => openCatalogRowInNewTab(event, '/assemblies') } }}
            isRowSelectable={({ row }) => canEditAssembly(row.assembly)} disableRowSelectionOnClick
            onRowClick={({ row }, event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey) navigate(`/assemblies/${row.id}`); }}
            rowSelectionModel={{ type: 'include', ids: selectedIds }} onRowSelectionModelChange={updateSelection}
            initialState={{ pagination: { paginationModel: { page: 0, pageSize: 25 } } }}
            pageSizeOptions={[25, 50, 100]} localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
            sx={catalogGridSx} />;
    })();

    return <Box>
        {compact
            ? <CatalogSearchBar search={search} onSearch={setSearch} label={t('Name oder Komponente suchen', 'Search name or component')}
                selecting={canManage ? selecting : undefined} onToggleSelecting={() => { setSelecting((value) => !value); setSelectedIds(new Set()); }} />
            : <TextField type="search" label={t('Nach Name oder Komponente suchen', 'Search by name or component')} value={search}
                onChange={(event) => setSearch(event.target.value)} size="small" fullWidth sx={{ mb: 1.5 }} />}
        {loadError && !initialError && <Alert severity="warning" sx={{ mb: 1.5 }} action={onRetry && <Button size="small" onClick={onRetry}>{t('Erneut laden', 'Retry')}</Button>}>
            {t(`Es konnten nur ${assemblies?.length ?? 0} Baugruppen geladen werden. Die Liste ist unvollständig.`, `Only ${assemblies?.length ?? 0} assemblies could be loaded. The list is incomplete.`)}
        </Alert>}
        {canManage && selectedIds.size > 0 && <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1, pl: 2, mb: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }}>{t(`${selectedIds.size} Baugruppen ausgewählt`, `${selectedIds.size} assemblies selected`)}</Typography>
            <Button color="error" startIcon={<DeleteIcon />} onClick={() => onDeleteMany?.([...selectedIds])}>
                {t('Auswahl löschen', 'Delete selected')}
            </Button>
        </Paper>}
        {content}
        {loadingMore && !initialLoading && <Typography variant="body2" color="text.secondary" role="status" sx={{ mt: 1 }}>{t('Weitere Einträge werden geladen…', 'Loading more entries…')}</Typography>}
        <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
            <MenuItem component={RouterLink} to={menu ? `/assemblies/${menu.row.id}` : '#'} onClick={() => setMenu(null)}>
                <ListItemText>{t('Öffnen', 'Open')}</ListItemText>
            </MenuItem>
            {menu && rowActions(menu.row).map((action) => <MenuItem key={action.label} onClick={() => { setMenu(null); action.onClick(); }} sx={action.destructive ? { color: 'error.main' } : undefined}>
                <ListItemIcon sx={action.destructive ? { color: 'error.main' } : undefined}>{action.icon}</ListItemIcon>
                <ListItemText>{action.label}</ListItemText>
            </MenuItem>)}
        </Menu>
    </Box>;
}
