import { Paper, Typography, Box, Grid } from '@mui/material';
import InventoryIcon from '@mui/icons-material/Inventory';
import WarningIcon from '@mui/icons-material/Warning';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import type { InventorySummary } from '../../services/inventoryService';
import { useT } from '../../utils/naming';

interface Props {
    summary: InventorySummary | undefined;
}

export function StockMetrics({ summary }: Props) {
    const t = useT();
    const totalItems = summary?.items ?? 0;
    const totalStock = summary?.totalUnits ?? 0;
    const lowStockItems = summary?.lowStockItems ?? 0;
    const recentTransactions = summary?.transactionsLast7Days ?? 0;
    const openDamageReports = summary?.openDamageReports ?? 0;

    const metrics = [
        { label: t('nav.items'), value: totalItems, icon: <InventoryIcon />, color: 'text.secondary' },
        { label: t('dashboard.stockMetrics.totalUnits'), value: totalStock, icon: <InventoryIcon />, color: 'text.secondary' },
        { label: t('dashboard.stockMetrics.lowStock'), value: lowStockItems, icon: <WarningIcon />, color: lowStockItems ? 'warning.main' : 'text.secondary' },
        { label: t('dashboard.stockMetrics.transactions7Days'), value: recentTransactions, icon: <SwapHorizIcon />, color: 'text.secondary' },
        { label: t('dashboard.stockMetrics.openDamageReports'), value: openDamageReports, icon: <ReportProblemIcon />, color: openDamageReports ? 'error.main' : 'text.secondary' },
    ];

    return (
        <Grid container spacing={2}>
            {metrics.map((metric) => (
                <Grid size={{ xs: 6, sm: 4, md: 2.4 }} key={metric.label}>
                    <Paper sx={{ p: 2, height: '100%' }}>
                        <Box aria-hidden sx={{ color: metric.color, mb: 0.5, display: 'flex', '& .MuiSvgIcon-root': { fontSize: 22 } }}>{metric.icon}</Box>
                        <Typography component="p" className="tabular" sx={{ fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.2 }}>{metric.value}</Typography>
                        <Typography variant="body2" color="text.secondary">{metric.label}</Typography>
                    </Paper>
                </Grid>
            ))}
        </Grid>
    );
}
