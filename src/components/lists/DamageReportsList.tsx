import { Button, IconButton } from '../shared/ActionButtons';
import { useAuth } from '../../hooks/useAuth';
import { canPerformMaintenance, canManageUsers } from '../../utils/access';
import { Dialog } from '../shared/ClosableDialog';
import {
    Box,
    Chip,
    DialogActions,
    DialogContent,
    DialogTitle,
    Paper,
    Skeleton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
    MenuItem,

    useMediaQuery,
    useTheme,
} from '@mui/material';
import { useState } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import type { Assembly, DamageReport, DamageReportUpdateData, DamageSeverity, DamageStatus, User } from '../../types';
import { formatStatus } from '../../utils/formatters';
import { formatDateTime } from '../../utils/dateFormat';
import { useItemsByIds } from '../../hooks/useItems';
import { translate, nameFor, useT } from '../../utils/naming';
import { SEVERITY_LEVELS } from '../../utils/constants';
import { LoadMore } from '../shared/LoadMore';

/** `reports` are filtered on the server; `list` loads further pages on demand. */
interface Props {
    reports: DamageReport[] | undefined;
    list: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown };
    assemblies?: Assembly[];
    users?: User[];
    isLoading: boolean;
    loadError?: boolean;
    onRetry?: () => void;
    view?: 'open' | 'history';
    isUpdating?: boolean;
    onUpdateStatus?: (id: string, status: DamageStatus, amount?: number, notes?: string, itemHint?: string) => void;
    onEdit?: (id: string, data: DamageReportUpdateData) => void;
}

const severityColors: Record<string, 'info' | 'warning' | 'error' | 'default'> = {
    low: 'info', medium: 'warning', high: 'error', critical: 'error',
};

export function DamageReportsList({ reports, list, assemblies, users, isLoading, loadError, onRetry, view = 'open', isUpdating, onUpdateStatus, onEdit }: Props) {
    const t = useT();
    const { user } = useAuth();
    const canMaintain = canPerformMaintenance(user);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const visibleReports = reports ?? [];
    const pageReports = visibleReports;
    const [resolution, setResolution] = useState<{ report: DamageReport; status: 'repaired' | 'written_off' } | null>(null);
    const [resolutionAmount, setResolutionAmount] = useState('1');
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [itemHint, setItemHint] = useState('');
    const [editing, setEditing] = useState<DamageReport | null>(null);
    const [editDescription, setEditDescription] = useState('');
    const [editSeverity, setEditSeverity] = useState<DamageSeverity>('medium');
    const resolutionItem = useItemsByIds(resolution?.report.itemId ? [resolution.report.itemId] : []).data?.[0];

    if (isLoading) return <Paper sx={{ p: 2 }}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={48} />)}</Paper>;
    if (!visibleReports.length) return (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
                {view === 'history' ? t('lists.damageReportsList.noDamageHistoryYet') : t('lists.damageReportsList.noOpenDamageReports')}
            </Typography>
            {loadError && <Button title={translate('common.retryLoadingTheData')} onClick={onRetry}>{t('lists.damageReportsList.retry')}</Button>}
        </Paper>
    );

    const getTargetName = (report: DamageReport) => {
        if (report.assemblyId) return report.assemblyName ?? assemblies?.find((assembly) => assembly.id === report.assemblyId)?.name ?? report.assemblyId;
        const itemName = report.itemId ? report.itemName ?? report.itemId : t('lists.damageReportsList.unknownTarget');
        return report.assetCode ? `${itemName} · ${report.assetCode}` : itemName;
    };
    const getUserName = (userId?: string, expanded?: User) => {
        const user = expanded ?? users?.find((candidate) => candidate.id === userId);
        return user?.name?.trim() || user?.username?.trim() || user?.email?.trim() || userId || '—';
    };
    const getActivity = (report: DamageReport) => {
        const entries = report.statusHistory?.length
            ? report.statusHistory
            : [{ status: 'reported' as DamageStatus, userId: report.reportedBy, timestamp: report.timestamp }];
        return entries.map((entry) => `${formatStatus(entry.status)}${entry.amount ? ` (${entry.amount} ×)` : ''} · ${getUserName(entry.userId)} · ${formatDateTime(entry.timestamp)}`).join('\n');
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
        setResolutionNotes('');
        setItemHint('');
    };
    const statusControl = (report: DamageReport) => canMaintain && onUpdateStatus && getUnresolvedAmount(report) > 0 ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {report.status === 'reported' && <Button title={translate('lists.damageReportsList.startReviewingThisDamageReport')} size="small" variant="outlined" disabled={isUpdating} onClick={() => onUpdateStatus(report.id, 'in_review')}>{t('lists.damageReportsList.startReview')}</Button>}
            <Button title={translate('lists.damageReportsList.enterTheNumberOfRepairedUnits')} size="small" variant="contained" color="success" disabled={isUpdating} onClick={() => openResolution(report, 'repaired')}>{t('lists.damageReportsList.repairUnits')}</Button>
            <Button title={translate('lists.damageReportsList.enterTheNumberOfUnitsToWriteOff')} size="small" variant="contained" color="error" disabled={isUpdating || !canManageUsers(user)} onClick={() => openResolution(report, 'written_off')}>{t('lists.damageReportsList.writeOffUnits')}</Button>
        </Stack>
    ) : <Chip label={formatStatus(report.status)} size="small" />;
    const openEdit = (report: DamageReport) => {
        setEditing(report);
        setEditDescription(report.description);
        setEditSeverity(report.severity);
    };
    const maxResolutionAmount = resolution ? getUnresolvedAmount(resolution.report) : 0;
    const parsedResolutionAmount = Number(resolutionAmount);
    const resolutionAmountValid = Number.isInteger(parsedResolutionAmount) && parsedResolutionAmount >= 1 && parsedResolutionAmount <= maxResolutionAmount;
    const resolutionDialog = (
        <Dialog open={Boolean(resolution)} onClose={() => setResolution(null)} maxWidth="xs" fullWidth>
            <DialogTitle>{resolution?.status === 'repaired' ? t('lists.damageReportsList.repairQuantity') : t('lists.damageReportsList.writeOffQuantity')}</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Typography sx={{ mb: 2 }}>{resolution ? getTargetName(resolution.report) : ''}</Typography>
                <TextField
                    autoFocus
                    fullWidth
                    type="number"
                    label={t('common.quantity')}
                    value={resolutionAmount}
                    onChange={(event) => setResolutionAmount(event.target.value)}
                    helperText={t('lists.damageReportsList.maxResolutionAmountDamagedUnitsRemain', { maxResolutionAmount: maxResolutionAmount })}
                    error={resolutionAmount !== '' && !resolutionAmountValid}
                    slotProps={{ htmlInput: { min: 1, max: maxResolutionAmount, step: 1 } }}
                />
                <TextField
                    fullWidth multiline minRows={2} sx={{ mt: 2 }}
                    label={t('lists.damageReportsList.whatWasDone')}
                    value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)}
                />
                {resolution?.report.itemId && <TextField
                    fullWidth multiline minRows={2} sx={{ mt: 2 }}
                    label={t('lists.damageReportsList.updateItemHintOptional')}
                    helperText={resolutionItem?.hint || t('lists.damageReportsList.thisHintAppearsOnTheItem')}
                    value={itemHint} onChange={(event) => setItemHint(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 255 } }}
                />}
            </DialogContent>
            <DialogActions>
                <Button title={translate('common.discardChangesAndClose')} color="inherit" onClick={() => setResolution(null)}>{t('common.cancel')}</Button>
                <Button title={translate('lists.damageReportsList.recordTheEnteredRepairOrWriteOff')}
                    variant="contained"
                    color={resolution?.status === 'written_off' ? 'error' : 'success'}
                    disabled={!resolution || !resolutionAmountValid || isUpdating}
                    onClick={() => {
                        if (!resolution || !resolutionAmountValid) return;
                        onUpdateStatus?.(resolution.report.id, resolution.status, parsedResolutionAmount,
                            resolutionNotes.trim() || undefined, itemHint.trim() || undefined);
                        setResolution(null);
                    }}
                >
                    {resolution?.status === 'repaired' ? t('lists.damageReportsList.recordRepair') : t('lists.damageReportsList.recordWriteOff')}
                </Button>
            </DialogActions>
        </Dialog>
    );
    const editDialog = (
        <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
            <DialogTitle>{t('lists.damageReportsList.editDamageReport')}</DialogTitle>
            <DialogContent sx={{ pt: '20px !important' }}>
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">{editing ? getTargetName(editing) : ''}</Typography>
                    <TextField select label={t('common.severity')} value={editSeverity} onChange={(event) => setEditSeverity(event.target.value as DamageSeverity)} fullWidth>
                        {SEVERITY_LEVELS.map((severity) => <MenuItem key={severity} value={severity}>{nameFor('severity', severity)}</MenuItem>)}
                    </TextField>
                    <TextField label={t('common.description')} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} multiline rows={4} required fullWidth />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button title={translate('common.discardChangesAndClose')} color="inherit" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                <Button title={translate('lists.damageReportsList.saveChangesToThisDamageReport')} variant="contained" disabled={!editing || !editDescription.trim() || isUpdating} onClick={() => {
                    if (!editing || !editDescription.trim()) return;
                    onEdit?.(editing.id, { description: editDescription.trim(), severity: editSeverity });
                    setEditing(null);
                }}>{t('common.save')}</Button>
            </DialogActions>
        </Dialog>
    );

    if (isMobile) return (
        <>
        <Stack spacing={1.5}>
            {pageReports.map((report) => (
                <Paper key={report.id} sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                        <Box><Typography sx={{ fontWeight: 700 }}>{getTargetName(report)}</Typography><Typography variant="caption" color="text.secondary">{formatDateTime(report.timestamp)}</Typography></Box>
                        <Chip label={formatStatus(report.severity)} color={severityColors[report.severity] ?? 'default'} size="small" />
                    </Box>
                    <Typography variant="body2" sx={{ my: 1.5 }}>{report.description}</Typography>
                    {report.resolutionNotes && <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{t('lists.damageReportsList.actionTaken')}: {report.resolutionNotes}</Typography>}
                    <Typography variant="body2" color="text.secondary">{t('lists.damageReportsList.reportedBy')}: {getUserName(report.reportedBy, report.expand?.reportedBy)}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('lists.damageReportsList.handledBy')}: {getUserName(report.handledBy, report.expand?.handledBy)}</Typography>
                    {view === 'history' && <Typography component="div" variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-line', mt: 1.5 }}>{getActivity(report)}</Typography>}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, my: 2, textAlign: 'center' }}>
                        <Box><Typography variant="caption" color="text.secondary">{t('common.remaining')}</Typography><Typography sx={{ fontWeight: 700 }}>{getUnresolvedAmount(report)}</Typography></Box>
                        <Box><Typography variant="caption" color="text.secondary">{t('enum.damageStatus.repaired')}</Typography><Typography sx={{ fontWeight: 700, color: 'success.main' }}>{getRepairedAmount(report)}</Typography></Box>
                        <Box><Typography variant="caption" color="text.secondary">{t('enum.damageStatus.written_off')}</Typography><Typography sx={{ fontWeight: 700, color: 'error.main' }}>{getWrittenOffAmount(report)}</Typography></Box>
                    </Box>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                        {statusControl(report)}
                        {canMaintain && onEdit && <Button title={translate('lists.damageReportsList.editTheDamageDescriptionAndSeverity')} size="small" startIcon={<EditIcon />} onClick={() => openEdit(report)}>{t('common.edit')}</Button>}
                    </Stack>
                </Paper>
            ))}
        </Stack>
        <LoadMore list={list} />
        {resolutionDialog}
        {editDialog}
        </>
    );

    return (
        <>
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
                <TableHead><TableRow>
                    <TableCell>{t('common.date')}</TableCell><TableCell>{t('lists.damageReportsList.target')}</TableCell><TableCell align="right">{t('common.quantity')}</TableCell>
                    <TableCell>{t('common.severity')}</TableCell><TableCell>{t('common.description')}</TableCell>
                    <TableCell>{t('lists.damageReportsList.reportedBy')}</TableCell><TableCell>{t('lists.damageReportsList.handledBy')}</TableCell>
                    {view === 'history' && <TableCell>{t('lists.damageReportsList.activity')}</TableCell>}<TableCell>{t('common.status')}</TableCell>
                </TableRow></TableHead>
                <TableBody>{pageReports.map((report) => (
                    <TableRow key={report.id} hover>
                        <TableCell>{formatDateTime(report.timestamp)}</TableCell><TableCell>{getTargetName(report)}</TableCell><TableCell align="right">
                            <Typography>{getUnresolvedAmount(report)} {t('lists.damageReportsList.remaining')}</Typography>
                            <Typography variant="caption" color="text.secondary">{report.amount} {t('lists.damageReportsList.total')} · {getRepairedAmount(report)} {t('lists.damageReportsList.repaired')} · {getWrittenOffAmount(report)} {t('lists.damageReportsList.writtenOff')}</Typography>
                        </TableCell>
                        <TableCell><Chip label={formatStatus(report.severity)} color={severityColors[report.severity] ?? 'default'} size="small" /></TableCell>
                        <TableCell>{report.description}{report.resolutionNotes && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'pre-line' }}>{t('lists.damageReportsList.actionTaken')}: {report.resolutionNotes}</Typography>}</TableCell><TableCell>{getUserName(report.reportedBy, report.expand?.reportedBy)}</TableCell>
                        <TableCell>{getUserName(report.handledBy, report.expand?.handledBy)}{report.handledAt && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{formatDateTime(report.handledAt)}</Typography>}</TableCell>
                        {view === 'history' && <TableCell><Typography variant="caption" sx={{ whiteSpace: 'pre-line' }}>{getActivity(report)}</Typography></TableCell>}
                        <TableCell>
                            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                                {statusControl(report)}
                                {canMaintain && onEdit && <IconButton title={t('lists.damageReportsList.editDamageReport')} size="small" onClick={() => openEdit(report)}><EditIcon fontSize="small" /></IconButton>}
                            </Stack>
                        </TableCell>
                    </TableRow>
                ))}</TableBody>
            </Table>
        </TableContainer>
        <LoadMore list={list} />
        {resolutionDialog}
        {editDialog}
        </>
    );
}
