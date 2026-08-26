import { useMemo } from 'react';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Button,
    Skeleton,
    Tooltip,
    Stack,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import { useItems } from '../hooks/useItems';
import { useTransactions, useCreateTransaction } from '../hooks/useTransactions';
import { useUIStore } from '../store/uiStore';
import { useNames, useTranslate } from '../utils/naming';

interface CheckedOutRow {
    id: string;
    name: string;
    category: string;
    storageLocation: string;
    checkedOut: number;
}

export function CheckedOutItemsPage() {
    const names = useNames();
    const t = useTranslate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const { data: items, isLoading: itemsLoading } = useItems();
    const { data: transactions, isLoading: txLoading } = useTransactions();
    const createTransaction = useCreateTransaction();
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    const checkedOutRows = useMemo<CheckedOutRow[]>(() => {
        if (!items?.length) return [];

        return items
            .map((item) => {
                const checkedOut = (transactions ?? [])
                    .filter((tx) => tx.itemId === item.id)
                    .reduce((count, tx) => {
                        if (tx.transactionType === 'checkout') return count + tx.quantityChanged;
                        if (tx.transactionType === 'checkin') return count - tx.quantityChanged;
                        return count;
                    }, 0);

                return {
                    id: item.id,
                    name: item.name,
                    category: item.category,
                    storageLocation: (() => {
                        const loc = item.expand?.storageLocation;
                        return loc
                            ? [loc.name, loc.location, loc.position].filter(Boolean).join(' / ')
                            : item.storageLocation || '—';
                    })(),
                    checkedOut: Math.max(0, checkedOut),
                };
            })
            .filter((row) => row.checkedOut > 0)
            .sort((a, b) => b.checkedOut - a.checkedOut);
    }, [items, transactions]);

    function handleQuickReturn(itemId: string) {
        createTransaction.mutate(
            {
                itemId,
                transactionType: 'checkin',
                quantityChanged: 1,
                reason: names.reason.returnAfterUse,
                notes: t('Schnelle Rückgabe aus der Ansicht für ausgeliehene Artikel', 'Quick return from the checked-out items view'),
            },
            {
                onSuccess: () => showSnackbar(t('Artikel zurückgegeben', 'Item returned'), 'success'),
                onError: () => showSnackbar(t('Fehler bei der Rückgabe des Artikels', 'Could not return item'), 'error'),
            },
        );
    }

    if (itemsLoading || txLoading) {
        return (
            <Paper sx={{ p: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} height={48} />
                ))}
            </Paper>
        );
    }

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                {t('Ausgeliehene Artikel', 'Checked-out items')}
            </Typography>

            {checkedOutRows.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">{t('Derzeit sind keine Artikel ausgeliehen.', 'No items are currently checked out.')}</Typography>
                </Paper>
            ) : (
                isMobile ? (
                    <Stack spacing={1.5}>
                        {checkedOutRows.map((row) => (
                            <Paper key={row.id} sx={{ p: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="h6" sx={{ fontSize: '1rem', overflowWrap: 'anywhere' }}>{row.name}</Typography>
                                        <Typography variant="body2" color="text.secondary">{row.category || '—'} · {row.storageLocation}</Typography>
                                    </Box>
                                    <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
                                        <Typography variant="h5" color="warning.main">{row.checkedOut}</Typography>
                                        <Typography variant="caption" color="text.secondary">{t('draußen', 'out')}</Typography>
                                    </Box>
                                </Box>
                                <Button
                                    fullWidth
                                    variant="contained"
                                    color="success"
                                    startIcon={<AssignmentReturnIcon />}
                                    onClick={() => handleQuickReturn(row.id)}
                                    disabled={createTransaction.isPending}
                                    sx={{ mt: 2, minHeight: 48 }}
                                >
                                    {t('1 Einheit zurückgeben', 'Return 1 unit')}
                                </Button>
                            </Paper>
                        ))}
                    </Stack>
                ) : <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('Name', 'Name')}</TableCell>
                                <TableCell>{t('Kategorie', 'Category')}</TableCell>
                                <TableCell>{t('Lagerort', 'Storage location')}</TableCell>
                                <TableCell align="right">{t('Ausgeliehen', 'Checked out')}</TableCell>
                                <TableCell align="right">{t('Aktion', 'Action')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {checkedOutRows.map((row) => (
                                <TableRow key={row.id} hover>
                                    <TableCell>{row.name}</TableCell>
                                    <TableCell>{row.category}</TableCell>
                                    <TableCell>{row.storageLocation}</TableCell>
                                    <TableCell align="right">{row.checkedOut}</TableCell>
                                    <TableCell align="right">
                                        <Tooltip title={`${names.action.checkin}: 1 ${t('Einheit', 'unit')}`} arrow>
                                            <span>
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    onClick={() => handleQuickReturn(row.id)}
                                                    disabled={createTransaction.isPending}
                                                >
                                                    {t('Schnellrückgabe', 'Quick return')}
                                                </Button>
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
}
