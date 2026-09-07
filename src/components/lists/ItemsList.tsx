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
    Chip,
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
    CardActions,
    Checkbox,
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
import { TooltipButton } from '../shared/TooltipButton';
import { EVENT_TYPES, type DamageReport, type EventType, type Item, type StockTransaction } from '../../types';
import { calculateItemStock } from '../../utils/stock';
import { formatStatus } from '../../utils/formatters';
import { useTranslate } from '../../utils/naming';
import { useUIStore } from '../../store/uiStore';
import { itemImageUrl } from '../../utils/itemImages';

interface Props {
    items: Item[] | undefined;
    transactions: StockTransaction[] | undefined;
    damageReports: DamageReport[] | undefined;
    isLoading: boolean;
    onEdit: (item: Item) => void;
    onDelete: (id: string) => void;
    onDeleteMany: (ids: string[]) => void;
}

const statusColors: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    available: 'success',
    checked_out: 'warning',
    damaged: 'error',
    retired: 'default',
};

type SortField = 'value' | 'stock' | null;
type SortDir = 'asc' | 'desc';
type ViewMode = 'list' | 'tiles';

function stockColor(remaining: number, minStock: number) {
    if (remaining <= 0) return 'error.main';
    if (remaining <= minStock) return 'warning.main';
    return 'success.main';
}

export function ItemsList({ items, transactions, damageReports, isLoading, onEdit, onDelete, onDeleteMany }: Props) {
    const navigate = useNavigate();
    const t = useTranslate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const activeEventType = useUIStore((state) => state.activeEventType);
    const setActiveEventType = useUIStore((state) => state.setActiveEventType);
    const [search, setSearch] = useState('');
    const [eventFilter, setEventFilter] = useState<EventType | ''>(activeEventType);
    const [sortField, setSortField] = useState<SortField>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const saved = window.localStorage.getItem(isMobile ? 'inventory-item-view-mobile' : 'inventory-item-view-desktop');
        return saved === 'list' || saved === 'tiles' ? saved : isMobile ? 'tiles' : 'list';
    });
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
    const [actionMenu, setActionMenu] = useState<{ anchorEl: HTMLElement; item: Item } | null>(null);

    useEffect(() => setEventFilter(activeEventType), [activeEventType]);
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
            const { totalStock, checkedOut, damaged, remaining } = calculateItemStock(item.id, transactions, damageReports, item.amount ?? 0);
            return { item, totalStock, checkedOut, damaged, remaining };
        });
    }, [items, transactions, damageReports]);

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

        if (eventFilter) {
            result = result.filter(({ item }) => item.eventTypes?.includes(eventFilter));
        }

        if (sortField) {
            result = [...result].sort((a, b) => {
                let cmp = 0;
                if (sortField === 'value') cmp = (a.item.value ?? 0) - (b.item.value ?? 0);
                else if (sortField === 'stock') cmp = a.remaining - b.remaining;
                return sortDir === 'asc' ? cmp : -cmp;
            });
        }

        return result;
    }, [enrichedItems, search, eventFilter, sortField, sortDir]);

    function handleSort(field: SortField) {
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
            </Paper>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <TextField
                    label={t('Nach Name oder Kategorie suchen', 'Search by name or category')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    size="small"
                    sx={{ flex: '1 1 280px' }}
                />
                <TextField
                    select
                    label={t('Event filtern', 'Filter event')}
                    value={eventFilter}
                    onChange={(event) => {
                        const value = event.target.value as EventType | '';
                        setEventFilter(value);
                        if (value) setActiveEventType(value);
                    }}
                    size="small"
                    sx={{ minWidth: { xs: '100%', sm: 170 } }}
                >
                    <MenuItem value="">{t('Alle Events', 'All events')}</MenuItem>
                    {EVENT_TYPES.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                </TextField>
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
                    {filteredAndSorted.map(({ item, totalStock, checkedOut, damaged, remaining }) => {
                        const image = itemImageUrl(item);
                        const color = stockColor(remaining, item.minStock ?? 5);
                        return (
                            <Grid key={item.id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                                <Card onClick={() => navigate(`/items/${item.id}`)} sx={{ height: '100%', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
                                    <Box sx={{ position: 'relative' }}>
                                        <Checkbox
                                            checked={selectedIds.has(item.id)}
                                            onClick={(event) => event.stopPropagation()}
                                            onChange={() => toggleSelection(item.id)}
                                            slotProps={{ input: { 'aria-label': t(`${item.name} auswählen`, `Select ${item.name}`) } }}
                                            sx={{ position: 'absolute', zIndex: 1, top: 2, left: 2, bgcolor: 'rgba(255,255,255,0.82)', borderRadius: 1, p: 0.5 }}
                                        />
                                        {image ? (
                                            <MediaImage src={image} alt={item.name} sx={{ width: '100%', display: 'block', height: { xs: 88, sm: 112 }, objectFit: 'contain', bgcolor: 'grey.100' }} />
                                        ) : (
                                            <Box sx={{ height: { xs: 88, sm: 112 }, bgcolor: 'grey.100', display: 'grid', placeItems: 'center' }}>
                                                <GridViewIcon sx={{ fontSize: { xs: 30, sm: 38 }, color: 'text.disabled' }} />
                                            </Box>
                                        )}
                                    </Box>
                                    <CardContent sx={{ flexGrow: 1, p: { xs: 1, sm: 1.25 }, '&:last-child': { pb: { xs: 0.5, sm: 0.75 } } }}>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.5} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'flex-start' } }}>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography sx={{ fontWeight: 700, fontSize: { xs: '0.85rem', sm: '0.95rem' }, lineHeight: 1.15 }} noWrap>{item.name}</Typography>
                                                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{item.category || t('Ohne Kategorie', 'No category')}</Typography>
                                            </Box>
                                            <Chip label={formatStatus(item.status)} color={statusColors[item.status] ?? 'default'} size="small" sx={{ alignSelf: 'flex-start', display: { xs: 'none', sm: 'inline-flex' } }} />
                                        </Stack>
                                        <Typography sx={{ mt: 0.75, fontWeight: 800, fontSize: { xs: '1.35rem', sm: '1.55rem' }, lineHeight: 1, color }}>
                                            {remaining}/{totalStock}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.25 }}>{t('verfügbar / gesamt', 'available / total')}{checkedOut ? ` · ${checkedOut} ${t('ausgeliehen', 'out')}` : ''}{damaged ? ` · ${damaged} ${t('defekt', 'damaged')}` : ''}</Typography>
                                        {item.hint && <Typography variant="caption" sx={{ mt: 0.5, display: { xs: 'none', sm: '-webkit-box' }, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} color="text.secondary">{item.hint}</Typography>}
                                    </CardContent>
                                    <CardActions onClick={(event) => event.stopPropagation()} sx={{ justifyContent: 'flex-end', p: 0.25, minHeight: 36, '& .MuiIconButton-root': { p: 0.65 } }}>
                                        {isMobile ? (
                                            <IconButton aria-label={t('Artikelaktionen öffnen', 'Open item actions')} onClick={(event) => openActionMenu(event, item)}><MoreVertIcon /></IconButton>
                                        ) : (
                                            <>
                                                <TooltipButton variant="icon" tooltipText={t('Artikeldetails bearbeiten', 'Edit item details')} icon={<EditIcon />} onClick={() => onEdit(item)} />
                                                <TooltipButton variant="icon" tooltipText={t('Artikel löschen', 'Delete item')} icon={<DeleteIcon />} color="error" onClick={() => onDelete(item.id)} />
                                            </>
                                        )}
                                    </CardActions>
                                </Card>
                            </Grid>
                        );
                    })}
                    {filteredAndSorted.length === 0 && <Grid size={{ xs: 12 }}><Paper sx={{ p: 3 }}><Typography color="text.secondary">{t('Keine Artikel entsprechen den Filtern.', 'No items match the filters.')}</Typography></Paper></Grid>}
                </Grid>
            ) : isMobile ? (
                <Stack spacing={1.5}>
                    {filteredAndSorted.map(({ item, totalStock, checkedOut, damaged, remaining }) => {
                        const minStock = item.minStock ?? 5;
                        const color = stockColor(remaining, minStock);
                        const location = item.expand?.storageLocation
                            ? [item.expand.storageLocation.name, item.expand.storageLocation.location, item.expand.storageLocation.position].filter(Boolean).join(' / ')
                            : item.storageLocation || '—';
                        return (
                            <Paper key={item.id} onClick={() => navigate(`/items/${item.id}`)} sx={{ p: 2, cursor: 'pointer' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="h6" sx={{ fontSize: '1rem', overflowWrap: 'anywhere' }}>{item.name}</Typography>
                                        <Typography variant="body2" color="text.secondary">{item.category || t('Ohne Kategorie', 'No category')}</Typography>
                                    </Box>
                                    <Chip label={formatStatus(item.status)} color={statusColors[item.status] ?? 'default'} size="small" />
                                </Box>
                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, my: 1.5 }}>
                                    <Box>
                                        <Typography variant="caption" color="text.secondary">{t('Verfügbar', 'Available')}</Typography>
                                        <Typography variant="h5" sx={{ color }}>{remaining}/{totalStock}</Typography>
                                        <Typography variant="caption" color="text.secondary">{t('verfügbar / gesamt', 'available / total')}{checkedOut ? ` · ${checkedOut} ${t('ausgeliehen', 'out')}` : ''}{damaged ? ` · ${damaged} ${t('defekt', 'damaged')}` : ''}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" color="text.secondary">{t('Lagerort', 'Storage location')}</Typography>
                                        <Typography variant="body2">{location}</Typography>
                                    </Box>
                                </Box>
                                <Box onClick={(event) => event.stopPropagation()} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, pt: 0.5 }}>
                                    <Checkbox
                                        checked={selectedIds.has(item.id)}
                                        onChange={() => toggleSelection(item.id)}
                                        slotProps={{ input: { 'aria-label': t(`${item.name} auswählen`, `Select ${item.name}`) } }}
                                    />
                                    <IconButton aria-label={t('Artikelaktionen öffnen', 'Open item actions')} onClick={(event) => openActionMenu(event, item)}><MoreVertIcon /></IconButton>
                                </Box>
                            </Paper>
                        );
                    })}
                    {filteredAndSorted.length === 0 && <Paper sx={{ p: 3 }}><Typography color="text.secondary">{t('Keine Artikel entsprechen den Filtern.', 'No items match the filters.')}</Typography></Paper>}
                </Stack>
            ) : <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    checked={filteredAndSorted.length > 0 && filteredAndSorted.every(({ item }) => selectedIds.has(item.id))}
                                    indeterminate={filteredAndSorted.some(({ item }) => selectedIds.has(item.id)) && !filteredAndSorted.every(({ item }) => selectedIds.has(item.id))}
                                    onChange={() => {
                                        const visibleIds = filteredAndSorted.map(({ item }) => item.id);
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
                            <TableCell>{t('Status', 'Status')}</TableCell>
                            <TableCell align="right">{t('Aktionen', 'Actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredAndSorted.map(({ item, totalStock, checkedOut, damaged, remaining }) => {
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
                                            checked={selectedIds.has(item.id)}
                                            onChange={() => toggleSelection(item.id)}
                                            slotProps={{ input: { 'aria-label': t(`${item.name} auswählen`, `Select ${item.name}`) } }}
                                        />
                                    </TableCell>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell>
                                        {item.category}
                                        {item.subcategory && (
                                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                                                {item.subcategory}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                        <Typography
                                            variant="body2"
                                            sx={{ color, fontWeight: remaining <= minStock ? 700 : 400 }}
                                        >
                                            {remaining}/{totalStock}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap>
                                            {t('verfügbar / gesamt', 'available / total')}{checkedOut > 0 ? ` · ${checkedOut} ${t('ausgeliehen', 'checked out')}` : ''}{damaged > 0 ? ` · ${damaged} ${t('defekt', 'damaged')}` : ''}
                                            {(item.containerSize ?? 0) > 0 && ` · ${item.containerCount ?? 0} ${t('Kartons', 'containers')}`}
                                        </Typography>
                                        {(item.containerSize ?? 0) > 0 && (item.containersOpened ?? 0) > 0 && (
                                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                                                {item.containersOpened} {t('geöffnet', 'opened')} · {item.containerRemainingPercent ?? 100}%
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
                                    <TableCell>
                                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                            {item.eventTypes?.map((type) => <Chip key={type} label={type} size="small" variant="outlined" />)}
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={formatStatus(item.status)}
                                            color={statusColors[item.status] ?? 'default'}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                        <TooltipButton
                                            variant="icon"
                                            tooltipText={t('Artikeldetails bearbeiten', 'Edit item details')}
                                            icon={<EditIcon />}
                                            size="small"
                                            onClick={() => onEdit(item)}
                                        />
                                        <TooltipButton
                                            variant="icon"
                                            tooltipText={t('Artikel löschen', 'Delete item')}
                                            icon={<DeleteIcon />}
                                            size="small"
                                            color="error"
                                            onClick={() => onDelete(item.id)}
                                        />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {filteredAndSorted.length === 0 && (
                            <TableRow><TableCell colSpan={9}>{t('Keine Artikel entsprechen den Filtern.', 'No items match the filters.')}</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>}
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
