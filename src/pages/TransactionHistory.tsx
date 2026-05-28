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
                showSnackbar('Transaktion erfasst', 'success');
            },
            onError: () => showSnackbar('Fehler beim Erfassen der Transaktion', 'error'),
        });
    }

    function handleUpdate(data: TransactionFormData) {
        if (!editingTransaction) return;
        updateTransaction.mutate(
            { id: editingTransaction.id, data },
            {
                onSuccess: () => {
                    setEditingTransaction(null);
                    showSnackbar('Transaktion erfolgreich aktualisiert', 'success');
                },
                onError: () => showSnackbar('Fehler beim Aktualisieren der Transaktion', 'error'),
            },
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h4">Transaktionsverlauf</Typography>
                <TooltipButton
                    tooltipText={showForm ? "Formular ausblenden" : "Neue Ausleihe oder Rückgabe erfassen"}
                    label={showForm ? 'Formular ausblenden' : 'Neue Transaktion'}
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
                    label="Artikel"
                    value={transactionFilters.itemId}
                    onChange={(e) => setTransactionFilters({ itemId: e.target.value })}
                    size="small"
                    sx={{ minWidth: 150 }}
                >
                    <MenuItem value="">Alle Artikel</MenuItem>
                    {items?.map((item) => (
                        <MenuItem key={item.id} value={item.id}>
                            {item.name}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    select
                    label="Typ"
                    value={transactionFilters.transactionType}
                    onChange={(e) => setTransactionFilters({ transactionType: e.target.value })}
                    size="small"
                    sx={{ minWidth: 120 }}
                >
                    <MenuItem value="">Alle</MenuItem>
                    <MenuItem value="checkout">Ausleihe</MenuItem>
                    <MenuItem value="checkin">Rückgabe</MenuItem>
                    <MenuItem value="added">Hinzugefügt</MenuItem>
                </TextField>
                <TextField
                    label="Startdatum"
                    type="date"
                    value={transactionFilters.startDate}
                    onChange={(e) => setTransactionFilters({ startDate: e.target.value })}
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                    label="Enddatum"
                    type="date"
                    value={transactionFilters.endDate}
                    onChange={(e) => setTransactionFilters({ endDate: e.target.value })}
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                />
                <Tooltip title="Alle Filter zurücksetzen" arrow>
                    <Button variant="outlined" onClick={resetTransactionFilters} size="small">
                        Zurücksetzen
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
                <DialogTitle>Transaktion bearbeiten</DialogTitle>
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
