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
    const totalStock =
        items?.reduce((sum, item) => {
            const checkedOut = (transactions ?? [])
                .filter((tx) => tx.itemId === item.id)
                .reduce((count, tx) => {
                    if (tx.transactionType === 'checkout') return count + tx.quantityChanged;
                    if (tx.transactionType === 'checkin') return count - tx.quantityChanged;
                    return count;
                }, 0);

            const damaged = (damageReports ?? [])
                .filter(
                    (report) =>
                        report.itemId === item.id &&
                        (report.status === 'reported' || report.status === 'in_review'),
                )
                .reduce((count, report) => count + (report.amount ?? 0), 0);

            return sum + Math.max(0, item.amount - checkedOut - damaged);
        }, 0) ?? 0;
    const lowStockItems =
        items?.filter((item) => {
            const checkedOut = (transactions ?? [])
                .filter((tx) => tx.itemId === item.id)
                .reduce((count, tx) => {
                    if (tx.transactionType === 'checkout') return count + tx.quantityChanged;
                    if (tx.transactionType === 'checkin') return count - tx.quantityChanged;
                    return count;
                }, 0);

            const damaged = (damageReports ?? [])
                .filter(
                    (report) =>
                        report.itemId === item.id &&
                        (report.status === 'reported' || report.status === 'in_review'),
                )
                .reduce((count, report) => count + (report.amount ?? 0), 0);

            const available = Math.max(0, item.amount - checkedOut - damaged);
            return available <= (item.minStock ?? 5);
        }).length ?? 0;
    const recentTransactions = transactions?.slice(0, 10).length ?? 0;
    const openDamageReports =
        damageReports?.filter((r) => r.status === 'reported' || r.status === 'in_review').length ?? 0;

    const metrics = [
        { label: 'Total Items', value: totalItems, icon: <InventoryIcon />, color: '#7c4dff' },
        { label: 'Total Stock', value: totalStock, icon: <InventoryIcon />, color: '#00e676' },
        { label: 'Low Stock', value: lowStockItems, icon: <WarningIcon />, color: '#ffab00' },
        { label: 'Recent Transactions', value: recentTransactions, icon: <SwapHorizIcon />, color: '#448aff' },
        { label: 'Open Damage Reports', value: openDamageReports, icon: <ReportProblemIcon />, color: '#ff5252' },
    ];

    return (
        <Grid container spacing={2}>
            {metrics.map((metric) => (
                <Grid size={{ xs: 6, sm: 4, md: 2.4 }} key={metric.label}>
                    <Paper sx={{ p: 2.5, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                        <Box sx={{
                            position: 'absolute',
                            top: -8,
                            right: -8,
                            opacity: 0.08,
                            fontSize: 80,
                            color: metric.color,
                        }}>
                            {metric.icon}
                        </Box>
                        <Box sx={{ color: metric.color, mb: 1, '& .MuiSvgIcon-root': { fontSize: 28 } }}>{metric.icon}</Box>
                        <Typography variant="h4" sx={{ fontWeight: 700 }}>{metric.value}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {metric.label}
                        </Typography>
                    </Paper>
                </Grid>
            ))}
        </Grid>
    );
}
