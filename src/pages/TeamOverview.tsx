import { Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { StockMetrics } from '../components/dashboard/StockMetrics';
import { TransactionHistory } from '../components/lists/TransactionHistory';
import { useTransactions } from '../hooks/useTransactions';
import { getInventorySummary } from '../services/inventoryService';
import { useLocalizedText } from '../utils/naming';

/** Whole-inventory scope of the Overview page for inventory managers: server-computed metrics and the latest movements. */
export function TeamOverview() {
    const t = useLocalizedText();
    const summary = useQuery({ queryKey: ['items', 'summary'], queryFn: getInventorySummary, networkMode: 'offlineFirst' });
    const { data: transactions, isLoading: txLoading } = useTransactions(undefined, 10);
    return (
        <Stack spacing={3}>
            <StockMetrics summary={summary.data} />
            <Paper component="section" aria-labelledby="team-transactions" sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography id="team-transactions" variant="h6" component="h2" sx={{ mb: 1.5 }}>
                    {t('Letzte Buchungen', 'Recent transactions')}
                </Typography>
                <TransactionHistory transactions={transactions?.slice(0, 10)} isLoading={txLoading} />
            </Paper>
        </Stack>
    );
}
