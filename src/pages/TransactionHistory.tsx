import { Box, Typography, Stack, TextField, MenuItem, Button } from '@mui/material';
import { TransactionHistory as TransactionHistoryList } from '../components/lists/TransactionHistory';
import { TransactionForm } from '../components/forms/TransactionForm';
import { useTransactions, useCreateTransaction } from '../hooks/useTransactions';
import { useItems } from '../hooks/useItems';
import { useUIStore } from '../store/uiStore';
import type { TransactionFormData } from '../types';
import { useState } from 'react';

export function TransactionHistoryPage() {
    const { transactionFilters, setTransactionFilters, resetTransactionFilters } = useUIStore();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const filters = {
        itemId: transactionFilters.itemId || undefined,
        userId: transactionFilters.userId || undefined,
        transactionType: transactionFilters.transactionType || undefined,
        startDate: transactionFilters.startDate || undefined,
        endDate: transactionFilters.endDate || undefined,
    };
    const { data: transactions, isLoading } = useTransactions(filters);
    const { data: items } = useItems();
    const createTransaction = useCreateTransaction();
    const [showForm, setShowForm] = useState(false);

    function handleSubmit(data: TransactionFormData) {
        createTransaction.mutate(data, {
            onSuccess: () => {
                setShowForm(false);
                showSnackbar('Transaction logged', 'success');
            },
            onError: () => showSnackbar('Failed to log transaction', 'error'),
        });
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h4">Transaction History</Typography>
                <Button variant="contained" onClick={() => setShowForm(!showForm)}>
                    {showForm ? 'Hide Form' : 'New Transaction'}
                </Button>
            </Box>

            {showForm && (
                <Box sx={{ mb: 3 }}>
                    <TransactionForm
                        items={items ?? []}
                        onSubmit={handleSubmit}
                        isLoading={createTransaction.isPending}
                    />
                </Box>
            )}

            {/* Filters */}
            <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }} useFlexGap>
                <TextField
                    select
                    label="Item"
                    value={transactionFilters.itemId}
                    onChange={(e) => setTransactionFilters({ itemId: e.target.value })}
                    size="small"
                    sx={{ minWidth: 150 }}
                >
                    <MenuItem value="">All Items</MenuItem>
                    {items?.map((item) => (
                        <MenuItem key={item.id} value={item.id}>
                            {item.name}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    select
                    label="Type"
                    value={transactionFilters.transactionType}
                    onChange={(e) => setTransactionFilters({ transactionType: e.target.value })}
                    size="small"
                    sx={{ minWidth: 120 }}
                >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="checkout">Check Out</MenuItem>
                    <MenuItem value="checkin">Check In</MenuItem>
                    <MenuItem value="added">Added</MenuItem>
                </TextField>
                <TextField
                    label="Start Date"
                    type="date"
                    value={transactionFilters.startDate}
                    onChange={(e) => setTransactionFilters({ startDate: e.target.value })}
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                    label="End Date"
                    type="date"
                    value={transactionFilters.endDate}
                    onChange={(e) => setTransactionFilters({ endDate: e.target.value })}
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                />
                <Button variant="outlined" onClick={resetTransactionFilters} size="small">
                    Reset
                </Button>
            </Stack>

            <TransactionHistoryList transactions={transactions} items={items} isLoading={isLoading} />
        </Box>
    );
}
