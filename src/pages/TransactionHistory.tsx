import { Box, Typography, Stack, TextField, MenuItem, Button, Tooltip, Dialog, DialogTitle, DialogContent } from '@mui/material';
import { TransactionHistory as TransactionHistoryList } from '../components/lists/TransactionHistory';
import { TransactionForm } from '../components/forms/TransactionForm';
import { useTransactions, useCreateTransaction, useUpdateTransaction } from '../hooks/useTransactions';
import { useItems } from '../hooks/useItems';
import { useUsers } from '../hooks/useUsers';
import { useUIStore } from '../store/uiStore';
import { TooltipButton } from '../components/shared/TooltipButton';
import type { TransactionFormData, StockTransaction } from '../types';
import { useState } from 'react';
import { nameFor, useNames, useTranslate } from '../utils/naming';

export function TransactionHistoryPage() {
    const names = useNames();
    const t = useTranslate();
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
    const { data: users } = useUsers();
    const createTransaction = useCreateTransaction();
    const updateTransaction = useUpdateTransaction();
    const [showForm, setShowForm] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<StockTransaction | null>(null);

    function handleSubmit(data: TransactionFormData) {
        createTransaction.mutate(data, {
            onSuccess: () => {
                setShowForm(false);
                showSnackbar(t('Transaktion erfasst', 'Transaction recorded'), 'success');
            },
            onError: () => showSnackbar(t('Fehler beim Erfassen der Transaktion', 'Could not record transaction'), 'error'),
        });
    }

    function handleUpdate(data: TransactionFormData) {
        if (!editingTransaction) return;
        updateTransaction.mutate(
            { id: editingTransaction.id, data },
            {
                onSuccess: () => {
                    setEditingTransaction(null);
                    showSnackbar(t('Transaktion erfolgreich aktualisiert', 'Transaction updated successfully'), 'success');
                },
                onError: () => showSnackbar(t('Fehler beim Aktualisieren der Transaktion', 'Could not update transaction'), 'error'),
            },
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h4">{t('Transaktionsverlauf', 'Transaction history')}</Typography>
                <TooltipButton
                    tooltipText={showForm ? t('Formular ausblenden', 'Hide form') : t('Neue Ausleihe oder Rückgabe erfassen', 'Record a new checkout or return')}
                    label={showForm ? t('Formular ausblenden', 'Hide form') : t('Neue Transaktion', 'New transaction')}
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
                    label={t('Artikel', 'Item')}
                    value={transactionFilters.itemId}
                    onChange={(e) => setTransactionFilters({ itemId: e.target.value })}
                    size="small"
                    sx={{ minWidth: 150 }}
                >
                    <MenuItem value="">{t('Alle Artikel', 'All items')}</MenuItem>
                    {items?.map((item) => (
                        <MenuItem key={item.id} value={item.id}>
                            {item.name}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    select
                    label={t('Benutzer', 'User')}
                    value={transactionFilters.userId}
                    onChange={(e) => setTransactionFilters({ userId: e.target.value })}
                    size="small"
                    sx={{ minWidth: 150 }}
                >
                    <MenuItem value="">{t('Alle Benutzer', 'All users')}</MenuItem>
                    {users?.map((user) => (
                        <MenuItem key={user.id} value={user.id}>
                            {user.name?.trim() || user.username || user.email || user.id}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    select
                    label={t('Typ', 'Type')}
                    value={transactionFilters.transactionType}
                    onChange={(e) => setTransactionFilters({ transactionType: e.target.value })}
                    size="small"
                    sx={{ minWidth: 120 }}
                >
                    <MenuItem value="">{t('Alle', 'All')}</MenuItem>
                    {(['checkout', 'checkin', 'added', 'repaired', 'written_off'] as const).map((type) => (
                        <MenuItem key={type} value={type}>{nameFor('transactionType', type)}</MenuItem>
                    ))}
                </TextField>
                <TextField
                    label={t('Startdatum', 'Start date')}
                    type="date"
                    value={transactionFilters.startDate}
                    onChange={(e) => setTransactionFilters({ startDate: e.target.value })}
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                    label={t('Enddatum', 'End date')}
                    type="date"
                    value={transactionFilters.endDate}
                    onChange={(e) => setTransactionFilters({ endDate: e.target.value })}
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                />
                <Tooltip title={t('Alle Filter zurücksetzen', 'Reset all filters')} arrow>
                    <Button variant="outlined" onClick={resetTransactionFilters} size="small">
                        {names.action.reset}
                    </Button>
                </Tooltip>
            </Stack>

            <TransactionHistoryList
                transactions={transactions}
                items={items}
                users={users}
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
                <DialogTitle>{t('Transaktion bearbeiten', 'Edit transaction')}</DialogTitle>
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
