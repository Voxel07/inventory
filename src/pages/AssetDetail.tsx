import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    Alert, Box, Button, Chip, Dialog, DialogContent, DialogTitle, Divider, Paper, Skeleton,
    Stack, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import HistoryIcon from '@mui/icons-material/History';
import { useItem, useItemAssets } from '../hooks/useItems';
import { useTransactions } from '../hooks/useTransactions';
import { useCreateDamageReport, useDamageReports } from '../hooks/useDamageReports';
import { DamageReportForm } from '../components/forms/DamageReportForm';
import { useUIStore } from '../store/uiStore';
import type { DamageReportFormData } from '../types';
import { formatStatus } from '../utils/formatters';
import { useLocalizedText } from '../utils/naming';
import { isOfflineQueuedError } from '../utils/offline';

const stateColors: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
    available: 'success', in_custody: 'warning', in_field: 'warning', damaged: 'error',
    in_repair: 'warning', in_maintenance: 'info', written_off: 'default',
};

export function AssetDetail() {
    const t = useLocalizedText();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const navigate = useNavigate();
    const { itemId, assetId } = useParams<{ itemId: string; assetId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const [damageOpen, setDamageOpen] = useState(searchParams.get('reportDamage') === '1');
    const { data: item, isLoading: itemLoading } = useItem(itemId ?? '');
    const { data: assets, isLoading: assetsLoading } = useItemAssets(itemId);
    const { data: transactions, isLoading: transactionsLoading } = useTransactions({ assetInstanceId: assetId, size: 200 });
    const { data: reports, isLoading: reportsLoading } = useDamageReports(undefined, { assetInstanceId: assetId, size: 200 });
    const createDamage = useCreateDamageReport();
    const showSnackbar = useUIStore((state) => state.showSnackbar);
    const asset = assets?.find((candidate) => candidate.id === assetId);

    const activity = useMemo(() => {
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
    }, [assetId, reports, t, transactions]);

    function closeDamageDialog() {
        setDamageOpen(false);
        if (searchParams.has('reportDamage')) {
            const next = new URLSearchParams(searchParams);
            next.delete('reportDamage');
            setSearchParams(next, { replace: true });
        }
    }

    function submitDamage(data: DamageReportFormData) {
        createDamage.mutate(data, {
            onSuccess: () => {
                closeDamageDialog();
                showSnackbar(t('Schadensbericht übermittelt', 'Damage report submitted'), 'success');
            },
            onError: (error) => {
                if (isOfflineQueuedError(error)) return;
                showSnackbar(t('Fehler beim Übermitteln des Schadensberichts', 'Could not submit damage report'), 'error');
            },
        });
    }

    if (itemLoading || assetsLoading) return <Box><Skeleton height={70} /><Skeleton height={240} /><Skeleton height={240} /></Box>;
    if (!item || !asset) return <Alert severity="error">{t('Asset nicht gefunden', 'Asset not found')}</Alert>;

    return (
        <Box>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/items/${item.id}`)} sx={{ mb: 2 }}>
                {t('Zurück zum Artikel', 'Back to item')}
            </Button>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Box>
                    <Typography variant="overline" color="text.secondary">{item.name}</Typography>
                    <Typography variant="h4" sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{asset.assetCode}</Typography>
                    {asset.serialNumber && <Typography color="text.secondary">S/N {asset.serialNumber}</Typography>}
                </Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Chip label={formatStatus(asset.availabilityStatus)} color={stateColors[asset.availabilityStatus] ?? 'default'} />
                    <Button variant="contained" color="error" startIcon={<ReportProblemOutlinedIcon />} onClick={() => setDamageOpen(true)}>
                        {t('Schaden melden', 'Report damage')}
                    </Button>
                </Stack>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 0.8fr) minmax(0, 1.7fr)' }, gap: 3 }}>
                <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>{t('Asset-Informationen', 'Asset information')}</Typography>
                    <Stack spacing={1.5} divider={<Divider flexItem />}>
                        <InfoRow label={t('Zustand', 'Condition')} value={formatStatus(asset.conditionStatus)} />
                        <InfoRow label={t('Hersteller / Modell', 'Manufacturer / model')} value={[asset.manufacturer, asset.model].filter(Boolean).join(' ') || '—'} />
                        <InfoRow label={t('Betriebsstunden', 'Operating hours')} value={asset.operatingHours == null ? '—' : `${asset.operatingHours} h`} />
                        <InfoRow icon={<PlaceOutlinedIcon fontSize="small" />} label={t('Aktueller Ort', 'Current location')} value={asset.currentLocationName || '—'} />
                        <InfoRow icon={<PersonOutlineIcon fontSize="small" />} label={t('Aktueller Besitzer', 'Current custodian')} value={asset.currentCustodianName || '—'} />
                        <InfoRow label={t('Notizen', 'Notes')} value={asset.notes || '—'} />
                        <InfoRow label={t('Registriert', 'Registered')} value={new Date(asset.createdAt).toLocaleString()} />
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
                                    <Typography variant="caption" color="text.secondary">{new Date(entry.timestamp).toLocaleString()}</Typography>
                                    {entry.detail && <Typography variant="body2" sx={{ mt: 0.5 }}>{entry.detail}</Typography>}
                                </Box>
                            ))}
                        </Stack>
                    )}
                </Paper>
            </Box>

            <Dialog open={damageOpen} onClose={closeDamageDialog} maxWidth="sm" fullWidth fullScreen={isMobile}>
                <DialogTitle>{t(`Schaden an ${asset.assetCode} melden`, `Report damage to ${asset.assetCode}`)}</DialogTitle>
                <DialogContent sx={{ pt: '24px !important' }}>
                    <DamageReportForm
                        key={asset.id}
                        items={[item]}
                        preselectedItemId={item.id}
                        preselectedAssetId={asset.id}
                        preselectedAsset={asset}
                        onSubmit={submitDamage}
                        isLoading={createDamage.isPending}
                        maxAmount={1}
                    />
                </DialogContent>
            </Dialog>
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
