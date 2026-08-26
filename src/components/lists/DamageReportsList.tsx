import {
    Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Skeleton, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
    useMediaQuery, useTheme,
} from '@mui/material';
import { useState } from 'react';
import type { DamageReport, DamageStatus, Item, User } from '../../types';
import { formatStatus } from '../../utils/formatters';
import { useTranslate } from '../../utils/naming';

interface Props {
    reports: DamageReport[] | undefined;
    items: Item[] | undefined;
    users?: User[];
    isLoading: boolean;
    view?: 'open' | 'history';
    isUpdating?: boolean;
    onUpdateStatus?: (id: string, status: DamageStatus, amount?: number) => void;
}

const severityColors: Record<string, 'info' | 'warning' | 'error' | 'default'> = {
    low: 'info', medium: 'warning', high: 'error', critical: 'error',
};

export function DamageReportsList({ reports, items, users, isLoading, view = 'open', isUpdating, onUpdateStatus }: Props) {
    const t = useTranslate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const visibleReports = reports?.filter((report) => view === 'history'
        ? true
        : report.status === 'reported' || report.status === 'in_review');
    const [resolution, setResolution] = useState<{ report: DamageReport; status: 'repaired' | 'written_off' } | null>(null);
    const [resolutionAmount, setResolutionAmount] = useState('1');

    if (isLoading) return <Paper sx={{ p: 2 }}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={48} />)}</Paper>;
    if (!visibleReports?.length) return (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
                {view === 'history' ? t('Noch kein Schadensverlauf vorhanden', 'No damage history yet') : t('Keine offenen Schadensberichte', 'No open damage reports')}
            </Typography>
        </Paper>
    );

    const getItemName = (itemId: string) => items?.find((item) => item.id === itemId)?.name ?? itemId;
    const getUserName = (userId?: string, expanded?: User) => {
        const user = expanded ?? users?.find((candidate) => candidate.id === userId);
        return user?.name?.trim() || user?.username?.trim() || user?.email?.trim() || userId || '—';
    };
    const getActivity = (report: DamageReport) => {
        const entries = report.statusHistory?.length
            ? report.statusHistory
            : [{ status: 'reported' as DamageStatus, userId: report.reportedBy, timestamp: report.timestamp }];
        return entries.map((entry) => `${formatStatus(entry.status)}${entry.amount ? ` (${entry.amount} ×)` : ''} · ${getUserName(entry.userId)} · ${new Date(entry.timestamp).toLocaleString()}`).join('\n');
    };
    const getRepairedAmount = (report: DamageReport) => {
        const repaired = report.repairedAmount ?? 0;
        const writtenOff = report.writtenOffAmount ?? 0;
        return repaired + writtenOff === 0 && report.status === 'repaired' ? report.amount : repaired;
    };
    const getWrittenOffAmount = (report: DamageReport) => {
        const repaired = report.repairedAmount ?? 0;
        const writtenOff = report.writtenOffAmount ?? 0;
        return repaired + writtenOff === 0 && report.status === 'written_off' ? report.amount : writtenOff;
    };
    const getUnresolvedAmount = (report: DamageReport) => Math.max(0, report.amount - getRepairedAmount(report) - getWrittenOffAmount(report));
    const openResolution = (report: DamageReport, status: 'repaired' | 'written_off') => {
        setResolution({ report, status });
        setResolutionAmount('1');
    };
    const statusControl = (report: DamageReport) => onUpdateStatus && view === 'open' ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {report.status === 'reported' && <Button size="small" variant="outlined" disabled={isUpdating} onClick={() => onUpdateStatus(report.id, 'in_review')}>{t('Prüfung starten', 'Start review')}</Button>}
            <Button size="small" variant="contained" color="success" disabled={isUpdating} onClick={() => openResolution(report, 'repaired')}>{t('Teil reparieren', 'Repair units')}</Button>
            <Button size="small" variant="contained" color="error" disabled={isUpdating} onClick={() => openResolution(report, 'written_off')}>{t('Teil abschreiben', 'Write off units')}</Button>
        </Stack>
    ) : <Chip label={formatStatus(report.status)} size="small" />;
    const maxResolutionAmount = resolution ? getUnresolvedAmount(resolution.report) : 0;
    const parsedResolutionAmount = Number(resolutionAmount);
    const resolutionAmountValid = Number.isInteger(parsedResolutionAmount) && parsedResolutionAmount >= 1 && parsedResolutionAmount <= maxResolutionAmount;
    const resolutionDialog = (
        <Dialog open={Boolean(resolution)} onClose={() => setResolution(null)} maxWidth="xs" fullWidth>
            <DialogTitle>{resolution?.status === 'repaired' ? t('Teilmenge reparieren', 'Repair quantity') : t('Teilmenge abschreiben', 'Write off quantity')}</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Typography sx={{ mb: 2 }}>{resolution ? getItemName(resolution.report.itemId) : ''}</Typography>
                <TextField
                    autoFocus
                    fullWidth
                    type="number"
                    label={t('Menge', 'Quantity')}
                    value={resolutionAmount}
                    onChange={(event) => setResolutionAmount(event.target.value)}
                    helperText={t(`Noch ${maxResolutionAmount} beschädigte Einheiten offen`, `${maxResolutionAmount} damaged units remain`)}
                    error={resolutionAmount !== '' && !resolutionAmountValid}
                    slotProps={{ htmlInput: { min: 1, max: maxResolutionAmount, step: 1 } }}
                />
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={() => setResolution(null)}>{t('Abbrechen', 'Cancel')}</Button>
                <Button
                    variant="contained"
                    color={resolution?.status === 'written_off' ? 'error' : 'success'}
                    disabled={!resolution || !resolutionAmountValid || isUpdating}
                    onClick={() => {
                        if (!resolution || !resolutionAmountValid) return;
                        onUpdateStatus?.(resolution.report.id, resolution.status, parsedResolutionAmount);
                        setResolution(null);
                    }}
                >
                    {resolution?.status === 'repaired' ? t('Reparatur buchen', 'Record repair') : t('Abschreibung buchen', 'Record write-off')}
                </Button>
            </DialogActions>
        </Dialog>
    );

    if (isMobile) return (
        <>
        <Stack spacing={1.5}>
            {visibleReports.map((report) => (
                <Paper key={report.id} sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                        <Box><Typography sx={{ fontWeight: 700 }}>{getItemName(report.itemId)}</Typography><Typography variant="caption" color="text.secondary">{new Date(report.timestamp).toLocaleString()}</Typography></Box>
                        <Chip label={formatStatus(report.severity)} color={severityColors[report.severity] ?? 'default'} size="small" />
                    </Box>
                    <Typography variant="body2" sx={{ my: 1.5 }}>{report.description}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('Gemeldet von', 'Reported by')}: {getUserName(report.reportedBy, report.expand?.reportedBy)}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('Bearbeitet von', 'Handled by')}: {getUserName(report.handledBy, report.expand?.handledBy)}</Typography>
                    {view === 'history' && <Typography component="div" variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-line', mt: 1.5 }}>{getActivity(report)}</Typography>}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, my: 2, textAlign: 'center' }}>
                        <Box><Typography variant="caption" color="text.secondary">{t('Offen', 'Remaining')}</Typography><Typography sx={{ fontWeight: 700 }}>{getUnresolvedAmount(report)}</Typography></Box>
                        <Box><Typography variant="caption" color="text.secondary">{t('Repariert', 'Repaired')}</Typography><Typography sx={{ fontWeight: 700, color: 'success.main' }}>{getRepairedAmount(report)}</Typography></Box>
                        <Box><Typography variant="caption" color="text.secondary">{t('Abgeschrieben', 'Written off')}</Typography><Typography sx={{ fontWeight: 700, color: 'error.main' }}>{getWrittenOffAmount(report)}</Typography></Box>
                    </Box>
                    {statusControl(report)}
                </Paper>
            ))}
        </Stack>
        {resolutionDialog}
        </>
    );

    return (
        <>
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
                <TableHead><TableRow>
                    <TableCell>{t('Datum', 'Date')}</TableCell><TableCell>{t('Artikel', 'Item')}</TableCell><TableCell align="right">{t('Menge', 'Quantity')}</TableCell>
                    <TableCell>{t('Schweregrad', 'Severity')}</TableCell><TableCell>{t('Beschreibung', 'Description')}</TableCell>
                    <TableCell>{t('Gemeldet von', 'Reported by')}</TableCell><TableCell>{t('Bearbeitet von', 'Handled by')}</TableCell>
                    {view === 'history' && <TableCell>{t('Verlauf', 'Activity')}</TableCell>}<TableCell>{t('Status', 'Status')}</TableCell>
                </TableRow></TableHead>
                <TableBody>{visibleReports.map((report) => (
                    <TableRow key={report.id} hover>
                        <TableCell>{new Date(report.timestamp).toLocaleString()}</TableCell><TableCell>{getItemName(report.itemId)}</TableCell><TableCell align="right">
                            <Typography>{getUnresolvedAmount(report)} {t('offen', 'remaining')}</Typography>
                            <Typography variant="caption" color="text.secondary">{report.amount} {t('gesamt', 'total')} · {getRepairedAmount(report)} {t('repariert', 'repaired')} · {getWrittenOffAmount(report)} {t('abgeschrieben', 'written off')}</Typography>
                        </TableCell>
                        <TableCell><Chip label={formatStatus(report.severity)} color={severityColors[report.severity] ?? 'default'} size="small" /></TableCell>
                        <TableCell>{report.description}</TableCell><TableCell>{getUserName(report.reportedBy, report.expand?.reportedBy)}</TableCell>
                        <TableCell>{getUserName(report.handledBy, report.expand?.handledBy)}{report.handledAt && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{new Date(report.handledAt).toLocaleString()}</Typography>}</TableCell>
                        {view === 'history' && <TableCell><Typography variant="caption" sx={{ whiteSpace: 'pre-line' }}>{getActivity(report)}</Typography></TableCell>}
                        <TableCell>{statusControl(report)}</TableCell>
                    </TableRow>
                ))}</TableBody>
            </Table>
        </TableContainer>
        {resolutionDialog}
        </>
    );
}
