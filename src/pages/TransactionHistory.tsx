import { Box, Button, MenuItem, Pagination, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TransactionHistory as TransactionHistoryList } from '../components/lists/TransactionHistory';
import { useTransactions } from '../hooks/useTransactions';
import { useItems } from '../hooks/useItems';
import { useUsers } from '../hooks/useUsers';
import { useUIStore } from '../store/uiStore';
import { getTransactions } from '../services/transactionService';
import { nameFor, useNames, useLocalizedText } from '../utils/naming';

export function TransactionHistoryPage() {
  const names = useNames();
  const t = useLocalizedText();
  const { transactionFilters, setTransactionFilters, resetTransactionFilters } = useUIStore();
  const [page, setPage] = useState(0);
  const pageSize = 50;
  useEffect(() => setPage(0), [transactionFilters]);
  const filters = {
    itemId: transactionFilters.itemId || undefined,
    userId: transactionFilters.userId || undefined,
    transactionType: transactionFilters.transactionType || undefined,
    startDate: transactionFilters.startDate || undefined,
    endDate: transactionFilters.endDate || undefined,
  };
  const { data: transactions, isLoading } = useTransactions({ ...filters, page, size: pageSize });
  const { data: nextPage } = useQuery({
    queryKey: ['transactions', 'page-exists', filters, page],
    queryFn: () => getTransactions({ ...filters, page: (page + 1) * pageSize, size: 1 }),
    enabled: transactions?.length === pageSize,
  });
  const { data: items } = useItems();
  const { data: users } = useUsers();

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

      <TransactionHistoryList transactions={transactions} items={items} users={users} isLoading={isLoading} />
      {(page > 0 || Boolean(nextPage?.length)) && (
        <Stack direction="row" sx={{ mt: 2, justifyContent: 'center' }}>
          <Pagination page={page + 1} count={page + 1 + (nextPage?.length ? 1 : 0)} onChange={(_, value) => setPage(value - 1)} />
        </Stack>
      )}
    </Box>
  );
}
