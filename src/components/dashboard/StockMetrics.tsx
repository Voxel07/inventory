import { Paper, Typography, Box, Grid } from '@mui/material';
import InventoryIcon from '@mui/icons-material/Inventory';
import WarningIcon from '@mui/icons-material/Warning';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import type { Item, StockTransaction, DamageReport } from '../../types';

interface Props {
    items: Item[] | undefined;
    transactions: StockTransaction[] | undefined;
    damageReports: DamageReport[] | undefined;
}

export function StockMetrics({ items, transactions, damageReports }: Props) {
    const totalItems = items?.length ?? 0;
    const totalStock = items?.reduce((sum, item) => sum + item.amount, 0) ?? 0;
    const lowStockItems = items?.filter((item) => item.amount <= 5).length ?? 0;
    const recentTransactions = transactions?.slice(0, 10).length ?? 0;
    const openDamageReports =
        damageReports?.filter((r) => r.status === 'reported' || r.status === 'in_review').length ?? 0;

    const metrics = [
        { label: 'Total Items', value: totalItems, icon: <InventoryIcon />, color: '#1976d2' },
        { label: 'Total Stock', value: totalStock, icon: <InventoryIcon />, color: '#2e7d32' },
        { label: 'Low Stock', value: lowStockItems, icon: <WarningIcon />, color: '#ed6c02' },
        { label: 'Recent Transactions', value: recentTransactions, icon: <SwapHorizIcon />, color: '#9c27b0' },
        { label: 'Open Damage Reports', value: openDamageReports, icon: <ReportProblemIcon />, color: '#d32f2f' },
    ];

    return (
        <Grid container spacing={2}>
            {metrics.map((metric) => (
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }} key={metric.label}>
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Box sx={{ color: metric.color, mb: 1 }}>{metric.icon}</Box>
                        <Typography variant="h4">{metric.value}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {metric.label}
                        </Typography>
                    </Paper>
                </Grid>
            ))}
        </Grid>
    );
}
