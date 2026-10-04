import { Paper, Stack, Typography } from '@mui/material';
import { StockMetrics } from '../components/dashboard/StockMetrics';
import { TransactionHistory } from '../components/lists/TransactionHistory';
import { useItems } from '../hooks/useItems';
import { useTransactions } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';
import { useUsers } from '../hooks/useUsers';
import { useLocalizedText } from '../utils/naming';

/** Whole-inventory scope of the Overview page for inventory managers. */
export function TeamOverview() {
    const t = useLocalizedText();
    const { data: items, isLoading: itemsLoading } = useItems();
    const { data: transactions, isLoading: txLoading } = useTransactions();
    const { data: damageReports } = useDamageReports();
    const { data: users } = useUsers();
    return (
        <Stack spacing={3}>
            <StockMetrics items={items} transactions={transactions} damageReports={damageReports} />
            <Paper component="section" aria-labelledby="team-transactions" sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography id="team-transactions" variant="h6" component="h2" sx={{ mb: 1.5 }}>
                    {t('Letzte Buchungen', 'Recent transactions')}
                </Typography>
                <TransactionHistory
                    transactions={transactions?.slice(0, 10)}
                    items={items}
                    users={users}
                    isLoading={txLoading || itemsLoading}
                />
            </Paper>
        </Stack>
    );
}
