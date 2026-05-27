import { Box, Typography, Stack, TextField, MenuItem, Button, Tooltip, Dialog, DialogTitle, DialogContent } from '@mui/material';
import { TransactionHistory as TransactionHistoryList } from '../components/lists/TransactionHistory';
import { TransactionForm } from '../components/forms/TransactionForm';
import { useTransactions, useCreateTransaction, useUpdateTransaction } from '../hooks/useTransactions';
import { useItems } from '../hooks/useItems';
import { useUIStore } from '../store/uiStore';
import { TooltipButton } from '../components/shared/TooltipButton';
import type { TransactionFormData, StockTransaction } from '../types';
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
    const updateTransaction = useUpdateTransaction();
    const [showForm, setShowForm] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<StockTransaction | null>(null);

    function handleSubmit(data: TransactionFormData) {
        createTransaction.mutate(data, {
            onSuccess: () => {
                setShowForm(false);
                showSnackbar('Transaction logged', 'success');
            },
            onError: () => showSnackbar('Failed to log transaction', 'error'),
        });
    }

    function handleUpdate(data: TransactionFormData) {
        if (!editingTransaction) return;
        updateTransaction.mutate(
            { id: editingTransaction.id, data },
            {
                onSuccess: () => {
                    setEditingTransaction(null);
                    showSnackbar('Transaction updated successfully', 'success');
                },
                onError: () => showSnackbar('Failed to update transaction', 'error'),
            },
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h4">Transaction History</Typography>
                <TooltipButton
                    tooltipText={showForm ? "Hide the transaction creation form" : "Log a new check-out or check-in transaction"}
                    label={showForm ? 'Hide Form' : 'New Transaction'}
                    variant="contained"
                    onClick={() => setShowForm(!showForm)}
                />
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
                <Tooltip title="Reset all filters to default" arrow>
                    <Button variant="outlined" onClick={resetTransactionFilters} size="small">
                        Reset
                    </Button>
                </Tooltip>
            </Stack>

            <TransactionHistoryList
                transactions={transactions}
                items={items}
                isLoading={isLoading}
                onEdit={setEditingTransaction}
            />

            {/* Edit Transaction Dialog */}
            <Dialog
                open={Boolean(editingTransaction)}
                onClose={() => setEditingTransaction(null)}
                keepMounted
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Edit Transaction</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    {editingTransaction && (
                        <TransactionForm
                            key={editingTransaction.id}
                            items={items ?? []}
                            initialData={editingTransaction}
                            onSubmit={handleUpdate}
                            isLoading={updateTransaction.isPending}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
}
