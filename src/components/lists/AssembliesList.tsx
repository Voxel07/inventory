import { MediaImage } from '../common/MediaImage';
import { apiFileUrl } from '../../services/apiClient';
import { useEffect, useMemo, useState } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Skeleton,
    Typography,
    Stack,
    Menu,
    MenuItem,
    IconButton,
    ListItemIcon,
    ListItemText,
    Box,
    Button,
    Checkbox,
    TextField,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useNavigate } from 'react-router-dom';
import { TooltipButton } from '../shared/TooltipButton';
import type { Assembly, Item } from '../../types';
import { useLocalizedText } from '../../utils/naming';
import { assemblyAvailability } from '../../utils/factionOrderQuantities';
import { getItemStock } from '../../utils/stock';
import { ListPagination } from '../shared/ListPagination';
import { LIST_PAGE_SIZE } from '../../hooks/useProgressiveList';

interface Props {
    assemblies: Assembly[] | undefined;
    items: Item[] | undefined;
    isLoading: boolean;
    loadingMore?: boolean;
    loadError?: boolean;
    onRetry?: () => void;
    onEdit: (assembly: Assembly) => void;
    onDelete: (id: string) => void;
    onDeleteMany: (ids: string[]) => void;
}

export function AssembliesList({ assemblies, items, isLoading, loadingMore, loadError, onRetry, onEdit, onDelete, onDeleteMany }: Props) {
    const t = useLocalizedText();
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [selectedAssembly, setSelectedAssembly] = useState<Assembly | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
    const stockByItemId = useMemo(() => new Map((items ?? []).map((item) => [
        item.id,
        getItemStock(item),
    ])), [items]);
    const filteredAssemblies = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        if (!normalizedSearch) return assemblies ?? [];
        return (assemblies ?? []).filter((assembly) => assembly.name.toLowerCase().includes(normalizedSearch));
    }, [assemblies, search]);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredAssemblies.length / LIST_PAGE_SIZE)));
    const pageAssemblies = filteredAssemblies.slice((currentPage - 1) * LIST_PAGE_SIZE, currentPage * LIST_PAGE_SIZE);

    useEffect(() => {
        const validIds = new Set(assemblies?.map((assembly) => assembly.id) ?? []);
        setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))));
    }, [assemblies]);

    function toggleSelection(id: string) {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const handleOpenMenu = (event: React.MouseEvent<HTMLElement>, assembly: Assembly) => {
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
        setSelectedAssembly(assembly);
    };

    const handleCloseMenu = () => {
        setAnchorEl(null);
        setSelectedAssembly(null);
    };

    const handleView = () => {
        if (selectedAssembly) {
            navigate(`/assemblies/${selectedAssembly.id}`);
        }
        handleCloseMenu();
    };

    const handleEdit = () => {
        if (selectedAssembly) {
            onEdit(selectedAssembly);
        }
        handleCloseMenu();
    };

    const handleDelete = () => {
        if (selectedAssembly) {
            onDelete(selectedAssembly.id);
        }
        handleCloseMenu();
    };

    if (isLoading) {
        return (
            <Paper sx={{ p: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} height={48} />
                ))}
            </Paper>
        );
    }

    if (!assemblies?.length) {
        return (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">{t('Keine Baugruppen gefunden', 'No assemblies found')}</Typography>
                {loadError && <Button onClick={onRetry}>{t('Erneut versuchen', 'Retry')}</Button>}
            </Paper>
        );
    }

    function getExpandedItems(assembly: Assembly): Item[] {
        if (assembly.expand?.itemIds?.length) return assembly.expand.itemIds;
        if (!Array.isArray(assembly.itemIds) || !items) return [];
        return assembly.itemIds
            .map((id) => items.find((i) => i.id === id))
            .filter((i): i is Item => !!i);
    }

    function getAssemblyTotalValue(assembly: Assembly): number {
        const quantities = assembly.itemQuantities ?? {};
        return getExpandedItems(assembly).reduce(
            (sum, item) => sum + (item.value ?? 0) * (quantities[item.id] ?? 1), 0,
        );
    }

    function getAssemblyStock(assembly: Assembly) {
        return {
            totalStock: assemblyAvailability(assembly, (itemId) => stockByItemId.get(itemId)?.totalStock ?? 0),
            remaining: assemblyAvailability(assembly, (itemId) => stockByItemId.get(itemId)?.remaining ?? 0),
        };
    }

    return (
        <Box>
            <TextField
                label={t('Nach Name suchen', 'Search by name')}
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                size="small"
                fullWidth
                sx={{ mb: 2 }}
            />
            {selectedIds.size > 0 && (
                <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1, mb: 2 }}>
                    <Typography sx={{ fontWeight: 700 }}>
                        {t(`${selectedIds.size} ${selectedIds.size === 1 ? 'Baugruppe' : 'Baugruppen'} ausgewählt`, `${selectedIds.size} assembl${selectedIds.size === 1 ? 'y' : 'ies'} selected`)}
                    </Typography>
                    <Button color="error" size="small" startIcon={<DeleteIcon />} onClick={() => onDeleteMany([...selectedIds])}>
                        {t('Auswahl löschen', 'Delete selected')}
                    </Button>
                </Paper>
            )}
            {isMobile ? (
                <Stack spacing={0.5}>
                    {pageAssemblies.map((assembly) => {
                        const { totalStock, remaining } = getAssemblyStock(assembly);
                        const color = remaining > 0 ? 'success.main' : 'error.main';
                        return (
                            <Paper key={assembly.id} onClick={() => navigate(`/assemblies/${assembly.id}`)} sx={{ px: 0.5, py: 0.25, cursor: 'pointer' }}>
                                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                    <Checkbox
                                        size="small"
                                        checked={selectedIds.has(assembly.id)}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={() => toggleSelection(assembly.id)}
                                        slotProps={{ input: { 'aria-label': t(`${assembly.name} auswählen`, `Select ${assembly.name}`) } }}
                                        sx={{ p: 0.5 }}
                                    />
                                    <Typography noWrap sx={{ minWidth: 0, flexGrow: 1, fontWeight: 700, fontSize: '0.95rem' }}>
                                        {assembly.name}
                                    </Typography>
                                    <Typography sx={{ flexShrink: 0, color, fontWeight: 800, lineHeight: 1.2 }}>
                                        {remaining}/{totalStock}
                                    </Typography>
                                    <IconButton
                                        size="small"
                                        aria-label={t('Baugruppenaktionen öffnen', 'Open assembly actions')}
                                        onClick={(event) => handleOpenMenu(event, assembly)}
                                        sx={{ p: 0.5 }}
                                    >
                                        <MoreVertIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            </Paper>
                        );
                    })}
                    {filteredAssemblies.length === 0 && (
                        <Paper sx={{ p: 3 }}>
                            <Typography color="text.secondary">{t('Keine Baugruppen entsprechen der Suche.', 'No assemblies match the search.')}</Typography>
                        </Paper>
                    )}
                </Stack>
            ) : (
            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell padding="checkbox">
                            <Checkbox
                                size="small"
                                checked={pageAssemblies.length > 0 && pageAssemblies.every((assembly) => selectedIds.has(assembly.id))}
                                indeterminate={pageAssemblies.some((assembly) => selectedIds.has(assembly.id)) && !pageAssemblies.every((assembly) => selectedIds.has(assembly.id))}
                                onChange={() => {
                                    const visibleIds = pageAssemblies.map((assembly) => assembly.id);
                                    const allSelected = visibleIds.every((id) => selectedIds.has(id));
                                    setSelectedIds((current) => {
                                        const next = new Set(current);
                                        for (const id of visibleIds) {
                                            if (allSelected) next.delete(id);
                                            else next.add(id);
                                        }
                                        return next;
                                    });
                                }}
                                slotProps={{ input: { 'aria-label': t('Alle Baugruppen auswählen', 'Select all assemblies') } }}
                            />
                        </TableCell>
                        <TableCell>{t('Name', 'Name')}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('Beschreibung', 'Description')}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('Komponenten', 'Components')}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{t('Bestand', 'Stock')}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap', minWidth: 120 }}>{t('Gesamtwert', 'Total value')}</TableCell>
                        <TableCell align="right">{t('Aktionen', 'Actions')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {pageAssemblies.map((assembly) => {
                        const assemblyItems = getExpandedItems(assembly);
                        const { totalStock, remaining } = getAssemblyStock(assembly);
                        return (
                            <TableRow
                                key={assembly.id}
                                hover
                                onClick={() => navigate(`/assemblies/${assembly.id}`)}
                                sx={{ cursor: 'pointer' }}
                            >
                                <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                                    <Checkbox
                                        size="small"
                                        checked={selectedIds.has(assembly.id)}
                                        onChange={() => toggleSelection(assembly.id)}
                                        slotProps={{ input: { 'aria-label': t(`${assembly.name} auswählen`, `Select ${assembly.name}`) } }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                        {assembly.image && <MediaImage src={apiFileUrl(assembly.image)} alt={assembly.name} sx={{ width: 64, height: 48, objectFit: 'contain', borderRadius: 0.75, flexShrink: 0 }} />}
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{assembly.name}</Typography>
                                    </Stack>
                                </TableCell>
                                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                                    {assembly.description}
                                </TableCell>
                                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', maxHeight: 28, overflow: 'hidden' }} useFlexGap>
                                        {assemblyItems.map((item) => {
                                            const qty = assembly.itemQuantities?.[item.id] ?? 1;
                                            return (
                                                <Chip
                                                    key={item.id}
                                                    label={qty > 1 ? `${qty}× ${item.name}` : item.name}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                            );
                                        })}
                                    </Stack>
                                </TableCell>
                                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                    <Typography
                                        component="span"
                                        variant="body2"
                                        sx={{ color: remaining > 0 ? 'success.main' : 'error.main', fontWeight: remaining <= 0 ? 700 : 400 }}
                                    >
                                        {remaining}/{totalStock}
                                    </Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                    {getAssemblyTotalValue(assembly).toFixed(2)} €
                                </TableCell>
                                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                    <Box sx={{ display: 'inline-flex', gap: 0.5 }}>
                                        <TooltipButton
                                            variant="icon"
                                            tooltipText={t('Baugruppendetails anzeigen', 'View assembly details')}
                                            icon={<VisibilityIcon />}
                                            size="small"
                                            color="info"
                                            onClick={() => navigate(`/assemblies/${assembly.id}`)}
                                        />
                                        <TooltipButton
                                            variant="icon"
                                            tooltipText={t('Baugruppe bearbeiten', 'Edit assembly')}
                                            icon={<EditIcon />}
                                            size="small"
                                            color="warning"
                                            onClick={() => onEdit(assembly)}
                                        />
                                        <TooltipButton
                                            variant="icon"
                                            tooltipText={t('Baugruppe löschen', 'Delete assembly')}
                                            icon={<DeleteIcon />}
                                            size="small"
                                            color="error"
                                            onClick={() => onDelete(assembly.id)}
                                        />
                                    </Box>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                    {filteredAssemblies.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={7}>{t('Keine Baugruppen entsprechen der Suche.', 'No assemblies match the search.')}</TableCell>
                        </TableRow>
                    )}
                </TableBody>
                </Table>
            </TableContainer>
            )}
            <ListPagination count={filteredAssemblies.length} page={currentPage} onChange={setPage} loadingMore={loadingMore} loadError={loadError} onRetry={onRetry} />
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleCloseMenu}
                onClick={(e) => e.stopPropagation()}
            >
                <MenuItem onClick={handleView}>
                    <ListItemIcon>
                        <VisibilityIcon fontSize="small" color="info" />
                    </ListItemIcon>
                    <ListItemText>{t('Details anzeigen', 'View details')}</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleEdit}>
                    <ListItemIcon>
                        <EditIcon fontSize="small" color="warning" />
                    </ListItemIcon>
                    <ListItemText>{t('Bearbeiten', 'Edit')}</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleDelete}>
                    <ListItemIcon>
                        <DeleteIcon fontSize="small" color="error" />
                    </ListItemIcon>
                    <ListItemText>{t('Löschen', 'Delete')}</ListItemText>
                </MenuItem>
            </Menu>
        </Box>
    );
}
