import { Dialog } from '../shared/ClosableDialog';
import {
    Box, Button, Chip, DialogActions, DialogContent, DialogTitle, Paper, Skeleton, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
    IconButton, MenuItem, Tooltip, useMediaQuery, useTheme,
} from '@mui/material';
import { useState } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import type { Assembly, DamageReport, DamageReportUpdateData, DamageSeverity, DamageStatus, Item, User } from '../../types';
import { formatStatus } from '../../utils/formatters';
import { nameFor, useLocalizedText } from '../../utils/naming';
import { SEVERITY_LEVELS } from '../../utils/constants';
import { ListPagination } from '../shared/ListPagination';

interface Props {
    reports: DamageReport[] | undefined;
    items: Item[] | undefined;
    assemblies?: Assembly[];
    users?: User[];
    isLoading: boolean;
    loadingMore?: boolean;
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

export function DamageReportsList({ reports, items, assemblies, users, isLoading, loadingMore, loadError, onRetry, view = 'open', isUpdating, onUpdateStatus, onEdit }: Props) {
    const t = useLocalizedText();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const effectivePageSize = pageSize === -1 ? Number.MAX_SAFE_INTEGER : pageSize;
    const visibleReports = reports?.filter((report) => view === 'history'
        ? true
        : report.status === 'reported' || report.status === 'in_review');
    const currentPage = Math.min(page, Math.max(1, Math.ceil((visibleReports?.length ?? 0) / effectivePageSize)));
    const pageReports = visibleReports?.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize) ?? [];
    const [resolution, setResolution] = useState<{ report: DamageReport; status: 'repaired' | 'written_off' } | null>(null);
    const [resolutionAmount, setResolutionAmount] = useState('1');
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [itemHint, setItemHint] = useState('');
    const [editing, setEditing] = useState<DamageReport | null>(null);
    const [editDescription, setEditDescription] = useState('');
    const [editSeverity, setEditSeverity] = useState<DamageSeverity>('medium');

    if (isLoading) return <Paper sx={{ p: 2 }}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={48} />)}</Paper>;
    if (!visibleReports?.length) return (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
                {loadingMore
                    ? t('Weitere Berichte werden geladen…', 'Loading more reports…')
                    : view === 'history' ? t('Noch kein Schadensverlauf vorhanden', 'No damage history yet') : t('Keine offenen Schadensberichte', 'No open damage reports')}
            </Typography>
            {loadError && <Button onClick={onRetry}>{t('Erneut versuchen', 'Retry')}</Button>}
        </Paper>
    );

    const getTargetName = (report: DamageReport) => {
        if (report.assemblyId) return report.assemblyName ?? assemblies?.find((assembly) => assembly.id === report.assemblyId)?.name ?? report.assemblyId;
        const itemName = report.itemId ? items?.find((item) => item.id === report.itemId)?.name ?? report.itemId : t('Unbekanntes Ziel', 'Unknown target');
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
        setResolutionNotes('');
        setItemHint('');
    };
    const statusControl = (report: DamageReport) => onUpdateStatus && getUnresolvedAmount(report) > 0 ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {report.status === 'reported' && <Button size="small" variant="outlined" disabled={isUpdating} onClick={() => onUpdateStatus(report.id, 'in_review')}>{t('Prüfung starten', 'Start review')}</Button>}
            <Button size="small" variant="contained" color="success" disabled={isUpdating} onClick={() => openResolution(report, 'repaired')}>{t('Teil reparieren', 'Repair units')}</Button>
            <Button size="small" variant="contained" color="error" disabled={isUpdating} onClick={() => openResolution(report, 'written_off')}>{t('Teil abschreiben', 'Write off units')}</Button>
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
            <DialogTitle>{resolution?.status === 'repaired' ? t('Teilmenge reparieren', 'Repair quantity') : t('Teilmenge abschreiben', 'Write off quantity')}</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Typography sx={{ mb: 2 }}>{resolution ? getTargetName(resolution.report) : ''}</Typography>
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
                <TextField
                    fullWidth multiline minRows={2} sx={{ mt: 2 }}
                    label={t('Was wurde getan?', 'What was done?')}
                    value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)}
                />
                {resolution?.report.itemId && <TextField
                    fullWidth multiline minRows={2} sx={{ mt: 2 }}
                    label={t('Artikelhinweis aktualisieren (optional)', 'Update item hint (optional)')}
                    helperText={items?.find((item) => item.id === resolution.report.itemId)?.hint || t('Dieser Hinweis erscheint beim Artikel.', 'This hint appears on the item.')}
                    value={itemHint} onChange={(event) => setItemHint(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 255 } }}
                />}
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={() => setResolution(null)}>{t('Abbrechen', 'Cancel')}</Button>
                <Button
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
                    {resolution?.status === 'repaired' ? t('Reparatur buchen', 'Record repair') : t('Abschreibung buchen', 'Record write-off')}
                </Button>
            </DialogActions>
        </Dialog>
    );
    const editDialog = (
        <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
            <DialogTitle>{t('Schadensbericht bearbeiten', 'Edit damage report')}</DialogTitle>
            <DialogContent sx={{ pt: '20px !important' }}>
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">{editing ? getTargetName(editing) : ''}</Typography>
                    <TextField select label={t('Schweregrad', 'Severity')} value={editSeverity} onChange={(event) => setEditSeverity(event.target.value as DamageSeverity)} fullWidth>
                        {SEVERITY_LEVELS.map((severity) => <MenuItem key={severity} value={severity}>{nameFor('severity', severity)}</MenuItem>)}
                    </TextField>
                    <TextField label={t('Beschreibung', 'Description')} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} multiline rows={4} required fullWidth />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={() => setEditing(null)}>{t('Abbrechen', 'Cancel')}</Button>
                <Button variant="contained" disabled={!editing || !editDescription.trim() || isUpdating} onClick={() => {
                    if (!editing || !editDescription.trim()) return;
                    onEdit?.(editing.id, { description: editDescription.trim(), severity: editSeverity });
                    setEditing(null);
                }}>{t('Speichern', 'Save')}</Button>
            </DialogActions>
        </Dialog>
    );

    if (isMobile) return (
        <>
        <Stack spacing={1.5}>
            {pageReports.map((report) => (
                <Paper key={report.id} sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                        <Box><Typography sx={{ fontWeight: 700 }}>{getTargetName(report)}</Typography><Typography variant="caption" color="text.secondary">{new Date(report.timestamp).toLocaleString()}</Typography></Box>
                        <Chip label={formatStatus(report.severity)} color={severityColors[report.severity] ?? 'default'} size="small" />
                    </Box>
                    <Typography variant="body2" sx={{ my: 1.5 }}>{report.description}</Typography>
                    {report.resolutionNotes && <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{t('Maßnahme', 'Action taken')}: {report.resolutionNotes}</Typography>}
                    <Typography variant="body2" color="text.secondary">{t('Gemeldet von', 'Reported by')}: {getUserName(report.reportedBy, report.expand?.reportedBy)}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('Bearbeitet von', 'Handled by')}: {getUserName(report.handledBy, report.expand?.handledBy)}</Typography>
                    {view === 'history' && <Typography component="div" variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-line', mt: 1.5 }}>{getActivity(report)}</Typography>}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, my: 2, textAlign: 'center' }}>
                        <Box><Typography variant="caption" color="text.secondary">{t('Offen', 'Remaining')}</Typography><Typography sx={{ fontWeight: 700 }}>{getUnresolvedAmount(report)}</Typography></Box>
                        <Box><Typography variant="caption" color="text.secondary">{t('Repariert', 'Repaired')}</Typography><Typography sx={{ fontWeight: 700, color: 'success.main' }}>{getRepairedAmount(report)}</Typography></Box>
                        <Box><Typography variant="caption" color="text.secondary">{t('Abgeschrieben', 'Written off')}</Typography><Typography sx={{ fontWeight: 700, color: 'error.main' }}>{getWrittenOffAmount(report)}</Typography></Box>
                    </Box>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                        {statusControl(report)}
                        {onEdit && <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(report)}>{t('Bearbeiten', 'Edit')}</Button>}
                    </Stack>
                </Paper>
            ))}
        </Stack>
        <ListPagination pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} count={visibleReports.length} page={currentPage} onChange={setPage} loadingMore={loadingMore} loadError={loadError} onRetry={onRetry} />
        {resolutionDialog}
        {editDialog}
        </>
    );

    return (
        <>
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
                <TableHead><TableRow>
                    <TableCell>{t('Datum', 'Date')}</TableCell><TableCell>{t('Objekt', 'Target')}</TableCell><TableCell align="right">{t('Menge', 'Quantity')}</TableCell>
                    <TableCell>{t('Schweregrad', 'Severity')}</TableCell><TableCell>{t('Beschreibung', 'Description')}</TableCell>
                    <TableCell>{t('Gemeldet von', 'Reported by')}</TableCell><TableCell>{t('Bearbeitet von', 'Handled by')}</TableCell>
                    {view === 'history' && <TableCell>{t('Verlauf', 'Activity')}</TableCell>}<TableCell>{t('Status', 'Status')}</TableCell>
                </TableRow></TableHead>
                <TableBody>{pageReports.map((report) => (
                    <TableRow key={report.id} hover>
                        <TableCell>{new Date(report.timestamp).toLocaleString()}</TableCell><TableCell>{getTargetName(report)}</TableCell><TableCell align="right">
                            <Typography>{getUnresolvedAmount(report)} {t('offen', 'remaining')}</Typography>
                            <Typography variant="caption" color="text.secondary">{report.amount} {t('gesamt', 'total')} · {getRepairedAmount(report)} {t('repariert', 'repaired')} · {getWrittenOffAmount(report)} {t('abgeschrieben', 'written off')}</Typography>
                        </TableCell>
                        <TableCell><Chip label={formatStatus(report.severity)} color={severityColors[report.severity] ?? 'default'} size="small" /></TableCell>
                        <TableCell>{report.description}{report.resolutionNotes && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'pre-line' }}>{t('Maßnahme', 'Action taken')}: {report.resolutionNotes}</Typography>}</TableCell><TableCell>{getUserName(report.reportedBy, report.expand?.reportedBy)}</TableCell>
                        <TableCell>{getUserName(report.handledBy, report.expand?.handledBy)}{report.handledAt && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{new Date(report.handledAt).toLocaleString()}</Typography>}</TableCell>
                        {view === 'history' && <TableCell><Typography variant="caption" sx={{ whiteSpace: 'pre-line' }}>{getActivity(report)}</Typography></TableCell>}
                        <TableCell>
                            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                                {statusControl(report)}
                                {onEdit && <Tooltip title={t('Schadensbericht bearbeiten', 'Edit damage report')}><IconButton size="small" onClick={() => openEdit(report)}><EditIcon fontSize="small" /></IconButton></Tooltip>}
                            </Stack>
                        </TableCell>
                    </TableRow>
                ))}</TableBody>
            </Table>
        </TableContainer>
        <ListPagination pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} count={visibleReports.length} page={currentPage} onChange={setPage} loadingMore={loadingMore} loadError={loadError} onRetry={onRetry} />
        {resolutionDialog}
        {editDialog}
        </>
    );
}
