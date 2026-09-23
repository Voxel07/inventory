import { MediaImage } from '../common/MediaImage';
import { useEffect, useState, useMemo } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Paper,
    Skeleton,
    Typography,
    TextField,
    Box,
    Button,
    MenuItem,
    Stack,
    useMediaQuery,
    useTheme,
    Grid,
    Card,
    CardContent,
    Checkbox,
    Chip,
    IconButton,
    ListItemIcon,
    Menu,
    ToggleButton,
    ToggleButtonGroup,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ViewListIcon from '@mui/icons-material/ViewList';
import GridViewIcon from '@mui/icons-material/GridView';
import { useNavigate } from 'react-router-dom';
import type { Item } from '../../types';
import { getItemStock } from '../../utils/stock';
import { useLocalizedText } from '../../utils/naming';
import { useUIStore } from '../../store/uiStore';
import { itemImageUrl } from '../../utils/itemImages';
import { ListPagination } from '../shared/ListPagination';
import { LIST_PAGE_SIZE } from '../../hooks/useProgressiveList';

interface Props {
    items: Item[] | undefined;
    isLoading: boolean;
    loadingMore?: boolean;
    loadError?: boolean;
    onRetry?: () => void;
    onEdit: (item: Item) => void;
    onDelete: (id: string) => void;
    onDeleteMany: (ids: string[]) => void;
}

type SortField = 'value' | 'stock' | null;
type SortDir = 'asc' | 'desc';
type ViewMode = 'list' | 'tiles';

function stockColor(remaining: number, minStock: number) {
    if (remaining <= 0) return 'error.main';
    if (remaining <= minStock) return 'warning.main';
    return 'success.main';
}

export function ItemsList({ items, isLoading, loadingMore, loadError, onRetry, onEdit, onDelete, onDeleteMany }: Props) {
    const navigate = useNavigate();
    const t = useLocalizedText();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const activeEventType = useUIStore((state) => state.activeEventType);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sortField, setSortField] = useState<SortField>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const saved = window.localStorage.getItem(isMobile ? 'inventory-item-view-mobile' : 'inventory-item-view-desktop');
        return saved === 'list' || saved === 'tiles' ? saved : isMobile ? 'tiles' : 'list';
    });
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
    const [actionMenu, setActionMenu] = useState<{ anchorEl: HTMLElement; item: Item } | null>(null);

    useEffect(() => {
        const saved = window.localStorage.getItem(isMobile ? 'inventory-item-view-mobile' : 'inventory-item-view-desktop');
        setViewMode(saved === 'list' || saved === 'tiles' ? saved : isMobile ? 'tiles' : 'list');
    }, [isMobile]);
    useEffect(() => {
        const validIds = new Set(items?.map((item) => item.id) ?? []);
        setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))));
    }, [items]);

    const enrichedItems = useMemo(() => {
        if (!items) return [];
        return items.map((item) => {
            const { totalStock, damaged, remaining } = getItemStock(item);
            return { item, totalStock, damaged, remaining };
        });
    }, [items]);

    const filteredAndSorted = useMemo(() => {
        let result = enrichedItems;

        if (search.trim()) {
            const lower = search.toLowerCase();
            result = result.filter(
                ({ item }) =>
                    item.name.toLowerCase().includes(lower) ||
                    (item.category && item.category.toLowerCase().includes(lower)),
            );
        }

        result = result.filter(({ item }) => item.eventTypes?.includes(activeEventType));

        if (sortField) {
            result = [...result].sort((a, b) => {
                let cmp = 0;
                if (sortField === 'value') cmp = (a.item.value ?? 0) - (b.item.value ?? 0);
                else if (sortField === 'stock') cmp = a.remaining - b.remaining;
                return sortDir === 'asc' ? cmp : -cmp;
            });
        }

        return result;
    }, [enrichedItems, search, activeEventType, sortField, sortDir]);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredAndSorted.length / LIST_PAGE_SIZE)));
    const pageItems = filteredAndSorted.slice((currentPage - 1) * LIST_PAGE_SIZE, currentPage * LIST_PAGE_SIZE);

    function handleSort(field: SortField) {
        setPage(1);
        if (sortField === field) {
            setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    }

    function toggleSelection(id: string) {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function openActionMenu(event: React.MouseEvent<HTMLElement>, item: Item) {
        event.stopPropagation();
        setActionMenu({ anchorEl: event.currentTarget, item });
    }

    if (isLoading) {
        return (
            <Paper sx={{ p: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} height={48} />
                ))}
            </Paper>
        );
    }

    if (!items?.length) {
        return (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">{t('Keine Artikel gefunden', 'No items found')}</Typography>
                {loadError && <Button onClick={onRetry}>{t('Erneut versuchen', 'Retry')}</Button>}
            </Paper>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <TextField
                    label={t('Nach Name oder Kategorie suchen', 'Search by name or category')}
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    size="small"
                    sx={{ flex: '1 1 280px' }}
                />
                <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={viewMode}
                    onChange={(_event, value: 'list' | 'tiles' | null) => {
                        if (!value) return;
                        setViewMode(value);
                        window.localStorage.setItem(isMobile ? 'inventory-item-view-mobile' : 'inventory-item-view-desktop', value);
                    }}
                    aria-label={t('Ansicht', 'View')}
                >
                    <ToggleButton value="list" aria-label={t('Listenansicht', 'List view')}><ViewListIcon /></ToggleButton>
                    <ToggleButton value="tiles" aria-label={t('Kachelansicht', 'Tile view')}><GridViewIcon /></ToggleButton>
                </ToggleButtonGroup>
            </Box>
            {selectedIds.size > 0 && (
                <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1, mb: 2 }}>
                    <Typography sx={{ fontWeight: 700 }}>
                        {t(`${selectedIds.size} Artikel ausgewählt`, `${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'} selected`)}
                    </Typography>
                    <Button
                        color="error"
                        size="small"
                        startIcon={<DeleteIcon />}
                        onClick={() => onDeleteMany([...selectedIds])}
                    >
                        {t('Auswahl löschen', 'Delete selected')}
                    </Button>
                </Paper>
            )}
            {viewMode === 'tiles' ? (
                <Grid container spacing={{ xs: 1, sm: 1.5 }}>
                    {pageItems.map(({ item, totalStock, damaged, remaining }) => {
                        const image = itemImageUrl(item);
                        const color = stockColor(remaining, item.minStock ?? 5);
                        return (
                            <Grid key={item.id} size={{ xs: 6, sm: 3, md: 2 }}>
                                <Card onClick={() => navigate(`/items/${item.id}`)} sx={{ height: '100%', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
                                    <Box sx={{ position: 'relative' }}>
                                        <Checkbox
                                            size="small"
                                            checked={selectedIds.has(item.id)}
                                            onClick={(event) => event.stopPropagation()}
                                            onChange={() => toggleSelection(item.id)}
                                            slotProps={{ input: { 'aria-label': t(`${item.name} auswählen`, `Select ${item.name}`) } }}
                                            sx={{ position: 'absolute', zIndex: 1, top: 2, left: 2, bgcolor: 'rgba(255,255,255,0.82)', borderRadius: 1, p: 0.5 }}
                                        />
                                        {image ? (
                                            <MediaImage src={image} alt={item.name} sx={{ width: '100%', display: 'block', height: { xs: 72, sm: 84 }, objectFit: 'contain', bgcolor: 'grey.100' }} />
                                        ) : (
                                            <Box sx={{ height: { xs: 72, sm: 84 }, bgcolor: 'grey.100', display: 'grid', placeItems: 'center' }}>
                                                <GridViewIcon sx={{ fontSize: { xs: 26, sm: 32 }, color: 'text.disabled' }} />
                                            </Box>
                                        )}
                                    </Box>
                                    <CardContent sx={{ flexGrow: 1, p: { xs: 0.75, sm: 1 }, '&:last-child': { pb: { xs: 0.75, sm: 1 } } }}>
                                        <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography sx={{ fontWeight: 700, fontSize: { xs: '0.85rem', sm: '0.95rem' }, lineHeight: 1.15 }} noWrap>{item.name}</Typography>
                                                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                                                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{item.category || t('Ohne Kategorie', 'No category')}</Typography>
                                                    {item.trackingMode === 'serialized' && (
                                                        <Chip size="small" label={t('SN', 'SN')} variant="outlined" color="info" sx={{ height: 16, fontSize: '0.62rem', px: 0.2 }} />
                                                    )}
                                                </Stack>
                                            </Box>
                                            <IconButton
                                                size="small"
                                                aria-label={t('Artikelaktionen öffnen', 'Open item actions')}
                                                onClick={(event) => openActionMenu(event, item)}
                                                sx={{ mt: -0.5, mr: -0.5 }}
                                            >
                                                <MoreVertIcon fontSize="small" />
                                            </IconButton>
                                        </Stack>
                                        <Typography sx={{ mt: 0.5, fontWeight: 800, fontSize: { xs: '1.1rem', sm: '1.2rem' }, lineHeight: 1, color }}>
                                            {remaining}/{totalStock}
                                        </Typography>
                                        {damaged > 0 && (
                                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.25 }}>
                                                {damaged} {t('defekt', 'damaged')}
                                            </Typography>
                                        )}
                                    </CardContent>
                                </Card>
                            </Grid>
                        );
                    })}
                    {filteredAndSorted.length === 0 && <Grid size={{ xs: 12 }}><Paper sx={{ p: 3 }}><Typography color="text.secondary">{t('Keine Artikel entsprechen den Filtern.', 'No items match the filters.')}</Typography></Paper></Grid>}
                </Grid>
            ) : isMobile ? (
                <Stack spacing={0.5}>
                    {pageItems.map(({ item, totalStock, remaining }) => {
                        const minStock = item.minStock ?? 5;
                        const color = stockColor(remaining, minStock);
                        return (
                            <Paper key={item.id} onClick={() => navigate(`/items/${item.id}`)} sx={{ px: 0.5, py: 0.25, cursor: 'pointer' }}>
                                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                    <Checkbox
                                        size="small"
                                        checked={selectedIds.has(item.id)}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={() => toggleSelection(item.id)}
                                        slotProps={{ input: { 'aria-label': t(`${item.name} auswählen`, `Select ${item.name}`) } }}
                                        sx={{ p: 0.5 }}
                                    />
                                    <Typography noWrap sx={{ minWidth: 0, flexGrow: 1, fontWeight: 700, fontSize: '0.95rem' }}>
                                        {item.name}
                                    </Typography>
                                    <Typography sx={{ flexShrink: 0, color, fontWeight: 800, lineHeight: 1.2 }}>
                                        {remaining}/{totalStock}
                                    </Typography>
                                    <IconButton
                                        size="small"
                                        aria-label={t('Artikelaktionen öffnen', 'Open item actions')}
                                        onClick={(event) => openActionMenu(event, item)}
                                        sx={{ p: 0.5 }}
                                    >
                                        <MoreVertIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            </Paper>
                        );
                    })}
                    {filteredAndSorted.length === 0 && <Paper sx={{ p: 3 }}><Typography color="text.secondary">{t('Keine Artikel entsprechen den Filtern.', 'No items match the filters.')}</Typography></Paper>}
                </Stack>
            ) : <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ '& .MuiTableCell-root': { py: 0.5 }, '& .MuiTableCell-head': { py: 0.75 } }}>
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    size="small"
                                    checked={pageItems.length > 0 && pageItems.every(({ item }) => selectedIds.has(item.id))}
                                    indeterminate={pageItems.some(({ item }) => selectedIds.has(item.id)) && !pageItems.every(({ item }) => selectedIds.has(item.id))}
                                    onChange={() => {
                                        const visibleIds = pageItems.map(({ item }) => item.id);
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
                                    slotProps={{ input: { 'aria-label': t('Alle sichtbaren Artikel auswählen', 'Select all visible items') } }}
                                />
                            </TableCell>
                            <TableCell>{t('Name', 'Name')}</TableCell>
                            <TableCell>{t('Kategorie', 'Category')}</TableCell>
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap', minWidth: 100 }}>
                                <TableSortLabel
                                    active={sortField === 'stock'}
                                    direction={sortField === 'stock' ? sortDir : 'asc'}
                                    onClick={() => handleSort('stock')}
                                >
                                    {t('Bestand', 'Stock')}
                                </TableSortLabel>
                            </TableCell>
                            <TableCell align="right">
                                <TableSortLabel
                                    active={sortField === 'value'}
                                    direction={sortField === 'value' ? sortDir : 'asc'}
                                    onClick={() => handleSort('value')}
                                >
                                    {t('Einzelwert', 'Unit value')}
                                </TableSortLabel>
                            </TableCell>
                            <TableCell>{t('Lagerort', 'Storage location')}</TableCell>
                            <TableCell>{t('Events', 'Events')}</TableCell>
                            <TableCell padding="checkbox" />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {pageItems.map(({ item, totalStock, damaged, remaining }) => {
                            const minStock = item.minStock ?? 5;
                            const color = stockColor(remaining, minStock);
                            return (
                                <TableRow
                                    key={item.id}
                                    hover
                                    onClick={() => navigate(`/items/${item.id}`)}
                                    sx={{ cursor: 'pointer' }}
                                >
                                    <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                                        <Checkbox
                                            size="small"
                                            checked={selectedIds.has(item.id)}
                                            onChange={() => toggleSelection(item.id)}
                                            slotProps={{ input: { 'aria-label': t(`${item.name} auswählen`, `Select ${item.name}`) } }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>{item.name}</Typography>
                                            {item.trackingMode === 'serialized' && (
                                                <Chip size="small" label={t('Einzelgeräte', 'Serialized')} variant="outlined" color="info" sx={{ height: 20, fontSize: '0.7rem' }} />
                                            )}
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                        {item.category}{item.subcategory ? ` · ${item.subcategory}` : ''}
                                    </TableCell>
                                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                        <Typography
                                            component="span"
                                            variant="body2"
                                            sx={{ color, fontWeight: remaining <= minStock ? 700 : 400 }}
                                        >
                                            {remaining}/{totalStock}
                                        </Typography>
                                        {damaged > 0 && (
                                            <Typography component="span" variant="caption" color="text.secondary" noWrap>
                                                {' · '}{damaged} {t('defekt', 'damaged')}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="right">{item.value?.toFixed(2) ?? '0.00'} €</TableCell>
                                    <TableCell>
                                        {(() => {
                                            const loc = item.expand?.storageLocation;
                                            return loc
                                                ? [loc.name, loc.location, loc.position].filter(Boolean).join(' / ')
                                                : item.storageLocation || '—';
                                        })()}
                                    </TableCell>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                        {item.eventTypes?.join(', ') || '—'}
                                    </TableCell>
                                    <TableCell align="right" padding="checkbox" onClick={(event) => event.stopPropagation()}>
                                        <IconButton
                                            size="small"
                                            aria-label={t('Artikelaktionen öffnen', 'Open item actions')}
                                            onClick={(event) => openActionMenu(event, item)}
                                        >
                                            <MoreVertIcon fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {filteredAndSorted.length === 0 && (
                            <TableRow><TableCell colSpan={8}>{t('Keine Artikel entsprechen den Filtern.', 'No items match the filters.')}</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>}
            <ListPagination count={filteredAndSorted.length} page={currentPage} onChange={setPage} loadingMore={loadingMore} loadError={loadError} onRetry={onRetry} />
            <Menu
                anchorEl={actionMenu?.anchorEl}
                open={Boolean(actionMenu)}
                onClose={() => setActionMenu(null)}
            >
                <MenuItem onClick={() => {
                    if (actionMenu) onEdit(actionMenu.item);
                    setActionMenu(null);
                }}>
                    <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                    {t('Bearbeiten', 'Edit')}
                </MenuItem>
                <MenuItem sx={{ color: 'error.main' }} onClick={() => {
                    if (actionMenu) onDelete(actionMenu.item.id);
                    setActionMenu(null);
                }}>
                    <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
                    {t('Löschen', 'Delete')}
                </MenuItem>
            </Menu>
        </Box>
    );
}
