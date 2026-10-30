import { useItemsByIds } from '../../hooks/useItems';
import { LoadMore } from '../shared/LoadMore';
import { useAuth } from '../../hooks/useAuth';
import { canEditCatalog } from '../../utils/access';
import { IconButton, Button, MenuItem } from '../shared/ActionButtons';
import { useState, type ReactNode } from 'react';
import { Alert, Box, Link, ListItemIcon, ListItemText, Menu, Paper, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { Assembly } from '../../types';
import { useAppLanguage, useT } from '../../utils/naming';
import { assemblyAvailability } from '../../utils/factionOrderQuantities';
import { getItemStock, stockRatio } from '../../utils/stock';
import { openCatalogRowInNewTab } from '../../utils/catalogNavigation';
import { StateMessage } from '../common/StateMessage';
import { catalogGridSx } from './catalogGrid';
import { CatalogRow, CatalogSearchBar, type RowAction } from './CatalogParts';
import { useCompactCatalog } from '../../hooks/useCompactCatalog';
import { selectFilterColumn } from '../../utils/catalogFilters';

/** `assemblies` are server pages filtered by `search`; `list` loads further pages on demand. */
interface Props {
    assemblies: Assembly[] | undefined;
    search: string;
    onSearch: (search: string) => void;
    list: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown };
    isLoading: boolean;
    loadError?: boolean;
    onRetry?: () => void;
    onCreate?: () => void;
    onEdit?: (assembly: Assembly) => void;
    onDelete?: (id: string) => void;
    onDeleteMany?: (ids: string[]) => void;
    /** Explains an empty list in the context it is shown in. */
    emptyHint?: string;
    /** The page's scope switch, shown above the search beside bulk selection. */
    scope?: ReactNode;
}

type AssemblyRow = {
    id: string;
    assembly: Assembly;
    name: string;
    category: string;
    categories: string[];
    events: string;
    stock: number;
    totalStock: number;
    stockReady: boolean;
};

const PAGE_STEP = 30;

export function AssembliesList({ assemblies, search, onSearch: setSearch, list, isLoading, loadError, onRetry, onCreate, onEdit, onDelete, onDeleteMany, emptyHint, scope }: Props) {
    const { user } = useAuth();
    const canEditAssembly = (assembly: Assembly) => assembly.access?.privateResource ? assembly.access.canEdit : canEditCatalog(user);
    const canManage = Boolean(onEdit && onDelete && onDeleteMany);
    const t = useT();
    const language = useAppLanguage();
    const theme = useTheme();
    const compact = useCompactCatalog();
    const narrowTable = useMediaQuery(theme.breakpoints.down('lg'));
    const navigate = useNavigate();
    // Only the components of the loaded assemblies, for availability.
    const { data: items } = useItemsByIds((assemblies ?? []).flatMap((assembly) => [...(assembly.itemIds ?? []), ...Object.keys(assembly.itemQuantities ?? {})]));
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selecting, setSelecting] = useState(false);
    const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
    const [menu, setMenu] = useState<{ anchor: HTMLElement; row: AssemblyRow } | null>(null);

    const allRows: AssemblyRow[] = (() => {
        const itemById = new Map((items ?? []).map((item) => [item.id, item]));
        const stockById = new Map((items ?? []).map((item) => [item.id, getItemStock(item)]));
        return (assemblies ?? []).map((assembly) => {
            const componentIds = [...new Set([...(assembly.itemIds ?? []), ...Object.keys(assembly.itemQuantities ?? {})])];
            const category = [assembly.category, assembly.subcategory].filter(Boolean).join(' · ');
            return {
                id: assembly.id,
                assembly,
                name: assembly.name,
                category: category || '—',
                categories: assembly.category ? [assembly.category] : [],
                events: assembly.eventTypes?.join(', ') || '—',
                stockReady: componentIds.every(id => itemById.has(id)),
                stock: assemblyAvailability(assembly, (id) => stockById.get(id)?.remaining ?? 0),
                totalStock: assemblyAvailability(assembly, (id) => stockById.get(id)?.totalStock ?? 0),
            };
        });
    })();
    const rows = allRows;

    const availabilityText = (row: AssemblyRow) => !row.stockReady ? t('lists.assembliesList.calculatingStock')
        : stockRatio(row.stock, row.totalStock);
    const availabilityColor = (row: AssemblyRow) => !row.stockReady ? 'text.secondary' : row.stock > 0 ? 'success.main' : 'error.main';

    function rowActions(row: AssemblyRow): RowAction[] {
        return canManage && canEditAssembly(row.assembly) ? [
            { label: t('common.edit'), icon: <EditIcon fontSize="small" />, onClick: () => onEdit?.(row.assembly) },
            { label: t('common.delete'), icon: <DeleteIcon fontSize="small" />, onClick: () => onDelete?.(row.id), destructive: true },
        ] : [];
    }

    const columns: GridColDef<AssemblyRow>[] = [
        { field: 'name', headerName: t('profile.name'), flex: 1.5, minWidth: 200,
            renderCell: ({ row }) => <Box sx={{ minWidth: 0 }}>
                <Link component={RouterLink} to={`/assemblies/${row.id}`} onClick={(event) => event.stopPropagation()} underline="hover" color="text.primary" sx={{ fontWeight: 600, display: 'block', whiteSpace: 'normal', lineHeight: 1.3 }}>{row.name}</Link>
                {narrowTable && row.category !== '—' && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{row.category}</Typography>}
            </Box> },
        { field: 'category', headerName: t('common.category'), flex: 1, minWidth: 150, ...selectFilterColumn(allRows, (row) => row.categories),
            renderCell: ({ row }) => <Typography variant="body2" title={row.category} sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal', lineHeight: 1.43 }}>{row.category}</Typography> },
        { field: 'stock', headerName: t('enum.itemStatus.available'), type: 'number', width: 180,
            renderCell: ({ row }) => <Typography variant="body2" className="tabular" sx={{ color: availabilityColor(row), fontWeight: 600, whiteSpace: 'normal', textAlign: 'right' }}>{availabilityText(row)}</Typography> },
        { field: 'events', headerName: t('nav.events'), width: 130, ...selectFilterColumn(allRows, (row) => row.assembly.eventTypes ?? []) },
        ...(canManage ? [{ field: 'actions', headerName: t('common.actions'), width: 104, sortable: false, filterable: false,
            renderCell: ({ row }: { row: AssemblyRow }) => <Stack direction="row">
              <IconButton disabled={!canEditAssembly(row.assembly)} title={t('common.edit')} onClick={(event) => { event.stopPropagation(); if (canEditAssembly(row.assembly)) onEdit?.(row.assembly); }}><EditIcon fontSize="small" /></IconButton>
              <IconButton disabled={!canEditAssembly(row.assembly)} title={t('common.delete')} color="error" onClick={(event) => { event.stopPropagation(); if (canEditAssembly(row.assembly)) onDelete?.(row.id); }}><DeleteIcon fontSize="small" /></IconButton>
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

    const initialLoading = !assemblies && isLoading;
    const initialError = !assemblies?.length && loadError && !isLoading;
    const empty = !initialLoading && !initialError && (assemblies?.length ?? 0) === 0;
    const noMatches = !initialLoading && !initialError && !empty && rows.length === 0;

    const content = (() => {
        if (initialError) return <StateMessage kind="error" title={t('lists.assembliesList.couldNotLoadAssemblies')}
            description={t('lists.assembliesList.theCatalogCannotBeReachedRightNowNothingHasBeen')}
            action={onRetry && <Button variant="contained" onClick={onRetry}>{t('common.tryAgain')}</Button>} />;
        if (initialLoading) return <StateMessage kind="loading" title={t('lists.assembliesList.loadingAssemblies')} />;
        if (empty) return <StateMessage kind="empty" title={t('lists.assembliesList.noAssembliesYet')}
            description={emptyHint ?? t('lists.assembliesList.assembliesBundleItemsThatAreIssuedTogether')}
            action={onCreate && <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>{t('lists.assembliesList.addAssembly')}</Button>} />;
        if (noMatches) return <StateMessage kind="no-matches" title={t('lists.assembliesList.noMatchingAssemblies')}
            description={t('lists.assembliesList.checkTheSpellingOrSearchForAContainedItem')}
            action={<Button variant="outlined" onClick={() => setSearch('')}>{t('lists.assembliesList.clearSearch')}</Button>} />;
        if (compact) return <>
            <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }} aria-label={t('nav.assemblies')}>
                {rows.slice(0, visibleCount).map((row) => <CatalogRow key={row.id} to={`/assemblies/${row.id}`} title={row.name}
                    primary={<Box component="span" sx={{ color: availabilityColor(row), fontWeight: 600 }}>{availabilityText(row)}</Box>}
                    selectable={selecting && canEditAssembly(row.assembly)} selected={selectedIds.has(row.id)} onToggleSelected={() => toggleSelected(row.id)}
                    onOpenMenu={(anchor) => setMenu({ anchor, row })} />)}
            </Paper>
            {rows.length > visibleCount && <Button fullWidth variant="outlined" sx={{ mt: 1.5 }} onClick={() => setVisibleCount((count) => count + PAGE_STEP)}>
                {t('common.showMoreRemainingCountRemaining', { remainingCount: String(rows.length - visibleCount) })}
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
            ? <CatalogSearchBar scope={scope} search={search} onSearch={setSearch} label={t('lists.assembliesList.searchAssemblies')}
                selecting={canManage ? selecting : undefined} onToggleSelecting={() => { setSelecting((value) => !value); setSelectedIds(new Set()); }} />
            : <>
                {scope && <Box sx={{ mb: 2 }}>{scope}</Box>}
                <TextField type="search" label={t('lists.assembliesList.searchByName')} value={search}
                    onChange={(event) => setSearch(event.target.value)} size="small" fullWidth sx={{ mb: 1.5 }} />
            </>}
        {loadError && !initialError && <Alert severity="warning" sx={{ mb: 1.5 }} action={onRetry && <Button size="small" onClick={onRetry}>{t('common.retry')}</Button>}>
            {t('lists.assembliesList.onlyAssemblieCountAssembliesCouldBeLoadedTheListIsIncomplete', { assemblieCount: String(assemblies?.length ?? 0) })}
        </Alert>}
        {canManage && selectedIds.size > 0 && <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1, pl: 2, mb: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }}>{t('lists.assembliesList.selectedIdCountAssembliesSelected', { selectedIdCount: String(selectedIds.size) })}</Typography>
            <Button color="error" startIcon={<DeleteIcon />} onClick={() => onDeleteMany?.([...selectedIds])}>
                {t('lists.assembliesList.deleteSelected')}
            </Button>
        </Paper>}
        {content}
        <LoadMore list={list} />
        <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
            <MenuItem component={RouterLink} to={menu ? `/assemblies/${menu.row.id}` : '#'} onClick={() => setMenu(null)}>
                <ListItemText>{t('common.open')}</ListItemText>
            </MenuItem>
            {menu && rowActions(menu.row).map((action) => <MenuItem key={action.label} onClick={() => { setMenu(null); action.onClick(); }} sx={action.destructive ? { color: 'error.main' } : undefined}>
                <ListItemIcon sx={action.destructive ? { color: 'error.main' } : undefined}>{action.icon}</ListItemIcon>
                <ListItemText>{action.label}</ListItemText>
            </MenuItem>)}
        </Menu>
    </Box>;
}
