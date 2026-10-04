import { Paper, Typography, Box, Grid } from '@mui/material';
import InventoryIcon from '@mui/icons-material/Inventory';
import WarningIcon from '@mui/icons-material/Warning';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { useEffect, useState } from 'react';
import type { Item, StockTransaction, DamageReport } from '../../types';
import { getItemStock } from '../../utils/stock';
import { useLocalizedText } from '../../utils/naming';

interface Props {
    items: Item[] | undefined;
    transactions: StockTransaction[] | undefined;
    damageReports: DamageReport[] | undefined;
}

export function StockMetrics({ items, transactions, damageReports }: Props) {
    const t = useLocalizedText();
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, []);
    const totalItems = items?.length ?? 0;
    const totalStock =
        items?.reduce((sum, item) => {
            const stock = getItemStock(item);
            return sum + stock.totalStock;
        }, 0) ?? 0;
    const lowStockItems =
        items?.filter((item) => {
            const { remaining } = getItemStock(item);
            return remaining <= (item.minStock ?? 5);
        }).length ?? 0;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentTransactions =
        transactions?.filter((tx) => {
            const timestamp = tx.timestamp ? new Date(tx.timestamp).getTime() : 0;
            return timestamp >= sevenDaysAgo;
        }).length ?? 0;
    const openDamageReports =
        damageReports?.filter((r) => r.status === 'reported' || r.status === 'in_review').length ?? 0;

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
