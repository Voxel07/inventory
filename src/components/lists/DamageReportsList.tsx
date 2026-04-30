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

const statuses: DamageStatus[] = ['reported', 'in_review', 'resolved', 'written_off'];

export function DamageReportsList({ reports, items, isLoading, onUpdateStatus }: Props) {
    if (isLoading) {
        return (
            <Paper sx={{ p: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} height={48} />
                ))}
            </Paper>
        );
    }

    if (!reports?.length) {
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
        <TableContainer component={Paper}>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Item</TableCell>
                        <TableCell>Severity</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>Status</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {reports.map((report) => (
                        <TableRow key={report.id} hover>
                            <TableCell>{new Date(report.timestamp).toLocaleString()}</TableCell>
                            <TableCell>{getItemName(report.itemId)}</TableCell>
                            <TableCell>
                                <Chip
                                    label={report.severity}
                                    color={severityColors[report.severity] ?? 'default'}
                                    size="small"
                                />
                            </TableCell>
                            <TableCell>{report.description}</TableCell>
                            <TableCell>
                                {onUpdateStatus ? (
                                    <Select
                                        value={report.status}
                                        size="small"
                                        onChange={(e) => onUpdateStatus(report.id, e.target.value as DamageStatus)}
                                    >
                                        {statuses.map((s) => (
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
