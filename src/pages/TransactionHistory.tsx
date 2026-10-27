import { Button } from '../components/shared/ActionButtons';
import { Alert, Autocomplete, Box, MenuItem, Stack, Typography } from '@mui/material';
import { DateRangeField, TextField } from '../components/shared/DateTextField';
import { useState } from 'react';
import { TransactionHistory as TransactionHistoryList } from '../components/lists/TransactionHistory';
import { useTransactions } from '../hooks/useTransactions';
import { useAllUsers } from '../hooks/useUsers';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useUIStore } from '../store/uiStore';
import { nameFor, useNames, useT } from '../utils/naming';
import { ItemAutocomplete } from '../components/shared/ItemAutocomplete';
import { LoadMore } from '../components/shared/LoadMore';
import { useEventReports } from '../hooks/useEvents';
import { formatDate } from '../utils/dateFormat';
import { TRANSACTION_TYPES } from '../types/transaction';

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
    eventOccurrenceId: transactionFilters.eventOccurrenceId || undefined,
    transactionType: transactionFilters.transactionType || undefined,
    startDate: transactionFilters.startDate || undefined,
    endDate: transactionFilters.endDate || undefined,
    search: term || undefined,
  };
  const transactions = useTransactions(filters);
  const { data: users } = useAllUsers();
  const events = useEventReports();

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>{t('nav.transactions')}</Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', alignItems: 'flex-start' }} useFlexGap>
        <TextField label={t('pages.transactionHistory.searchTransactions')} value={search} onChange={(event) => setSearch(event.target.value)} size="small" sx={{ minWidth: 200 }} />
        <Box sx={{ minWidth: 220 }}>
          <ItemAutocomplete size="small" showMoreHint={false} label={t('common.item')} value={transactionFilters.itemId || null}
            onChange={(item) => setTransactionFilters({ itemId: item?.id ?? '' })} />
        </Box>
        <TextField select label={t('common.user')} value={transactionFilters.userId} onChange={(event) => setTransactionFilters({ userId: event.target.value })} size="small" sx={{ minWidth: 150 }}>
          <MenuItem value="">{t('pages.transactionHistory.allUsers')}</MenuItem>
          {users?.map((user) => <MenuItem key={user.id} value={user.id}>{user.name?.trim() || user.email || user.id}</MenuItem>)}
        </TextField>
        <Autocomplete size="small" sx={{ minWidth: 240, flex: '1 1 240px' }} options={events.data ?? []}
          value={events.data?.find((event) => event.id === transactionFilters.eventOccurrenceId) ?? null}
          loading={events.isFetching} isOptionEqualToValue={(option, value) => option.id === value.id}
          getOptionLabel={(event) => `${event.name} · ${event.eventType} · ${formatDate(event.startDate)}`}
          onChange={(_, event) => setTransactionFilters({ eventOccurrenceId: event?.id ?? '' })}
          renderInput={(params) => <TextField {...params} label={t('nav.event')} error={events.isError}
            helperText={events.isError ? t('pages.transactionHistory.eventsCouldNotBeLoaded') : undefined} />} />
        <TextField select label={t('common.type')} value={transactionFilters.transactionType} onChange={(event) => setTransactionFilters({ transactionType: event.target.value })} size="small" sx={{ minWidth: 120 }}>
          <MenuItem value="">{t('common.all')}</MenuItem>
          {TRANSACTION_TYPES.map((type) => <MenuItem key={type} value={type}>{nameFor('transactionType', type)}</MenuItem>)}
        </TextField>
        <Box sx={{ minWidth: { sm: 340 } }}>
          <DateRangeField size="small" startLabel={t('common.startDate')} endLabel={t('common.endDate')} start={transactionFilters.startDate} end={transactionFilters.endDate}
            onChange={(range) => setTransactionFilters({ startDate: range.start, endDate: range.end })} />
        </Box>

        <Button sx={{ height: 40, flexShrink: 0 }} title={t('pages.transactionHistory.resetAllFilters')} variant="outlined" onClick={() => { resetTransactionFilters(); setSearch(''); }} size="small">{names.action.reset}</Button>
      </Stack>

      {transactions.isError && <Alert severity="error" sx={{ mb: 2 }} action={<Button title={t('pages.transactionHistory.loadAgain')} onClick={() => { void transactions.refetch(); }}>{t('common.tryAgain')}</Button>}>
        {t('pages.transactionHistory.transactionsCouldNotBeLoaded')}</Alert>}
      <TransactionHistoryList transactions={transactions.data} users={users} isLoading={transactions.isLoading} />
      <LoadMore list={transactions} />
    </Box>
  );
}
