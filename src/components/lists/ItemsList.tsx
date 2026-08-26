import { useState, useMemo } from 'react';
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
    MenuItem,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { useNavigate } from 'react-router-dom';
import { TooltipButton } from '../shared/TooltipButton';
import { EVENT_TYPES, type DamageReport, type EventType, type Item, type StockTransaction } from '../../types';
import { calculateItemStock } from '../../utils/stock';
import { formatStatus } from '../../utils/formatters';
import { useTranslate } from '../../utils/naming';

interface Props {
    items: Item[] | undefined;
    transactions: StockTransaction[] | undefined;
    damageReports: DamageReport[] | undefined;
    isLoading: boolean;
    onEdit: (item: Item) => void;
    onDelete: (id: string) => void;
}

const statusColors: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    available: 'success',
    checked_out: 'warning',
    damaged: 'error',
    retired: 'default',
};

type SortField = 'value' | 'stock' | null;
type SortDir = 'asc' | 'desc';

export function ItemsList({ items, transactions, damageReports, isLoading, onEdit, onDelete }: Props) {
    const navigate = useNavigate();
    const t = useTranslate();
    const [search, setSearch] = useState('');
    const [eventFilter, setEventFilter] = useState<EventType | ''>('');
    const [sortField, setSortField] = useState<SortField>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');

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
                    onChange={(event) => setEventFilter(event.target.value as EventType | '')}
                    size="small"
                    sx={{ minWidth: 170 }}
                >
                    <MenuItem value="">{t('Alle Events', 'All events')}</MenuItem>
                    {EVENT_TYPES.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                </TextField>
            </Box>
            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
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
                            <TableCell>{t('Events', 'Events')}</TableCell>
                            <TableCell>{t('Lagerort', 'Storage location')}</TableCell>
                            <TableCell>{t('Status', 'Status')}</TableCell>
                            <TableCell align="right">{t('Aktionen', 'Actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredAndSorted.map(({ item, totalStock, checkedOut, damaged, remaining }) => {
                            const minStock = item.minStock ?? 5;
                            const isLowStock = remaining <= minStock;
                            return (
                                <TableRow
                                    key={item.id}
                                    hover
                                    onClick={() => navigate(`/items/${item.id}`)}
                                    sx={{ cursor: 'pointer' }}
                                >
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
                                            sx={{ color: isLowStock ? 'warning.main' : 'inherit', fontWeight: isLowStock ? 700 : 400 }}
                                        >
                                            {remaining}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap>
                                            {totalStock} {t('gesamt', 'total')}{checkedOut > 0 ? ` · ${checkedOut} ${t('ausgeliehen', 'checked out')}` : ''}{damaged > 0 ? ` · ${damaged} ${t('defekt', 'damaged')}` : ''}
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
                            <TableRow><TableCell colSpan={8}>{t('Keine Artikel entsprechen den Filtern.', 'No items match the filters.')}</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
