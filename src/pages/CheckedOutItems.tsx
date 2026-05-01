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
} from '@mui/material';
import { useItems } from '../hooks/useItems';
import { useTransactions, useCreateTransaction } from '../hooks/useTransactions';
import { useUIStore } from '../store/uiStore';

interface CheckedOutRow {
    id: string;
    name: string;
    category: string;
    storageLocation: string;
    checkedOut: number;
}

export function CheckedOutItemsPage() {
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
                    storageLocation: item.storageLocation,
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
                reason: 'Return after use',
                notes: 'Quick return from checked-out items view',
            },
            {
                onSuccess: () => showSnackbar('Item returned', 'success'),
                onError: () => showSnackbar('Failed to return item', 'error'),
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
                Checked Out Items
            </Typography>

            {checkedOutRows.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">No checked out items right now</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Category</TableCell>
                                <TableCell>Storage Location</TableCell>
                                <TableCell align="right">Checked Out</TableCell>
                                <TableCell align="right">Action</TableCell>
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
                                        <Button
                                            size="small"
                                            variant="contained"
                                            onClick={() => handleQuickReturn(row.id)}
                                            disabled={createTransaction.isPending}
                                        >
                                            Quick Return
                                        </Button>
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
