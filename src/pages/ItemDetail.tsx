import { ItemOverview } from '../components/items/ItemOverview';
import { useEquipmentProfile } from '../hooks/useEquipment';
import { LotsPanel } from '../components/operations/StockOperations';
import { ItemStockLocations } from '../components/items/ItemStockLocations';
import { Dialog } from '../components/shared/ClosableDialog';
import { MediaImage } from '../components/common/MediaImage';
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
    Box,
    Typography,
    Paper,
    Grid,
    Chip,
    DialogTitle,
    DialogContent,
    Skeleton,
    Alert,
    Stack,
    Card,
    CardContent,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    useTheme,
    useMediaQuery,
} from '@mui/material';
import { TooltipButton } from '../components/shared/TooltipButton';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts';
import { useItem, useUpdateItem } from '../hooks/useItems';
import { useTransactions, useCreateTransaction } from '../hooks/useTransactions';
import { useFactionOrders } from '../hooks/useFactionOrders';
import { getItemStock } from '../utils/stock';
import { buildStockHistory } from '../utils/stockHistory';
import { formatStatus } from '../utils/formatters';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { useAssignableUsers } from '../hooks/useUsers';
import { useUIStore } from '../store/uiStore';
import { ItemForm } from '../components/forms/ItemForm';
import { TransactionForm } from '../components/forms/TransactionForm';
import { QRCodeGenerator } from '../components/qr/QRCodeGenerator';
import { AssetInstancesList } from '../components/items/AssetInstancesList';
import type { ItemFormData, TransactionFormData } from '../types';
import { useLocalizedText } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canEditCatalog, canOperateWarehouse, canPerformCustody } from '../utils/access';
import { isOfflineQueuedError } from '../utils/offline';
import { itemImageUrl } from '../utils/itemImages';
import { useCreateReturnSubmission } from '../hooks/useReturnSubmissions';
import { useQuery } from '@tanstack/react-query';
import { getMaintenanceRecords } from '../services/maintenanceService';

const statusColors: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    available: 'success',
    checked_out: 'warning',
    damaged: 'error',
    retired: 'default',
};

export function ItemDetail() {
    const { user } = useAuth();


    const canReportDamage = canPerformCustody(user);
    const t = useLocalizedText();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const { itemId } = useParams<{ itemId: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { data: item, isLoading, error: itemError, refetch: refetchItem } = useItem(itemId ?? '');
    const equipment = useEquipmentProfile(itemId ?? '');
    const canEdit = item?.access?.privateResource ? item.access.canEdit : canEditCatalog(user);
    const canTransact = item?.access?.privateResource ? item.access.canEdit : canOperateWarehouse(user);
    const { data: itemTransactionsData } = useTransactions({ itemId: itemId ?? undefined });
    const updateItem = useUpdateItem();
    const createTransaction = useCreateTransaction();
    const { data: factionOrders = [] } = useFactionOrders();
    const createReturn = useCreateReturnSubmission();
    const { data: storageLocations } = useStorageLocations();
    const { data: assignableUsers } = useAssignableUsers(canEditCatalog(user));
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    const [editOpen, setEditOpen] = useState(false);
    const [qrOpen, setQrOpen] = useState(false);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const normalizedCategory = item?.category.trim().toLocaleLowerCase() ?? '';
    const isVehicle = ['vehicle', 'vehicles', 'fahrzeug', 'fahrzeuge'].some((value) => normalizedCategory.includes(value));
    const isGenerator = ['generator', 'stromerzeuger', 'aggregat'].some((value) => normalizedCategory.includes(value));
    const isFood = ['food', 'lebensmittel', 'verpflegung'].some((value) => normalizedCategory.includes(value));
    const { data: maintenanceRecords = [] } = useQuery({
        queryKey: ['maintenance', itemId],
        queryFn: () => getMaintenanceRecords(itemId),
        enabled: Boolean(itemId && isGenerator),
    });

    const checkoutRequest = `${itemId}:${searchParams.get('transaction')}:${canTransact}`;
    const [handledCheckoutRequest, setHandledCheckoutRequest] = useState('');
    if (handledCheckoutRequest !== checkoutRequest) {
        setHandledCheckoutRequest(checkoutRequest);
        if (canTransact && searchParams.get('transaction') === '1') setCheckoutOpen(true);
    }

    useEffect(() => {
        if (searchParams.get('transaction') !== '1') return;
        const next = new URLSearchParams(searchParams);
        next.delete('transaction');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams, canTransact]);

    const itemTransactions = itemTransactionsData ?? [];

    const categories = item?.category ? [item.category] : [];

    const { totalStock, checkedOut, inTransit, damaged, remaining } = getItemStock(item);

    const stockHistory = buildStockHistory(itemTransactions, item?.stock?.onHand ?? item?.amount ?? 0);

    function handleUpdate(data: ItemFormData) {
        if (!itemId) return;
        updateItem.mutate(
            { id: itemId, data },
            {
                onSuccess: () => {
                    setEditOpen(false);
                    showSnackbar(t('Artikel erfolgreich aktualisiert', 'Item updated successfully'), 'success');
                },
                onError: () => showSnackbar(t('Fehler beim Aktualisieren des Artikels', 'Could not update item'), 'error'),
            },
        );
    }

    function handleTransaction(data: TransactionFormData) {
        if (data.transactionType === 'checkin' && data.factionOrderId) {
            createReturn.mutate(
                { itemId: data.itemId, quantity: data.quantityChanged, assetInstanceId: data.assetInstanceId, returnedForUserId: data.userId, factionOrderId: data.factionOrderId, eventOccurrenceId: data.eventOccurrenceId, notes: data.notes },
                {
                    onSuccess: () => {
                        setCheckoutOpen(false);
                        showSnackbar(t('Rückgabe wartet auf Bestätigung', 'Return is awaiting acknowledgement'), 'success');
                    },
                    onError: (error) => {
                        if (isOfflineQueuedError(error)) return;
                        showSnackbar(t('Bestellrückgabe fehlgeschlagen', 'Order return failed'), 'error');
                    },
                },
            );
            return;
        }
        if (data.transactionType === 'checkin') {
            createReturn.mutate(
                { itemId: data.itemId, quantity: data.quantityChanged, assetInstanceId: data.assetInstanceId, returnedForUserId: data.userId, eventOccurrenceId: data.eventOccurrenceId, notes: data.notes },
                {
                    onSuccess: () => {
                        setCheckoutOpen(false);
                        showSnackbar(t('Rückgabe wartet auf Bestätigung', 'Return is awaiting acknowledgement'), 'success');
                    },
                    onError: () => showSnackbar(t('Rückgabe konnte nicht gemeldet werden', 'Could not submit return'), 'error'),
                },
            );
            return;
        }
        createTransaction.mutate(data, {
            onSuccess: () => {
                setCheckoutOpen(false);
                showSnackbar(t('Transaktion abgeschlossen', 'Transaction completed'), 'success');
            },
            onError: (error) => {
                if (isOfflineQueuedError(error)) return;
                showSnackbar(t('Transaktion fehlgeschlagen', 'Transaction failed'), 'error');
            },
        });
    }

    if (isLoading) {
        return (
            <Box>
                <Skeleton variant="text" width={300} height={48} />
                <Skeleton variant="rectangular" height={200} sx={{ mt: 2 }} />
            </Box>
        );
    }

    if (itemError) return <Alert severity="error" action={<TooltipButton variant="text" tooltipText={t('Artikel erneut laden', 'Reload item')} label={t('Erneut laden', 'Retry')} onClick={() => void refetchItem()} />}>{t('Artikel konnte nicht geladen werden.', 'Could not load item.')}</Alert>;

    if (!item) {
        return (
            <Box>
                <TooltipButton
                    tooltipText={t('Zurück zur Artikelübersicht', 'Back to items')}
                    icon={<ArrowBackIcon />}
                    label={t('Zurück zur Übersicht', 'Back to overview')}
                    variant="text"
                    onClick={() => navigate('/items')}
                />
                <Typography variant="h5" sx={{ mt: 2 }}>
                    {t('Artikel nicht gefunden', 'Item not found')}
                </Typography>
            </Box>
        );
    }

    const physicalTotal = item.stock ? item.stock.onHand + item.stock.checkedOut + item.stock.inTransit : totalStock;
    const totalValue = (item.value ?? 0) * physicalTotal;
    const ownershipLabels = { organization: t('Organisation', 'Organization'), private_owner: t('Privat', 'Private'), external: t('Extern', 'External') };
    const policyLabels = { available: t('Verfügbar', 'Available'), commitment_required: t('Zusage erforderlich', 'Commitment required'), unavailable: t('Nicht verfügbar', 'Unavailable') };
    const metrics = [
        { label: t('Gesamt', 'Total'), value: physicalTotal },
        { label: t('Verfügbar', 'Available'), value: remaining, color: 'success.main' },
        { label: t('Ausgeliehen', 'Checked out'), value: checkedOut, color: 'warning.main' },
        { label: t('Im Transfer', 'In transit'), value: inTransit },
        { label: t('Defekt', 'Damaged'), value: damaged, color: 'error.main' },
        { label: t('Mindestbestand', 'Minimum stock'), value: item.minStock ?? 5 },
        { label: t('Bestellt', 'Ordered'), value: item.stock?.ordered ?? 0 },
        { label: t('Einzelwert', 'Unit value'), value: `${(item.value ?? 0).toFixed(2)} €` },
        { label: t('Gesamtwert', 'Total value'), value: `${totalValue.toFixed(2)} €` },
    ];

    return (
        <Box>
            <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 1.5, borderRadius: 2 }}>
                <Stack direction="row" useFlexGap sx={{ display: { xs: 'grid', sm: 'flex' }, gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <TooltipButton variant="icon" tooltipText={t('Zurück zur Artikelübersicht', 'Back to items')} icon={<ArrowBackIcon />} onClick={() => navigate('/items')} />
                    <Box sx={{ flex: 1, minWidth: { xs: 0, sm: 180 }, gridColumn: { xs: '1 / -1', sm: 'auto' }, gridRow: { xs: 2, sm: 'auto' } }}>
                        <Stack direction="row" useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                            <Typography variant="h5" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{item.name}</Typography>
                            <Chip label={formatStatus(item.status)} color={statusColors[item.status] ?? 'default'} size="small" variant="outlined" />
                            {equipment.data && <Chip size="small" variant="outlined" color={equipment.data.availabilityPolicy === 'available' ? 'default' : 'warning'} label={`${ownershipLabels[equipment.data.ownershipType]} · ${policyLabels[equipment.data.availabilityPolicy]}`} />}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">{t('Erstellt', 'Created')} {new Date(item.created).toLocaleDateString()} · {t('Sichtbarkeit', 'Visibility')}: {item.access?.privateResource ? t('Privat', 'Private') : item.visibilityScope || 'global'}{item.assignedUserName ? ` · ${item.assignedUserName}` : ''}{item.assignedGroup ? ` · ${item.assignedGroup}` : ''}</Typography>
                    </Box>
                    <TooltipButton variant={isMobile ? 'icon' : 'outlined'} tooltipText={t('QR-Code generieren und anzeigen', 'Generate and display QR code')} icon={<QrCode2Icon />} label={isMobile ? undefined : t('Label drucken', 'Print label')} onClick={() => setQrOpen(true)} />
                    {canEdit && <TooltipButton variant={isMobile ? 'icon' : 'contained'} tooltipText={t('Artikeldetails bearbeiten', 'Edit item details')} icon={<EditIcon />} label={isMobile ? undefined : t('Bearbeiten', 'Edit')} onClick={() => setEditOpen(true)} />}
                </Stack>
            </Paper>
            <Paper variant="outlined" sx={{ p: 1, mb: 2, borderRadius: 2 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))', lg: 'repeat(9, minmax(0, 1fr))' }, gap: 1 }}>
                    {metrics.map(metric => <Box key={metric.label} sx={{ p: 1, textAlign: 'center', bgcolor: 'action.hover', borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary">{metric.label}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: metric.color ?? 'text.primary', mt: 0.5 }}>{metric.value}</Typography>
                    </Box>)}
                </Box>
            </Paper>
            <Grid container spacing={1.5}>
                <ItemOverview item={item} canEdit={canEdit} />
                <ItemStockLocations key={item.id} item={item} />

                {!!item.images?.length && (
                    <Grid size={12}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
                            {item.images.map((filename) => (
                                <MediaImage key={filename} src={itemImageUrl(item, filename, '900x600')} alt={item.name} sx={{ width: '100%', height: 220, objectFit: 'contain', borderRadius: 1, border: 1, borderColor: 'divider' }} />
                            ))}
                        </Box>
                    </Grid>
                )}
                {item.description && (
                    <Grid size={12}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" sx={{ mb: 0.75 }}>{t('Produktdetails', 'Product details')}</Typography>
                            <Typography sx={{ whiteSpace: 'pre-wrap' }}>{item.description}</Typography>
                        </Paper>
                    </Grid>
                )}

                {item.hint && <Grid size={{ xs: 12, md: 4 }}>
                    <Alert severity="info" sx={{ py: 1, alignItems: 'flex-start',
                        '& .MuiAlert-icon': { py: 0, mt: '3px' }, '& .MuiAlert-message': { py: 0 } }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{t('Besonderer Hinweis', 'Special instruction')}</Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{item.hint}</Typography>
                    </Alert>
                </Grid>}

                {(isVehicle || isGenerator || isFood) && (
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" sx={{ mb: 2 }}>{t('Kategoriespezifische Angaben', 'Category-specific details')}</Typography>
                            <Stack spacing={1.5}>
                                {isVehicle && (
                                    <>
                                        <Box><Typography variant="caption" color="text.secondary">{t('Kraftstoffverbrauch', 'Fuel consumption')}</Typography><Typography>{item.fuelConsumptionLitersPer100Km == null ? '—' : `${item.fuelConsumptionLitersPer100Km} l/100 km`}</Typography></Box>
                                        <Box><Typography variant="caption" color="text.secondary">{t('Batteriewechsel fällig', 'Battery replacement due')}</Typography><Typography>{item.batteryReplacementDue ? new Date(item.batteryReplacementDue).toLocaleDateString() : '—'}</Typography></Box>
                                    </>
                                )}
                                {isGenerator && (
                                    <>
                                        <Box><Typography variant="caption" color="text.secondary">{t('Betriebsstunden', 'Running hours')}</Typography><Typography>{item.currentOperatingHours ?? 0}</Typography></Box>
                                        <Box><Typography variant="caption" color="text.secondary">{t('Nächste Wartung', 'Next maintenance')}</Typography><Typography>{item.nextMaintenanceDue ? new Date(item.nextMaintenanceDue).toLocaleDateString() : '—'}</Typography></Box>
                                    </>
                                )}
                                {isFood && <Box><Typography variant="caption" color="text.secondary">{t('Mindestens haltbar bis', 'Best before date')}</Typography><Typography>{item.bestBeforeDate ? new Date(item.bestBeforeDate).toLocaleDateString() : '—'}</Typography></Box>}
                            </Stack>
                        </Paper>
                    </Grid>
                )}

                {isGenerator && (
                    <Grid size={12}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" sx={{ mb: 2 }}>{t('Wartungsprotokoll', 'Maintenance log')}</Typography>
                            {maintenanceRecords.length === 0 ? (
                                <Typography color="text.secondary">{t('Noch keine Wartungseinträge.', 'No maintenance records yet.')}</Typography>
                            ) : (
                                <Stack spacing={1}>
                                    {maintenanceRecords.map((record) => (
                                        <Box key={record.id} sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                                            <Typography>{new Date(record.performedAt).toLocaleDateString()} · {record.type.replaceAll('_', ' ')}</Typography>
                                            <Chip size="small" label={record.result} color={record.result === 'passed' ? 'success' : record.result === 'failed' ? 'error' : 'warning'} />
                                        </Box>
                                    ))}
                                </Stack>
                            )}
                        </Paper>
                    </Grid>
                )}

                {/* Container info */}
                {(item.containerSize ?? 0) > 0 && (
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                {t('Behälter-Details', 'Container details')}
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">{t('Einheiten / Behälter', 'Units / container')}</Typography>
                                    <Typography variant="body2">{item.containerSize}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">{t('Behälter', 'Containers')}</Typography>
                                    <Typography variant="body2">{item.containerCount ?? 0}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">{t('Geöffnet', 'Opened')}</Typography>
                                    <Typography variant="body2">{item.containersOpened ?? 0}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">{t('Geöffneter Behälter', 'Opened container')}</Typography>
                                    <Typography variant="body2">{item.containerRemainingPercent ?? 100}% verbleibend</Typography>
                                </Box>
                            </Box>
                        </Paper>
                    </Grid>
                )}

                {/* Serialized Item Drill-down & Asset Management */}
                {item.trackingMode === 'serialized' && (
                    <Grid size={12}>
                        <AssetInstancesList item={item} canEdit={canEdit} canReportDamage={canReportDamage} />
                    </Grid>
                )}

                {item.locationRestricted && <Grid size={12}><Alert severity="info">{t('Der private Lagerort wurde nicht für dich freigegeben. Bitte den Eigentümer um eine Lagerortfreigabe.', 'The private storage location is not shared with you. Ask its owner for location access.')}</Alert></Grid>}
                {canEdit && item.trackingMode === 'lot_tracked' && <Grid size={12}><Paper sx={{ p: 2 }}><LotsPanel itemId={item.id} /></Paper></Grid>}

                {/* Stock History Graph */}
                <Grid size={12}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            {t('Bestandsverlauf', 'Stock history')}
                        </Typography>
                        {stockHistory.length <= 1 && itemTransactions.length === 0 ? (
                            <Typography color="text.secondary">{t('Noch kein Transaktionsverlauf vorhanden.', 'No transaction history yet.')}</Typography>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={stockHistory}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                                    <XAxis dataKey="date" stroke="#aaa" fontSize={12} />
                                    <YAxis stroke="#aaa" fontSize={12} allowDecimals={false} />
                                    <Tooltip
                                        isAnimationActive={false}
                                        contentStyle={{
                                            backgroundColor: '#131920',
                                            border: '1px solid rgba(255, 255, 255, 0.08)',
                                            borderRadius: 8,
                                        }}
                                        labelStyle={{ color: '#fff', fontWeight: 600 }}
                                        itemStyle={{ color: '#90caf9' }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="stock"
                                        name={t('Bestand', 'Stock')}
                                        stroke="#90caf9"
                                        strokeWidth={2}
                                        dot={{ fill: '#90caf9', r: 4 }}
                                        activeDot={{ r: 6, fill: '#90caf9' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </Paper>
                </Grid>

                {/* Recent transactions for this item */}
                <Grid size={12}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            {t('Transaktionsverlauf', 'Transaction history')}
                        </Typography>
                        {itemTransactions.length === 0 ? (
                            <Typography color="text.secondary">{t('Noch keine Transaktionen vorhanden.', 'No transactions yet.')}</Typography>
                        ) : isMobile ? (
                            <Stack spacing={1.5}>
                                {[...itemTransactions]
                                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                                    .map((tx) => (
                                        <Card key={tx.id} variant="outlined">
                                            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                                        <Chip
                                                            label={formatStatus(tx.transactionType)}
                                                            color={tx.transactionType === 'checkout' ? 'warning' : tx.transactionType === 'added' ? 'info' : 'success'}
                                                            size="small"
                                                        />
                                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                            {tx.quantityChanged > 0 && tx.transactionType === 'added' ? `+${tx.quantityChanged}` : tx.quantityChanged}
                                                        </Typography>
                                                    </Stack>
                                                </Box>
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                    {new Date(tx.timestamp).toLocaleString()} · {tx.expand?.userId?.name?.trim() || tx.expand?.userId?.username?.trim() || tx.expand?.userId?.email?.trim() || tx.userId || '—'}
                                                </Typography>
                                                {tx.expand?.assetInstanceId && (
                                                    <Chip
                                                        size="small"
                                                        variant="outlined"
                                                        color="secondary"
                                                        label={[tx.expand.assetInstanceId.assetCode, tx.expand.assetInstanceId.serialNumber && `SN ${tx.expand.assetInstanceId.serialNumber}`].filter(Boolean).join(' · ')}
                                                        sx={{ mt: 0.75 }}
                                                    />
                                                )}
                                                {(tx.reason || tx.notes) && (
                                                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                                                        {[tx.reason, tx.notes].filter(Boolean).join(' — ')}
                                                    </Typography>
                                                )}
                                            </CardContent>
                                        </Card>
                                    ))}
                            </Stack>
                        ) : (
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>{t('Datum', 'Date')}</TableCell>
                                            <TableCell>{t('Typ', 'Type')}</TableCell>
                                            <TableCell>{t('Benutzer', 'User')}</TableCell>
                                            <TableCell align="right">{t('Menge', 'Quantity')}</TableCell>
                                            <TableCell>{t('Grund', 'Reason')}</TableCell>
                                            <TableCell>{t('Anmerkungen', 'Notes')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {[...itemTransactions]
                                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                                            .map((tx) => (
                                                <TableRow key={tx.id} hover>
                                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(tx.timestamp).toLocaleString()}</TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={formatStatus(tx.transactionType)}
                                                            color={tx.transactionType === 'checkout' ? 'warning' : tx.transactionType === 'added' ? 'info' : 'success'}
                                                            size="small"
                                                        />
                                                    </TableCell>
                                                    <TableCell>{tx.expand?.userId?.name?.trim() || tx.expand?.userId?.username?.trim() || tx.expand?.userId?.email?.trim() || tx.userId || '—'}</TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 600 }}>{tx.quantityChanged}</TableCell>
                                                    <TableCell>
                                                        {tx.reason || '—'}
                                                        {tx.expand?.assetInstanceId && (
                                                             <Chip
                                                                size="small"
                                                                variant="outlined"
                                                                color="secondary"
                                                                label={[tx.expand.assetInstanceId.assetCode, tx.expand.assetInstanceId.serialNumber && `SN ${tx.expand.assetInstanceId.serialNumber}`].filter(Boolean).join(' · ')}
                                                                sx={{ ml: 1 }}
                                                            />
                                                        )}
                                                    </TableCell>
                                                    <TableCell>{tx.notes || '—'}</TableCell>
                                                </TableRow>
                                            ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </Paper>
                </Grid>
            </Grid>

            {/* Edit Dialog */}
            <Dialog open={editOpen} fullScreen={isMobile} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{t('Artikel bearbeiten', 'Edit item')}</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    <ItemForm
                        initialData={item}
                        onSubmit={handleUpdate}
                        isLoading={updateItem.isPending}
                        storageLocations={storageLocations ?? []}
                        categories={categories}
                        assignableUsers={assignableUsers ?? []}
                    />
                </DialogContent>
            </Dialog>

            {/* QR Dialog */}
            <Dialog open={qrOpen} onClose={() => setQrOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>QR-Code</DialogTitle>
                <DialogContent>
                    <QRCodeGenerator itemId={item.id} itemName={item.name} />
                </DialogContent>
            </Dialog>


            {/* Checkout Dialog */}
            <Dialog
                open={checkoutOpen}
                fullScreen={isMobile}
                onClose={() => setCheckoutOpen(false)}
                keepMounted
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{t('Neue Transaktion', 'New transaction')}</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    <TransactionForm
                        items={[item]}
                        preselectedItemId={item.id}
                        orders={factionOrders}
                        onSubmit={handleTransaction}
                        isLoading={createTransaction.isPending || createReturn.isPending}
                    />
                </DialogContent>
            </Dialog>
        </Box>
    );
}
