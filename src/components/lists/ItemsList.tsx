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
    IconButton,
    Chip,
    Skeleton,
    Typography,
    TextField,
    Box,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { useNavigate } from 'react-router-dom';
import type { DamageReport, Item, StockTransaction } from '../../types';

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

function getCheckedOut(itemId: string, transactions: StockTransaction[] | undefined): number {
    if (!transactions) return 0;
    let net = 0;
    for (const tx of transactions) {
        if (tx.itemId !== itemId) continue;
        if (tx.transactionType === 'checkout') net += tx.quantityChanged;
        else if (tx.transactionType === 'checkin') net -= tx.quantityChanged;
    }
    return Math.max(0, net);
}

function getDamaged(itemId: string, reports: DamageReport[] | undefined): number {
    if (!reports) return 0;
    return reports
        .filter(
            (report) =>
                report.itemId === itemId &&
                (report.status === 'reported' || report.status === 'in_review'),
        )
        .reduce((sum, report) => sum + (report.amount ?? 0), 0);
}

type SortField = 'value' | 'stock' | null;
type SortDir = 'asc' | 'desc';

export function ItemsList({ items, transactions, damageReports, isLoading, onEdit, onDelete }: Props) {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState<SortField>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    const enrichedItems = useMemo(() => {
        if (!items) return [];
        return items.map((item) => {
            const checkedOut = getCheckedOut(item.id, transactions);
            const damaged = getDamaged(item.id, damageReports);
            const remaining = Math.max(0, item.amount - checkedOut - damaged);
            return { item, checkedOut, damaged, remaining };
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

        if (sortField) {
            result = [...result].sort((a, b) => {
                let cmp = 0;
                if (sortField === 'value') cmp = (a.item.value ?? 0) - (b.item.value ?? 0);
                else if (sortField === 'stock') cmp = a.remaining - b.remaining;
                return sortDir === 'asc' ? cmp : -cmp;
            });
        }

        return result;
    }, [enrichedItems, search, sortField, sortDir]);

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
                <Typography color="text.secondary">No items found</Typography>
            </Paper>
        );
    }

    return (
        <Box>
            <TextField
                label="Search by name or category"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                size="small"
                fullWidth
                sx={{ mb: 2 }}
            />
            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Category</TableCell>
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap', minWidth: 100 }}>
                                <TableSortLabel
                                    active={sortField === 'stock'}
                                    direction={sortField === 'stock' ? sortDir : 'asc'}
                                    onClick={() => handleSort('stock')}
                                >
                                    Stock
                                </TableSortLabel>
                            </TableCell>
                            <TableCell align="right">
                                <TableSortLabel
                                    active={sortField === 'value'}
                                    direction={sortField === 'value' ? sortDir : 'asc'}
                                    onClick={() => handleSort('value')}
                                >
                                    Unit Value
                                </TableSortLabel>
                            </TableCell>
                            <TableCell>Location</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredAndSorted.map(({ item, checkedOut, damaged, remaining }) => {
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
                                    <TableCell>{item.category}</TableCell>
                                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                        <Typography
                                            variant="body2"
                                            sx={{ color: isLowStock ? 'warning.main' : 'inherit', fontWeight: isLowStock ? 700 : 400 }}
                                        >
                                            {remaining}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap>
                                            {item.amount} total{checkedOut > 0 ? ` · ${checkedOut} out` : ''}{damaged > 0 ? ` · ${damaged} dmg` : ''}
                                            {(item.containerSize ?? 0) > 0 && ` · ${item.containerCount ?? 0} boxes`}
                                        </Typography>
                                        {(item.containerSize ?? 0) > 0 && (item.containersOpened ?? 0) > 0 && (
                                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                                                {item.containersOpened} opened · {item.containerRemainingPercent ?? 100}%
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="right">{item.value?.toFixed(2) ?? '0.00'} €</TableCell>
                                    <TableCell>{[item.storageLocation, item.position].filter(Boolean).join(' / ')}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={item.status.replace('_', ' ')}
                                            color={statusColors[item.status] ?? 'default'}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                        <IconButton size="small" onClick={() => onEdit(item)} aria-label="edit item">
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton size="small" onClick={() => onDelete(item.id)} aria-label="delete item">
                                            <DeleteIcon />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
