import { Box, Typography } from '@mui/material';
import { StockMetrics } from '../components/dashboard/StockMetrics';
import { TransactionHistory } from '../components/lists/TransactionHistory';
import { useItems } from '../hooks/useItems';
import { useTransactions } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';
import { useUsers } from '../hooks/useUsers';
import { useTranslate } from '../utils/naming';

export function Dashboard() {
    const t = useTranslate();
    const { data: items, isLoading: itemsLoading } = useItems();
    const { data: transactions, isLoading: txLoading } = useTransactions();
    const { data: damageReports } = useDamageReports();
    const { data: users } = useUsers();
    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                {t('Dashboard', 'Dashboard')}
            </Typography>
            <StockMetrics items={items} transactions={transactions} damageReports={damageReports} />
            <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
                {t('Kürzliche Transaktionen', 'Recent transactions')}
            </Typography>
            <TransactionHistory
                transactions={transactions?.slice(0, 10)}
                items={items}
                users={users}
                isLoading={txLoading || itemsLoading}
            />
        </Box>
    );
}
