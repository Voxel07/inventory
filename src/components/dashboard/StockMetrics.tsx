import InventoryIcon from '@mui/icons-material/Inventory';
import WarningIcon from '@mui/icons-material/Warning';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import type { InventorySummary } from '../../services/inventoryService';
import { StatStrip } from '../shared/StatStrip';
import { useT } from '../../utils/naming';

interface Props {
    summary: InventorySummary | undefined;
}

export function StockMetrics({ summary }: Props) {
    const t = useT();
    const lowStockItems = summary?.lowStockItems ?? 0;
    const openDamageReports = summary?.openDamageReports ?? 0;

    return <StatStrip minTileWidth={160} stats={[
        { label: t('nav.items'), value: summary?.items ?? 0, icon: <InventoryIcon /> },
        { label: t('dashboard.stockMetrics.totalUnits'), value: summary?.totalUnits ?? 0, icon: <InventoryIcon /> },
        { label: t('dashboard.stockMetrics.lowStock'), value: lowStockItems, icon: <WarningIcon />, color: lowStockItems ? 'warning.main' : undefined },
        { label: t('dashboard.stockMetrics.transactions7Days'), value: summary?.transactionsLast7Days ?? 0, icon: <SwapHorizIcon /> },
        { label: t('dashboard.stockMetrics.openDamageReports'), value: openDamageReports, icon: <ReportProblemIcon />, color: openDamageReports ? 'error.main' : undefined },
    ]} />;
}
