import { Button } from '../components/shared/ActionButtons';
import { ActionBar } from '../components/shared/ActionBar';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    Alert,
    Box,
    Chip,
    Divider,
    Link,
    Paper,
    Skeleton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import HistoryIcon from '@mui/icons-material/History';
import EditIcon from '@mui/icons-material/Edit';
import AvTimerIcon from '@mui/icons-material/AvTimer';
import { useQueryClient } from '@tanstack/react-query';
import { useAssetRuntime, useItem, useItemAssets, useUpdateItemAsset } from '../hooks/useItems';
import { LoadMore } from '../components/shared/LoadMore';
import { useTransactions } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';
import { DamageReportDialog } from '../components/forms/DamageReportDialog';
import { formatStatus } from '../utils/formatters';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import { formatMoney } from '../utils/money';
import { translate, useT } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canEditCatalog, canPerformCustody, canPerformMaintenance } from '../utils/access';
import { EquipmentOwnership } from '../components/items/EquipmentOwnership';
import { OperationForm } from '../components/operations/OperationForm';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { apiRequest } from '../services/apiClient';
import { OperatingHoursDialog } from '../components/items/OperatingHoursDialog';
import { AssetMaintenance } from '../components/maintenance/AssetMaintenance';
import { AssetEditFields } from '../components/items/AssetDetailsFields';
import { assetEditInput } from '../components/items/assetInput';
import { DialogForm, FormDialog } from '../components/shared/FormDialog';
import { DetailPanel } from '../components/items/CompactDetail';
import { isOpenDamage } from '../utils/damage';
import { locationLabel } from '../utils/locationHierarchy';
import { useUIStore } from '../store/uiStore';
import type { AssetInstanceInput, RuntimeEntry } from '../types';

const stateColors: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
    available: 'success', in_custody: 'warning', in_field: 'warning', damaged: 'error',
    in_repair: 'warning', in_maintenance: 'info', written_off: 'default',
};

/** One serialized unit: edited like an item, while ownership, keeper and commitments are shared by all units of its item. */
export function AssetDetail() {
    const { user } = useAuth();
    const canReportDamage = canPerformCustody(user);
    const t = useT();
    const navigate = useNavigate();
    const client = useQueryClient();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const { itemId, assetId } = useParams<{ itemId: string; assetId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const [damageOpen, setDamageOpen] = useState(canReportDamage && searchParams.get('reportDamage') === '1');
    const { data: item, isLoading: itemLoading } = useItem(itemId ?? '');
    const { data: locations = [] } = useStorageLocations();
    const canEditAsset = item ? (item.access?.privateResource ? Boolean(item.access.canEdit) : canEditCatalog(user)) : false;
    const [action, setAction] = useState<'relocate' | 'condition' | null>(null);
    const [editing, setEditing] = useState<AssetInstanceInput | null>(null);
    const [hoursOpen, setHoursOpen] = useState(false);
    const { data: assets, isLoading: assetsLoading } = useItemAssets(itemId);
    const updateAsset = useUpdateItemAsset(itemId);
    const runtime = useAssetRuntime(itemId, assetId);
    const transactionPages = useTransactions({ assetInstanceId: assetId }, 200);
    const { data: transactions, isLoading: transactionsLoading } = transactionPages;
    const { data: reports, isLoading: reportsLoading } = useDamageReports(undefined, { assetInstanceId: assetId }, 200);
    const asset = assets?.find((candidate) => candidate.id === assetId);
    const assetReports = [...(reports ?? [])]
        .filter((report) => report.assetInstanceId === assetId)
        .sort((a, b) => Number(isOpenDamage(b)) - Number(isOpenDamage(a))
            || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const openReports = assetReports.filter((report) => isOpenDamage(report));

    const activity = (() => {
        const transactionEvents = (transactions ?? [])
            .filter((transaction) => transaction.assetInstanceId === assetId)
            .map((transaction) => ({
                id: `transaction:${transaction.id}`,
                timestamp: transaction.timestamp,
                title: formatStatus(transaction.transactionType),
                detail: [
                    transaction.expand?.order?.orderCode,
                    transaction.eventType,
                    transaction.faction,
                    transaction.reason,
                    transaction.notes,
                ].filter(Boolean).join(' · '),
                color: transaction.transactionType === 'written_off' ? 'error.main' : transaction.transactionType === 'repaired' ? 'success.main' : 'primary.main',
            }));
        const damageEvents = (reports ?? [])
            .filter((report) => report.assetInstanceId === assetId)
            .map((report) => ({
                id: `damage:${report.id}`,
                timestamp: report.timestamp,
                title: t('pages.assetDetail.damageReportStatus', { status: String(formatStatus(report.status)) }),
                detail: report.description,
                color: 'error.main',
            }));
        return [...transactionEvents, ...damageEvents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    })();

    function closeDamageDialog() {
        setDamageOpen(false);
        if (searchParams.has('reportDamage')) {
            const next = new URLSearchParams(searchParams);
            next.delete('reportDamage');
            setSearchParams(next, { replace: true });
        }
    }

    function refreshAsset() {
        void client.invalidateQueries({ queryKey: ['items', itemId] });
    }

    function saveEdit() {
        if (!asset || !editing) return;
        updateAsset.mutate({ assetId: asset.id, input: editing }, {
            onSuccess: () => { setEditing(null); refreshAsset(); showSnackbar(t('pages.assetDetail.assetSaved'), 'success'); },
            onError: (error) => showSnackbar(error instanceof Error ? error.message : t('items.operatingHoursDialog.couldNotSave'), 'error'),
        });
    }

    if (itemLoading || assetsLoading) return <Box><Skeleton height={70} /><Skeleton height={240} /><Skeleton height={240} /></Box>;
    if (!item || !asset) return <Alert severity="error">{t('pages.assetDetail.assetNotFound')}</Alert>;

    const currentLocation = locations.find((location) => location.id === asset.currentLocationId);
    const movable = ['available', 'damaged', 'in_repair', 'in_maintenance'].includes(asset.availabilityStatus);

    return (
        <Box>
            <Button title={translate('pages.assetDetail.returnToTheItemDetails')} startIcon={<ArrowBackIcon />} onClick={() => navigate(`/items/${item.id}`)} sx={{ mb: 2 }}>
                {t('pages.assetDetail.backToItem')}
            </Button>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Box>
                    <Link component={RouterLink} to={`/items/${item.id}`} variant="overline" color="text.secondary" underline="hover">{item.name}</Link>
                    <Typography variant="h4" className="mono" sx={{ overflowWrap: 'anywhere' }}>{asset.assetCode}</Typography>
                    {asset.serialNumber && <Typography color="text.secondary">S/N {asset.serialNumber}</Typography>}
                </Box>
                <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flex: '1 0 auto', minWidth: 0, maxWidth: '100%' }}>
                    <Chip label={formatStatus(asset.availabilityStatus)} color={stateColors[asset.availabilityStatus] ?? 'default'} />
                    <ActionBar align="start" actions={[
                        canEditAsset && { key: 'edit', label: t('common.edit'), title: translate('pages.assetDetail.editAssetInformation'), icon: <EditIcon />,
                            onClick: () => setEditing(assetEditInput(asset, Boolean(item.tracksRuntime))) },
                        canReportDamage && { key: 'damage', label: t('common.reportDamage'), title: translate('pages.assetDetail.reportDamageToThisAsset'), icon: <ReportProblemOutlinedIcon />,
                            variant: 'contained', color: 'error', pinned: true, onClick: () => setDamageOpen(true) },
                    ]} />
                </Stack>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 0.8fr) minmax(0, 1.7fr)' }, gap: 3 }}>
                <Paper sx={{ p: { xs: 2, sm: 3 } }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>{t('pages.assetDetail.assetInformation')}</Typography>
                    <Stack spacing={1.5} divider={<Divider flexItem />}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1 }}>
                            <InfoRow label={t('pages.assetDetail.condition')} value={formatStatus(asset.conditionStatus)} />
                            {canEditAsset && <Button size="small" title={t('pages.assetDetail.updateCondition')} sx={{ flexShrink: 0 }} onClick={() => setAction('condition')}>{t('common.edit')}</Button>}
                        </Box>
                        <InfoRow label={t('pages.assetDetail.manufacturerModel')} value={[asset.manufacturer, asset.model].filter(Boolean).join(' ') || '—'} />
                        <InfoRow label={t('items.assetDetailsFields.purchaseDate')} value={asset.purchaseDate ? formatDate(asset.purchaseDate) : '—'} />
                        <InfoRow label={t('items.assetDetailsFields.purchasePrice')} value={asset.purchasePrice == null ? '—' : formatMoney(asset.purchasePrice)} />
                        <InfoRow label={t('items.assetDetailsFields.replacementValue')} value={asset.replacementValue == null ? '—' : formatMoney(asset.replacementValue)} />
                        {item.tracksRuntime && <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1 }}>
                            <InfoRow label={t('enum.value.operating_hours')} value={asset.operatingHours == null ? '—' : `${asset.operatingHours} h`} />
                            {canEditAsset && <Button title={translate('pages.assetDetail.logHoursRunOrANewMeterReading')} size="small" startIcon={<AvTimerIcon />} sx={{ flexShrink: 0 }} onClick={() => setHoursOpen(true)}>
                                {t('pages.assetDetail.log')}
                            </Button>}
                        </Box>}
                        <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1 }}>
                            <InfoRow icon={<PlaceOutlinedIcon fontSize="small" />} label={t('pages.assetDetail.currentLocation')}
                                value={currentLocation ? locationLabel(currentLocation, locations) : asset.currentLocationName || '—'} />
                            {canEditAsset && <Button size="small" disabled={!movable} title={t('pages.assetDetail.moveAssetToAnotherStorageLocation')} sx={{ flexShrink: 0 }} onClick={() => setAction('relocate')}>
                                {t('pages.assetDetail.moveAsset')}
                            </Button>}
                        </Box>
                        <InfoRow icon={<PersonOutlineIcon fontSize="small" />} label={t('pages.assetDetail.currentCustodian')} value={asset.currentCustodianName || '—'} />
                        <InfoRow label={t('pages.assetDetail.notes')} value={asset.notes || '—'} />
                        <InfoRow label={t('pages.assetDetail.registered')} value={formatDateTime(asset.createdAt)} />
                    </Stack>
                </Paper>

                <Paper sx={{ p: { xs: 2, sm: 3 } }}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}><HistoryIcon />{t('pages.assetDetail.usageHistory')}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('pages.assetDetail.showsCheckoutsReturnsEventsFactionsRepairsAndDamageReportsFor')}
                    </Typography>
                    {(transactionsLoading || reportsLoading) ? <Skeleton height={180} /> : activity.length === 0 ? (
                        <Alert severity="info">{t('pages.assetDetail.noUsageHasBeenRecordedForThisAssetYet')}</Alert>
                    ) : (
                        <Stack spacing={0}>
                            {activity.map((entry) => (
                                <Box key={entry.id} sx={{ position: 'relative', pl: 3, pb: 2.5, borderLeft: 2, borderColor: 'divider', '&::before': { content: '""', position: 'absolute', left: -6, top: 4, width: 10, height: 10, borderRadius: '50%', bgcolor: entry.color } }}>
                                    <Typography sx={{ fontWeight: 700 }}>{entry.title}</Typography>
                                    <Typography variant="caption" color="text.secondary">{formatDateTime(entry.timestamp)}</Typography>
                                    {entry.detail && <Typography variant="body2" sx={{ mt: 0.5 }}>{entry.detail}</Typography>}
                                </Box>
                            ))}
                        </Stack>
                    )}
                    <LoadMore list={transactionPages} />
                </Paper>
            </Box>

            {item.tracksRuntime && <RuntimePanel entries={runtime.data ?? []} loading={runtime.isLoading} error={runtime.isError} onRetry={() => void runtime.refetch()}
                actions={canEditAsset ? <Button size="small" startIcon={<AvTimerIcon />} onClick={() => setHoursOpen(true)}>{t('pages.assetDetail.log')}</Button> : undefined} />}

            <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ReportProblemOutlinedIcon color={openReports.length ? 'error' : undefined} />
                        {t('pages.assetDetail.reportedDamage')} ({assetReports.length})
                    </Typography>
                    {openReports.length > 0 && <Chip size="small" color="error" label={t('pages.assetDetail.openReportCountOpen', { openReportCount: String(openReports.length) })} />}
                </Stack>
                {reportsLoading ? <Skeleton height={80} /> : assetReports.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">{t('pages.assetDetail.noDamageHasBeenReportedForThisAsset')}</Typography>
                ) : (
                    <Stack spacing={1}>
                        {assetReports.map((report) => {
                            const open = isOpenDamage(report);
                            return <Box key={report.id} sx={{ border: 1, borderColor: open ? 'error.main' : 'divider', borderRadius: 1, p: 1.25 }}>
                                <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                                    <Chip size="small" color={open ? 'error' : 'default'} label={formatStatus(report.status)} />
                                    <Chip size="small" variant="outlined" label={formatStatus(report.severity)} />
                                    <Typography variant="caption" color="text.secondary">
                                        {[formatDateTime(report.timestamp), report.expand?.reportedBy?.name].filter(Boolean).join(' · ')}
                                    </Typography>
                                </Stack>
                                <Typography sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>{report.description}</Typography>
                                {report.resolutionNotes && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{t('pages.assetDetail.actionTaken')}: {report.resolutionNotes}</Typography>}
                            </Box>;
                        })}
                    </Stack>
                )}
            </Paper>

            <AssetMaintenance item={item} asset={asset} canEdit={canPerformMaintenance(user)} />

            <DetailPanel title={t('pages.itemDetail.ownershipKeeper')} sx={{ mt: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('items.equipmentOwnership.ownershipAndKeeperApplyToEveryUnitOfThisItem')}</Typography>
                <EquipmentOwnership item={item} canEdit={canEditAsset} embedded highlightAssetId={asset.id} />
            </DetailPanel>

            {canEditAsset && action && <OperationForm title={action === 'relocate' ? t('pages.assetDetail.moveAsset') : t('pages.assetDetail.updateCondition')}
                onClose={() => setAction(null)} initial={{ locationId: asset.currentLocationId ?? '', conditionStatus: asset.conditionStatus }}
                fields={action === 'relocate'
                    ? [{ key: 'locationId', label: t('enum.value.location'), required: true, options: locations.filter(l => l.active).sort((a, b) => a.fullCode.localeCompare(b.fullCode, undefined, { numeric: true })).map(l => ({ value: l.id, label: locationLabel(l, locations) })) }, { key: 'notes', label: t('common.notes') }]
                    : [{ key: 'conditionStatus', label: t('pages.assetDetail.condition'), required: true, options: ['new_condition', 'good', 'fair', 'damaged', 'unsafe'].map(value => ({ value, label: formatStatus(value) })) }]}
                onSave={async values => {
                    await apiRequest(`/api/items/${item.id}/assets/${asset.id}/${action}`, { method: 'POST', body: { expectedVersion: asset.version, ...(action === 'relocate' ? { locationId: values.locationId, notes: values.notes || undefined } : { conditionStatus: values.conditionStatus }) } });
                    refreshAsset();
                }} />}
            {editing && <FormDialog open onClose={() => { if (!updateAsset.isPending) setEditing(null); }}>
                <DialogForm title={`${t('items.assetInstancesList.editAsset')}: ${asset.assetCode}`} onSubmit={saveEdit} onCancel={() => setEditing(null)}
                    pending={updateAsset.isPending} submitLabel={t('common.save')}>
                    <AssetEditFields value={editing} tracksRuntime={Boolean(item.tracksRuntime)} onChange={(patch) => setEditing((prev) => prev && ({ ...prev, ...patch }))} />
                </DialogForm>
            </FormDialog>}
            <OperatingHoursDialog itemId={item.id} asset={hoursOpen ? asset : null} onClose={() => setHoursOpen(false)} />
            <DamageReportDialog
                key={asset.id}
                open={damageOpen}
                onClose={closeDamageDialog}
                title={t('pages.assetDetail.reportDamageToAssetCode', { assetCode: String(asset.assetCode) })}
                preselectedItemId={item.id}
                preselectedAssetId={asset.id}
                preselectedAsset={asset}
                maxAmount={1}
            />
        </Box>
    );
}

/** Meter reading, source and the notes column are dropped on phones; notes move under the event. */
const wideOnly = { display: { xs: 'none', sm: 'table-cell' } } as const;

/** Runtime bookings with a per-event summary, so it is visible which event a unit ran at and for how long. */
function RuntimePanel({ entries, loading, error, onRetry, actions }: { entries: RuntimeEntry[]; loading: boolean; error: boolean; onRetry: () => void; actions?: React.ReactNode }) {
    const t = useT();
    const sources: Record<RuntimeEntry['source'], string> = {
        manual: t('pages.assetDetail.runtimeSourceManual'), return_check: t('pages.assetDetail.runtimeSourceReturnCheck'),
        maintenance: t('pages.assetDetail.runtimeSourceMaintenance'), correction: t('pages.assetDetail.runtimeSourceCorrection'),
    };
    const byEvent = new Map<string, { label: string; hours: number }>();
    for (const entry of entries) {
        if (entry.source === 'correction') continue;
        const key = entry.eventOccurrenceId ?? '';
        const label = entry.eventName ? `${entry.eventName}${entry.eventStartDate ? ` · ${formatDate(entry.eventStartDate)}` : ''}` : t('pages.assetDetail.withoutEvent');
        const current = byEvent.get(key) ?? { label, hours: 0 };
        current.hours = Math.round((current.hours + Number(entry.hours)) * 100) / 100;
        byEvent.set(key, current);
    }
    return <DetailPanel title={t('pages.assetDetail.runtimeByEvent')} actions={actions} sx={{ mt: 3 }}>
        {error ? <Alert severity="error" action={<Button size="small" onClick={onRetry}>{t('common.retry')}</Button>}>{t('pages.assetDetail.couldNotLoadRuntime')}</Alert>
            : loading ? <Skeleton height={80} />
            : entries.length === 0 ? <Typography variant="body2" color="text.secondary">{t('pages.assetDetail.noRuntimeRecordedYet')}</Typography>
            : <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    {[...byEvent.values()].map((summary) => <Chip key={summary.label} variant="outlined" sx={{ maxWidth: '100%' }} label={`${summary.label}: ${summary.hours} h`} />)}
                </Stack>
                <TableContainer sx={{ maxHeight: 320 }}>
                    <Table size="small" stickyHeader sx={{ '& .MuiTableCell-root': { px: { xs: 1, sm: 2 } } }}>
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('common.date')}</TableCell>
                                <TableCell>{t('items.operatingHoursDialog.event')}</TableCell>
                                <TableCell align="right">{t('items.operatingHoursDialog.hoursRun')}</TableCell>
                                <TableCell align="right" sx={wideOnly}>{t('pages.assetDetail.meterReading')}</TableCell>
                                <TableCell sx={wideOnly}>{t('pages.assetDetail.source')}</TableCell>
                                <TableCell sx={wideOnly}>{t('common.notes')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {entries.map((entry) => <TableRow key={entry.id} hover>
                                <TableCell sx={{ whiteSpace: { sm: 'nowrap' } }}>{formatDateTime(entry.recordedAt)}</TableCell>
                                <TableCell>{entry.eventName ?? '—'}{entry.orderLabel && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{entry.orderLabel}</Typography>}
                                    {entry.notes && <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' } }}>{entry.notes}</Typography>}</TableCell>
                                <TableCell align="right" className="tabular">{Number(entry.hours) > 0 ? `+${entry.hours}` : entry.hours} h</TableCell>
                                <TableCell align="right" className="tabular" sx={wideOnly}>{entry.readingAfter} h</TableCell>
                                <TableCell sx={wideOnly}>{sources[entry.source]}{entry.recordedByName && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{entry.recordedByName}</Typography>}</TableCell>
                                <TableCell sx={wideOnly}>{entry.notes || '—'}</TableCell>
                            </TableRow>)}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Stack>}
    </DetailPanel>;
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>{icon}{label}</Typography>
            <Typography sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
        </Box>
    );
}
