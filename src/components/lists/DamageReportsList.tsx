import { useState } from 'react';
import {
    Alert, Box, Chip, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Skeleton,
    Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
    Typography, useMediaQuery, useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import BuildIcon from '@mui/icons-material/Build';
import { Button, IconButton } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import { DamageResolutionDialog } from '../forms/DamageResolutionDialog';
import { DamageReportInfoDialog } from '../dialogs/DamageReportInfoDialog';
import { useAuth } from '../../hooks/useAuth';
import { canPerformMaintenance, canWriteOff } from '../../utils/access';
import type { DamageReport, DamageReportUpdateData, DamageSeverity } from '../../types';
import { formatStatus } from '../../utils/formatters';
import { formatDateTime } from '../../utils/dateFormat';
import { nameFor, useT } from '../../utils/naming';
import { SEVERITY_LEVELS } from '../../utils/constants';

interface Props {
    reports: DamageReport[] | undefined;
    isLoading: boolean;
    loadError?: boolean;
    onRetry?: () => void;
    searching: boolean;
    view: 'open' | 'history';
    isUpdating: boolean;
    onUpdateStatus: (id: string, status: 'repaired' | 'written_off', amount: number, notes: string) => Promise<void>;
    onEdit: (id: string, data: DamageReportUpdateData) => Promise<void>;
}

const severityColors: Record<DamageSeverity, 'info' | 'warning' | 'error'> = {
    low: 'info', medium: 'warning', high: 'error', critical: 'error', total_loss: 'error',
};

export function DamageReportsList({ reports, isLoading, loadError, onRetry, searching, view, isUpdating, onUpdateStatus, onEdit }: Props) {
    const t = useT();
    const { user } = useAuth();
    const canMaintain = canPerformMaintenance(user);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [resolution, setResolution] = useState<DamageReport | null>(null);
    const [info, setInfo] = useState<DamageReport | null>(null);
    const [editing, setEditing] = useState<DamageReport | null>(null);
    const [editDescription, setEditDescription] = useState('');
    const [editSeverity, setEditSeverity] = useState<DamageSeverity>('medium');

    const getTargetName = (report: DamageReport) => {
        if (report.assemblyId) return report.assemblyName ?? report.assemblyId;
        const itemName = report.itemName ?? report.itemId ?? t('lists.damageReportsList.unknownTarget');
        return report.assetCode ? `${itemName} · ${report.assetCode}` : itemName;
    };
    const getUserName = (report: DamageReport, field: 'reportedBy' | 'handledBy') => {
        const actor = report.expand?.[field];
        return actor?.name?.trim() || report[field] || '—';
    };
    const getUnresolvedAmount = (report: DamageReport) => Math.max(0, report.amount - (report.repairedAmount ?? 0) - (report.writtenOffAmount ?? 0));
    const openEdit = (report: DamageReport) => {
        setEditing(report);
        setEditDescription(report.description);
        setEditSeverity(report.severity);
    };
    async function saveEdit() {
        if (!editing || !editDescription.trim() || isUpdating) return;
        try {
            await onEdit(editing.id, { description: editDescription.trim(), severity: editSeverity });
            setEditing(null);
        } catch {
            // The page displays the error; keep the edited description for retry.
        }
    }
    const actions = (report: DamageReport) => <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
        {view === 'open' && canMaintain && getUnresolvedAmount(report) > 0 && <Button
            size="small" variant="contained" startIcon={<BuildIcon />} disabled={isUpdating}
            onClick={() => setResolution(report)}>{t('lists.damageReportsList.startRepair')}</Button>}
        <IconButton title={t('lists.damageReportsList.damageReportDetails')} size="small" onClick={() => setInfo(report)}>
            <InfoOutlinedIcon fontSize="small" />
        </IconButton>
        {view === 'open' && canMaintain && <IconButton title={t('lists.damageReportsList.editDamageReport')} size="small"
            disabled={isUpdating} onClick={() => openEdit(report)}><EditIcon fontSize="small" /></IconButton>}
    </Stack>;
    const quantity = (report: DamageReport) => <>
        {view === 'open' && <Typography variant="body2">{getUnresolvedAmount(report)} {t('lists.damageReportsList.remaining')}</Typography>}
        <Typography variant="caption" color="text.secondary">
            {report.amount} {t('lists.damageReportsList.total')} · {report.repairedAmount ?? 0} {t('lists.damageReportsList.repaired')} · {report.writtenOffAmount ?? 0} {t('lists.damageReportsList.writtenOff')}
        </Typography>
    </>;
    const content = (() => {
        if (isLoading) return <Paper sx={{ p: 2 }}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={48} />)}</Paper>;
        if (!reports?.length) return <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
                {loadError ? t('lists.damageReportsList.couldNotLoadDamageReports')
                    : searching ? t('lists.damageReportsList.noMatchingDamageReports')
                        : view === 'history' ? t('lists.damageReportsList.noDamageHistoryYet') : t('lists.damageReportsList.noOpenDamageReports')}
            </Typography>
            {loadError && <Button onClick={onRetry}>{t('common.retry')}</Button>}
        </Paper>;
        if (isMobile) return <Stack spacing={1.5}>
            {reports.map((report) => <Paper key={report.id} variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{getTargetName(report)}</Typography>
                        <Typography variant="caption" color="text.secondary">{formatDateTime(report.timestamp)}</Typography>
                    </Box>
                    {view === 'open' && <Chip label={formatStatus(report.severity)} color={severityColors[report.severity]} size="small" />}
                </Stack>
                <Chip label={formatStatus(report.status)} size="small" sx={{ mb: 1 }} />
                <Typography variant="body2" color="text.secondary">{t('lists.damageReportsList.reportedBy')}: {getUserName(report, 'reportedBy')}</Typography>
                <Typography variant="body2" color="text.secondary">{t('lists.damageReportsList.handledBy')}: {getUserName(report, 'handledBy')}</Typography>
                <Box sx={{ my: 1.5 }}>{quantity(report)}</Box>
                {actions(report)}
            </Paper>)}
        </Stack>;
        return <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small">
                <TableHead><TableRow>
                    <TableCell>{t('common.date')}</TableCell>
                    <TableCell>{t('lists.damageReportsList.target')}</TableCell>
                    <TableCell align="right">{t('common.quantity')}</TableCell>
                    {view === 'open' && <TableCell>{t('common.severity')}</TableCell>}
                    <TableCell>{t('lists.damageReportsList.reportedBy')}</TableCell>
                    <TableCell>{t('lists.damageReportsList.handledBy')}</TableCell>
                    <TableCell>{t('common.status')}</TableCell>
                    <TableCell>{t('common.actions')}</TableCell>
                </TableRow></TableHead>
                <TableBody>{reports.map((report) => <TableRow key={report.id} hover>
                    <TableCell>{formatDateTime(report.timestamp)}</TableCell>
                    <TableCell>{getTargetName(report)}</TableCell>
                    <TableCell align="right">{quantity(report)}</TableCell>
                    {view === 'open' && <TableCell><Chip label={formatStatus(report.severity)} color={severityColors[report.severity]} size="small" /></TableCell>}
                    <TableCell>{getUserName(report, 'reportedBy')}</TableCell>
                    <TableCell>{getUserName(report, 'handledBy')}{report.handledAt && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{formatDateTime(report.handledAt)}</Typography>}</TableCell>
                    <TableCell><Chip label={formatStatus(report.status)} size="small" /></TableCell>
                    <TableCell>{actions(report)}</TableCell>
                </TableRow>)}</TableBody>
            </Table>
        </TableContainer>;
    })();

    return <>
        {loadError && Boolean(reports?.length) && <Alert severity="warning" sx={{ mb: 1.5 }}
            action={<Button onClick={onRetry}>{t('common.retry')}</Button>}>{t('lists.damageReportsList.couldNotLoadDamageReports')}</Alert>}
        {content}
        {resolution && <DamageResolutionDialog report={resolution} targetName={getTargetName(resolution)}
            canWriteOff={canWriteOff(user)} isUpdating={isUpdating} onClose={() => setResolution(null)} onSubmit={onUpdateStatus} />}
        {info && <DamageReportInfoDialog report={info} targetName={getTargetName(info)} onClose={() => setInfo(null)} />}
        <Dialog open={Boolean(editing)} onClose={isUpdating ? undefined : () => setEditing(null)} maxWidth="sm" fullWidth>
            <DialogTitle>{t('lists.damageReportsList.editDamageReport')}</DialogTitle>
            <DialogContent sx={{ pt: '20px !important' }}>
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">{editing ? getTargetName(editing) : ''}</Typography>
                    <TextField select label={t('common.severity')} value={editSeverity} disabled={isUpdating}
                        onChange={(event) => setEditSeverity(event.target.value as DamageSeverity)} fullWidth>
                        {SEVERITY_LEVELS.map((severity) => <MenuItem key={severity} value={severity}>{nameFor('severity', severity)}</MenuItem>)}
                    </TextField>
                    <TextField label={t('common.description')} value={editDescription} onChange={(event) => setEditDescription(event.target.value)}
                        disabled={isUpdating} multiline rows={4} required fullWidth />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" disabled={isUpdating} onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                <Button variant="contained" disabled={!editing || !editDescription.trim() || isUpdating}
                    onClick={() => { void saveEdit(); }}>{t('common.save')}</Button>
            </DialogActions>
        </Dialog>
    </>;
}
