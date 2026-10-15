import { Paper, Typography, Box, Grid } from '@mui/material';
import InventoryIcon from '@mui/icons-material/Inventory';
import WarningIcon from '@mui/icons-material/Warning';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import type { InventorySummary } from '../../services/inventoryService';
import { useLocalizedText } from '../../utils/naming';

interface Props {
    summary: InventorySummary | undefined;
}

export function StockMetrics({ summary }: Props) {
    const t = useLocalizedText();
    const totalItems = summary?.items ?? 0;
    const totalStock = summary?.totalUnits ?? 0;
    const lowStockItems = summary?.lowStockItems ?? 0;
    const recentTransactions = summary?.transactionsLast7Days ?? 0;
    const openDamageReports = summary?.openDamageReports ?? 0;

    const metrics = [
        { label: t('Artikel', 'Items'), value: totalItems, icon: <InventoryIcon />, color: 'text.secondary' },
        { label: t('Einheiten gesamt', 'Total units'), value: totalStock, icon: <InventoryIcon />, color: 'text.secondary' },
        { label: t('Geringer Bestand', 'Low stock'), value: lowStockItems, icon: <WarningIcon />, color: lowStockItems ? 'warning.main' : 'text.secondary' },
        { label: t('Buchungen (7 Tage)', 'Transactions (7 days)'), value: recentTransactions, icon: <SwapHorizIcon />, color: 'text.secondary' },
        { label: t('Offene Schadensberichte', 'Open damage reports'), value: openDamageReports, icon: <ReportProblemIcon />, color: openDamageReports ? 'error.main' : 'text.secondary' },
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
