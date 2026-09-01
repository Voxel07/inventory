import { useState } from 'react';
import { Box, Button, Dialog, DialogContent, DialogTitle, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { TransactionHistory as TransactionHistoryList } from '../components/lists/TransactionHistory';
import { TransactionForm } from '../components/forms/TransactionForm';
import { useTransactions, useUpdateTransaction } from '../hooks/useTransactions';
import { useItems } from '../hooks/useItems';
import { useUsers } from '../hooks/useUsers';
import { useUIStore } from '../store/uiStore';
import type { StockTransaction, TransactionFormData } from '../types';
import { nameFor, useNames, useTranslate } from '../utils/naming';

export function TransactionHistoryPage() {
  const names = useNames();
  const t = useTranslate();
  const { transactionFilters, setTransactionFilters, resetTransactionFilters } = useUIStore();
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const { data: transactions, isLoading } = useTransactions({
    itemId: transactionFilters.itemId || undefined,
    userId: transactionFilters.userId || undefined,
    transactionType: transactionFilters.transactionType || undefined,
    startDate: transactionFilters.startDate || undefined,
    endDate: transactionFilters.endDate || undefined,
  });
  const { data: items } = useItems();
  const { data: users } = useUsers();
  const updateTransaction = useUpdateTransaction();
  const [editingTransaction, setEditingTransaction] = useState<StockTransaction | null>(null);

  function handleUpdate(data: TransactionFormData) {
    if (!editingTransaction) return;
    updateTransaction.mutate({ id: editingTransaction.id, data }, {
      onSuccess: () => {
        setEditingTransaction(null);
        showSnackbar(t('Transaktion erfolgreich aktualisiert', 'Transaction updated successfully'), 'success');
      },
      onError: () => showSnackbar(t('Fehler beim Aktualisieren der Transaktion', 'Could not update transaction'), 'error'),
    });
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>{t('Transaktionsverlauf', 'Transaction history')}</Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }} useFlexGap>
        <TextField select label={t('Artikel', 'Item')} value={transactionFilters.itemId} onChange={(event) => setTransactionFilters({ itemId: event.target.value })} size="small" sx={{ minWidth: 150 }}>
          <MenuItem value="">{t('Alle Artikel', 'All items')}</MenuItem>
          {items?.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
        </TextField>
        <TextField select label={t('Benutzer', 'User')} value={transactionFilters.userId} onChange={(event) => setTransactionFilters({ userId: event.target.value })} size="small" sx={{ minWidth: 150 }}>
          <MenuItem value="">{t('Alle Benutzer', 'All users')}</MenuItem>
          {users?.map((user) => <MenuItem key={user.id} value={user.id}>{user.name?.trim() || user.username || user.email || user.id}</MenuItem>)}
        </TextField>
        <TextField select label={t('Typ', 'Type')} value={transactionFilters.transactionType} onChange={(event) => setTransactionFilters({ transactionType: event.target.value })} size="small" sx={{ minWidth: 120 }}>
          <MenuItem value="">{t('Alle', 'All')}</MenuItem>
          {(['checkout', 'checkin', 'added', 'repaired', 'written_off'] as const).map((type) => <MenuItem key={type} value={type}>{nameFor('transactionType', type)}</MenuItem>)}
        </TextField>
        <TextField label={t('Startdatum', 'Start date')} type="date" value={transactionFilters.startDate} onChange={(event) => setTransactionFilters({ startDate: event.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label={t('Enddatum', 'End date')} type="date" value={transactionFilters.endDate} onChange={(event) => setTransactionFilters({ endDate: event.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} />
        <Tooltip title={t('Alle Filter zurücksetzen', 'Reset all filters')} arrow>
          <Button variant="outlined" onClick={resetTransactionFilters} size="small">{names.action.reset}</Button>
        </Tooltip>
      </Stack>

      <TransactionHistoryList transactions={transactions} items={items} users={users} isLoading={isLoading} onEdit={setEditingTransaction} />

      <Dialog open={Boolean(editingTransaction)} onClose={() => setEditingTransaction(null)} keepMounted maxWidth="sm" fullWidth>
        <DialogTitle>{t('Transaktion bearbeiten', 'Edit transaction')}</DialogTitle>
        <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
          {editingTransaction && <TransactionForm key={editingTransaction.id} items={items ?? []} initialData={editingTransaction} onSubmit={handleUpdate} isLoading={updateTransaction.isPending} />}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
