import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Skeleton,
    Typography,
    MenuItem,
    Select,
} from '@mui/material';
import type { DamageReport, DamageStatus, Item } from '../../types';

interface Props {
    reports: DamageReport[] | undefined;
    items: Item[] | undefined;
    isLoading: boolean;
    onUpdateStatus?: (id: string, status: DamageStatus) => void;
}

const severityColors: Record<string, 'info' | 'warning' | 'error' | 'default'> = {
    low: 'info',
    medium: 'warning',
    high: 'error',
    critical: 'error',
};

const statusTransitions: Record<DamageStatus, DamageStatus[]> = {
    reported: ['in_review', 'repaired', 'written_off'],
    in_review: ['repaired', 'written_off'],
    repaired: [],
    written_off: [],
};

export function DamageReportsList({ reports, items, isLoading, onUpdateStatus }: Props) {
    const visibleReports = reports?.filter(
        (r) => r.status === 'reported' || r.status === 'in_review',
    );
    if (isLoading) {
        return (
            <Paper sx={{ p: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} height={48} />
                ))}
            </Paper>
        );
    }

    if (!visibleReports?.length) {
        return (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">No damage reports found</Typography>
            </Paper>
        );
    }

    function getItemName(itemId: string) {
        return items?.find((i) => i.id === itemId)?.name ?? itemId;
    }

    return (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Item</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Severity</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>Status</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {visibleReports.map((report) => (
                        <TableRow key={report.id} hover>
                            <TableCell>{new Date(report.timestamp).toLocaleString()}</TableCell>
                            <TableCell>{getItemName(report.itemId)}</TableCell>
                            <TableCell align="right">{report.amount}</TableCell>
                            <TableCell>
                                <Chip
                                    label={report.severity}
                                    color={severityColors[report.severity] ?? 'default'}
                                    size="small"
                                />
                            </TableCell>
                            <TableCell>{report.description}</TableCell>
                            <TableCell>
                                {onUpdateStatus && statusTransitions[report.status].length > 0 ? (
                                    <Select
                                        value={report.status}
                                        size="small"
                                        onChange={(e) => onUpdateStatus(report.id, e.target.value as DamageStatus)}
                                    >
                                        <MenuItem value={report.status}>
                                            {report.status.replace('_', ' ')}
                                        </MenuItem>
                                        {statusTransitions[report.status].map((s) => (
                                            <MenuItem key={s} value={s}>
                                                {s.replace('_', ' ')}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                ) : (
                                    <Chip label={report.status.replace('_', ' ')} size="small" />
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
