import { Paper, Typography, Box, Grid } from '@mui/material';
import InventoryIcon from '@mui/icons-material/Inventory';
import WarningIcon from '@mui/icons-material/Warning';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import type { Item, StockTransaction, DamageReport } from '../../types';
import { calculateItemStock } from '../../utils/stock';

interface Props {
    items: Item[] | undefined;
    transactions: StockTransaction[] | undefined;
    damageReports: DamageReport[] | undefined;
}

export function StockMetrics({ items, transactions, damageReports }: Props) {
    const totalItems = items?.length ?? 0;
    const totalStock =
        items?.reduce((sum, item) => {
            const { remaining } = calculateItemStock(item.id, transactions, damageReports);
            return sum + remaining;
        }, 0) ?? 0;
    const lowStockItems =
        items?.filter((item) => {
            const { remaining } = calculateItemStock(item.id, transactions, damageReports);
            return remaining <= (item.minStock ?? 5);
        }).length ?? 0;
    const recentTransactions = transactions?.slice(0, 10).length ?? 0;
    const openDamageReports =
        damageReports?.filter((r) => r.status === 'reported' || r.status === 'in_review').length ?? 0;

    const metrics = [
        { label: 'Artikel insgesamt', value: totalItems, icon: <InventoryIcon />, color: '#7c4dff' },
        { label: 'Gesamtbestand', value: totalStock, icon: <InventoryIcon />, color: '#00e676' },
        { label: 'Geringer Bestand', value: lowStockItems, icon: <WarningIcon />, color: '#ffab00' },
        { label: 'Kürzliche Transaktionen', value: recentTransactions, icon: <SwapHorizIcon />, color: '#448aff' },
        { label: 'Offene Schadensberichte', value: openDamageReports, icon: <ReportProblemIcon />, color: '#ff5252' },
    ];

    return (
        <Grid container spacing={2}>
            {metrics.map((metric) => (
                <Grid size={{ xs: 6, sm: 4, md: 2.4 }} key={metric.label}>
                    <Paper sx={{ p: 2.5, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
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
