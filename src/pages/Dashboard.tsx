import { Box, Typography } from '@mui/material';
import { StockMetrics } from '../components/dashboard/StockMetrics';
import { TransactionHistory } from '../components/lists/TransactionHistory';
import { useItems } from '../hooks/useItems';
import { useTransactions } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';

export function Dashboard() {
    const { data: items, isLoading: itemsLoading } = useItems();
    const { data: transactions, isLoading: txLoading } = useTransactions();
    const { data: damageReports } = useDamageReports();
    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                Dashboard
            </Typography>
            <StockMetrics items={items} transactions={transactions} damageReports={damageReports} />
            <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
                Kürzliche Transaktionen
            </Typography>
            <TransactionHistory
                transactions={transactions?.slice(0, 10)}
                items={items}
                isLoading={txLoading || itemsLoading}
            />
        </Box>
    );
}
