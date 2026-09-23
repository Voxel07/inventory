import { Box, Button, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { TransactionHistory as TransactionHistoryList } from '../components/lists/TransactionHistory';
import { useTransactions } from '../hooks/useTransactions';
import { useItems } from '../hooks/useItems';
import { useUsers } from '../hooks/useUsers';
import { useUIStore } from '../store/uiStore';
import { nameFor, useNames, useLocalizedText } from '../utils/naming';
import { ListPagination } from '../components/shared/ListPagination';

export function TransactionHistoryPage() {
  const names = useNames();
  const t = useLocalizedText();
  const { transactionFilters, setTransactionFilters, resetTransactionFilters } = useUIStore();
  const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const effectivePageSize = pageSize === -1 ? Number.MAX_SAFE_INTEGER : pageSize;
  const [search, setSearch] = useState('');
  useEffect(() => setPage(1), [transactionFilters]);
  const filters = {
    itemId: transactionFilters.itemId || undefined,
    userId: transactionFilters.userId || undefined,
    transactionType: transactionFilters.transactionType || undefined,
    startDate: transactionFilters.startDate || undefined,
    endDate: transactionFilters.endDate || undefined,
  };
  const { data: transactions, isLoading, isFetchingNextPage, hasNextPage, isError, refetch } = useTransactions(filters);
  const { data: items } = useItems();
  const { data: users } = useUsers();
  const filteredTransactions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return transactions ?? [];
    const itemNames = new Map(items?.map((item) => [item.id, item.name]));
    const userNames = new Map(users?.map((user) => [user.id, user.name || user.username || user.email]));
    return (transactions ?? []).filter((tx) => [
      itemNames.get(tx.itemId), tx.expand?.userId?.name, userNames.get(tx.userId),
      tx.reason, tx.notes, tx.eventType, tx.faction,
    ].some((value) => value?.toLocaleLowerCase().includes(term)));
  }, [transactions, items, users, search]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredTransactions.length / effectivePageSize)));
  const pageTransactions = filteredTransactions.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>{t('Transaktionsverlauf', 'Transaction history')}</Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }} useFlexGap>
        <TextField label={t('Transaktionen suchen', 'Search transactions')} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} size="small" sx={{ minWidth: 200 }} />
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

      <TransactionHistoryList transactions={pageTransactions} items={items} users={users} isLoading={isLoading} />
      <ListPagination pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} count={filteredTransactions.length} page={currentPage} onChange={setPage} loadingMore={!isError && (hasNextPage || isFetchingNextPage)} loadError={isError} onRetry={() => { void refetch(); }} />
    </Box>
  );
}
