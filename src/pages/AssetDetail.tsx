import { Button } from '../components/shared/ActionButtons';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    Alert,
    Box,
    Chip,
    Divider,
    Paper,
    Skeleton,
    Stack,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import HistoryIcon from '@mui/icons-material/History';
import { useItem, useItemAssets } from '../hooks/useItems';
import { LoadMore } from '../components/shared/LoadMore';
import { useTransactions } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';
import { DamageReportDialog } from '../components/forms/DamageReportDialog';
import { formatStatus } from '../utils/formatters';
import { formatDateTime } from '../utils/dateFormat';
import { translate, useLocalizedText } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canEditCatalog, canPerformCustody, canPerformMaintenance } from '../utils/access';
import { EquipmentOwnership } from '../components/items/EquipmentOwnership';
import { OperationForm } from '../components/operations/OperationForm';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { apiRequest } from '../services/apiClient';
import { OperatingHoursDialog } from '../components/items/OperatingHoursDialog';
import { AssetMaintenance } from '../components/maintenance/AssetMaintenance';
import { isOpenDamage } from '../utils/damage';
import AvTimerIcon from '@mui/icons-material/AvTimer';

const stateColors: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
    available: 'success', in_custody: 'warning', in_field: 'warning', damaged: 'error',
    in_repair: 'warning', in_maintenance: 'info', written_off: 'default',
};

export function AssetDetail() {
    const { user } = useAuth();
    const canReportDamage = canPerformCustody(user);
    const t = useLocalizedText();
    const navigate = useNavigate();
    const { itemId, assetId } = useParams<{ itemId: string; assetId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const [damageOpen, setDamageOpen] = useState(canReportDamage && searchParams.get('reportDamage') === '1');
    const { data: item, isLoading: itemLoading } = useItem(itemId ?? '');
    const { data: locations = [] } = useStorageLocations();
    const canEditPrivate = Boolean(item?.access?.privateResource && item.access.canEdit);
    const [privateAction, setPrivateAction] = useState<'relocate' | 'condition' | null>(null);
    const canEditAsset = item ? (item.access?.privateResource ? Boolean(item.access.canEdit) : canEditCatalog(user)) : false;
    const [hoursOpen, setHoursOpen] = useState(false);
    const { data: assets, isLoading: assetsLoading } = useItemAssets(itemId);
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
                    transaction.expand?.factionOrderId?.orderCode,
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
                title: t(`Schadensbericht · ${formatStatus(report.status)}`, `Damage report · ${formatStatus(report.status)}`),
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

    if (itemLoading || assetsLoading) return <Box><Skeleton height={70} /><Skeleton height={240} /><Skeleton height={240} /></Box>;
    if (!item || !asset) return <Alert severity="error">{t('Asset nicht gefunden', 'Asset not found')}</Alert>;

    return (
        <Box>
            <Button title={translate('Zur Detailseite des Artikels zurückkehren', 'Return to the item details')} startIcon={<ArrowBackIcon />} onClick={() => navigate(`/items/${item.id}`)} sx={{ mb: 2 }}>
                {t('Zurück zum Artikel', 'Back to item')}
            </Button>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Box>
                    <Typography variant="overline" color="text.secondary">{item.name}</Typography>
                    <Typography variant="h4" className="mono" sx={{ overflowWrap: 'anywhere' }}>{asset.assetCode}</Typography>
                    {asset.serialNumber && <Typography color="text.secondary">S/N {asset.serialNumber}</Typography>}
                </Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Chip label={formatStatus(asset.availabilityStatus)} color={stateColors[asset.availabilityStatus] ?? 'default'} />
                    {canReportDamage && <Button title={translate('Einen Schaden an diesem Gerät melden', 'Report damage to this asset')} variant="contained" color="error" startIcon={<ReportProblemOutlinedIcon />} onClick={() => setDamageOpen(true)}>
                        {t('Schaden melden', 'Report damage')}
                    </Button>}
                </Stack>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 0.8fr) minmax(0, 1.7fr)' }, gap: 3 }}>
                <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>{t('Asset-Informationen', 'Asset information')}</Typography>
                    <Stack spacing={1.5} divider={<Divider flexItem />}>
                        <InfoRow label={t('Zustand', 'Condition')} value={formatStatus(asset.conditionStatus)} />
                        <InfoRow label={t('Hersteller / Modell', 'Manufacturer / model')} value={[asset.manufacturer, asset.model].filter(Boolean).join(' ') || '—'} />
                        <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1 }}>
                            <InfoRow label={t('Betriebsstunden', 'Operating hours')} value={asset.operatingHours == null ? '—' : `${asset.operatingHours} h`} />
                            {canEditAsset && <Button title={translate('Gelaufene Stunden oder einen neuen Zählerstand erfassen', 'Log hours run or a new meter reading')} size="small" startIcon={<AvTimerIcon />} onClick={() => setHoursOpen(true)}>
                                {t('Erfassen', 'Log')}
                            </Button>}
                        </Box>
                        <InfoRow icon={<PlaceOutlinedIcon fontSize="small" />} label={t('Aktueller Ort', 'Current location')} value={asset.currentLocationName || '—'} />
                        <InfoRow icon={<PersonOutlineIcon fontSize="small" />} label={t('Aktueller Entleiher', 'Current custodian')} value={asset.currentCustodianName || '—'} />
                        <InfoRow label={t('Notizen', 'Notes')} value={asset.notes || '—'} />
                        <InfoRow label={t('Registriert', 'Registered')} value={formatDateTime(asset.createdAt)} />
                    </Stack>
                </Paper>

                <Paper sx={{ p: { xs: 2, sm: 3 } }}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}><HistoryIcon />{t('Nutzung & Verlauf', 'Usage & history')}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('Zeigt Ausgaben, Rückgaben, Events, Fraktionen, Reparaturen und Schadensmeldungen dieses Einzelgeräts.', 'Shows checkouts, returns, events, factions, repairs, and damage reports for this exact unit.')}
                    </Typography>
                    {(transactionsLoading || reportsLoading) ? <Skeleton height={180} /> : activity.length === 0 ? (
                        <Alert severity="info">{t('Für dieses Asset wurde noch keine Nutzung protokolliert.', 'No usage has been recorded for this asset yet.')}</Alert>
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

            <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ReportProblemOutlinedIcon color={openReports.length ? 'error' : undefined} />
                        {t('Gemeldete Schäden', 'Reported damage')} ({assetReports.length})
                    </Typography>
                    {openReports.length > 0 && <Chip size="small" color="error" label={t(`${openReports.length} offen`, `${openReports.length} open`)} />}
                </Stack>
                {reportsLoading ? <Skeleton height={80} /> : assetReports.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">{t('Für dieses Gerät wurde noch kein Schaden gemeldet.', 'No damage has been reported for this asset.')}</Typography>
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
                                {report.resolutionNotes && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{t('Maßnahme', 'Action taken')}: {report.resolutionNotes}</Typography>}
                            </Box>;
                        })}
                    </Stack>
                )}
            </Paper>

            <AssetMaintenance item={item} asset={asset} canEdit={canPerformMaintenance(user)} />

            <EquipmentOwnership item={item} canEdit={canEditPrivate} />
            {canEditPrivate && <Stack direction="row" spacing={1} sx={{ my: 2 }}>
                <Button title={t('Gerät an einen anderen Lagerort verschieben', 'Move asset to another storage location')} onClick={() => setPrivateAction('relocate')}>{t('Gerät verschieben', 'Move asset')}</Button>
                <Button title={t('Zustand des eigenen Geräts aktualisieren', 'Update private asset condition')} onClick={() => setPrivateAction('condition')}>{t('Zustand aktualisieren', 'Update condition')}</Button>
            </Stack>}
            {canEditPrivate && privateAction && <OperationForm title={privateAction === 'relocate' ? t('Gerät verschieben', 'Move asset') : t('Zustand aktualisieren', 'Update condition')}
                onClose={() => setPrivateAction(null)} initial={{ locationId: asset.currentLocationId ?? '', conditionStatus: asset.conditionStatus }}
                fields={privateAction === 'relocate'
                    ? [{ key: 'locationId', label: t('Lagerort', 'Location'), required: true, options: locations.filter(l => l.active).map(l => ({ value: l.id, label: l.name })) }]
                    : [{ key: 'conditionStatus', label: t('Zustand', 'Condition'), required: true, options: ['new_condition', 'good', 'fair', 'damaged', 'unsafe'].map(value => ({ value, label: formatStatus(value) })) }]}
                onSave={values => apiRequest(`/api/items/${item.id}/assets/${asset.id}/${privateAction}`, { method: 'POST', body: { expectedVersion: asset.version, ...(privateAction === 'relocate' ? { locationId: values.locationId } : { conditionStatus: values.conditionStatus }) } })} />}
            <OperatingHoursDialog itemId={item.id} asset={hoursOpen ? asset : null} onClose={() => setHoursOpen(false)} />
            <DamageReportDialog
                key={asset.id}
                open={damageOpen}
                onClose={closeDamageDialog}
                title={t(`Schaden an ${asset.assetCode} melden`, `Report damage to ${asset.assetCode}`)}
                preselectedItemId={item.id}
                preselectedAssetId={asset.id}
                preselectedAsset={asset}
                maxAmount={1}
            />
        </Box>
    );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
    return (
        <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>{icon}{label}</Typography>
            <Typography sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
        </Box>
    );
}
