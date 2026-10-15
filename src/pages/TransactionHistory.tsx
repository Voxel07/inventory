import { Button } from '../components/shared/ActionButtons';
import { Alert, Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { TransactionHistory as TransactionHistoryList } from '../components/lists/TransactionHistory';
import { useTransactions } from '../hooks/useTransactions';
import { useAllUsers } from '../hooks/useUsers';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useUIStore } from '../store/uiStore';
import { nameFor, useNames, useT } from '../utils/naming';
import { ItemAutocomplete } from '../components/shared/ItemAutocomplete';
import { LoadMore } from '../components/shared/LoadMore';

/** Every filter, including the free-text search, runs on the server; pages load on demand. */
export function TransactionHistoryPage() {
  const names = useNames();
  const t = useT();
  const { transactionFilters, setTransactionFilters, resetTransactionFilters } = useUIStore();
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const filters = {
    itemId: transactionFilters.itemId || undefined,
    userId: transactionFilters.userId || undefined,
    transactionType: transactionFilters.transactionType || undefined,
    startDate: transactionFilters.startDate || undefined,
    endDate: transactionFilters.endDate || undefined,
    search: term || undefined,
  };
  const transactions = useTransactions(filters);
  const { data: users } = useAllUsers();

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>{t('nav.transactions')}</Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }} useFlexGap>
        <TextField label={t('pages.transactionHistory.searchTransactions')} value={search} onChange={(event) => setSearch(event.target.value)} size="small" sx={{ minWidth: 200 }} />
        <Box sx={{ minWidth: 220 }}>
          <ItemAutocomplete size="small" label={t('common.item')} value={transactionFilters.itemId || null}
            onChange={(item) => setTransactionFilters({ itemId: item?.id ?? '' })} />
        </Box>
        <TextField select label={t('common.user')} value={transactionFilters.userId} onChange={(event) => setTransactionFilters({ userId: event.target.value })} size="small" sx={{ minWidth: 150 }}>
          <MenuItem value="">{t('pages.transactionHistory.allUsers')}</MenuItem>
          {users?.map((user) => <MenuItem key={user.id} value={user.id}>{user.name?.trim() || user.username || user.email || user.id}</MenuItem>)}
        </TextField>
        <TextField select label={t('common.type')} value={transactionFilters.transactionType} onChange={(event) => setTransactionFilters({ transactionType: event.target.value })} size="small" sx={{ minWidth: 120 }}>
          <MenuItem value="">{t('common.all')}</MenuItem>
          {(['checkout', 'checkin', 'added', 'repaired', 'written_off'] as const).map((type) => <MenuItem key={type} value={type}>{nameFor('transactionType', type)}</MenuItem>)}
        </TextField>
        <TextField label={t('common.startDate')} type="date" value={transactionFilters.startDate} onChange={(event) => setTransactionFilters({ startDate: event.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label={t('common.endDate')} type="date" value={transactionFilters.endDate} onChange={(event) => setTransactionFilters({ endDate: event.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} />

        <Button title={t('pages.transactionHistory.resetAllFilters')} variant="outlined" onClick={() => { resetTransactionFilters(); setSearch(''); }} size="small">{names.action.reset}</Button>
      </Stack>

      {transactions.isError && <Alert severity="error" sx={{ mb: 2 }} action={<Button title={t('pages.transactionHistory.loadAgain')} onClick={() => { void transactions.refetch(); }}>{t('common.tryAgain')}</Button>}>
        {t('pages.transactionHistory.transactionsCouldNotBeLoaded')}</Alert>}
      <TransactionHistoryList transactions={transactions.data} users={users} isLoading={transactions.isLoading} />
      <LoadMore list={transactions} />
    </Box>
  );
}
