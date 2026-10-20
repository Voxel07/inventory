import { formatMoney } from '../utils/money';
import { useEquipmentProfile } from '../hooks/useEquipment';
import { LotsPanel } from '../components/operations/StockOperations';
import { ItemStockLocations } from '../components/items/ItemStockLocations';
import { Dialog } from '../components/shared/ClosableDialog';
import { FormDialog } from '../components/shared/FormDialog';
import { DetailPanel, Field, FieldGrid, Metric, MetricList } from '../components/items/CompactDetail';
import { EquipmentOwnership } from '../components/items/EquipmentOwnership';
import { InventorySharing } from '../components/items/InventorySharing';
import { ActionBar } from '../components/shared/ActionBar';
import { Button, IconButton } from '../components/shared/ActionButtons';
import { MediaImage } from '../components/common/MediaImage';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
    Box,
    Typography,
    Paper,
    Chip,
    Link,
    DialogTitle,
    DialogContent,
    Skeleton,
    Alert,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    useTheme,
    useMediaQuery,
} from '@mui/material';
import { StateMessage } from '../components/common/StateMessage';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as ChartTooltip,
} from 'recharts';
import { useItem, useUpdateItem, useItemCategories } from '../hooks/useItems';
import { locationLabel } from '../utils/locationHierarchy';
import { useTransactions, useCreateTransaction } from '../hooks/useTransactions';
import { getItemStock } from '../utils/stock';
import { buildStockHistory } from '../utils/stockHistory';
import { formatStatus } from '../utils/formatters';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { useUIStore } from '../store/uiStore';
import { ItemForm } from '../components/forms/ItemForm';
import { TransactionForm } from '../components/forms/TransactionForm';
import { QrLabelDialog } from '../components/qr/QrLabelDialog';
import { AssetInstancesList } from '../components/items/AssetInstancesList';
import { ItemDamageReports } from '../components/items/ItemDamageReports';
import type { ItemFormData, TransactionFormData } from '../types';
import { useT } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canEditCatalog, canOperateWarehouse, canPerformCustody, canTakeOut } from '../utils/access';
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

/** Desktop controls are compact; phones keep the product's 44 px touch target. */
const compactButton = { minHeight: { xs: 44, sm: 30 }, py: { sm: 0.25 }, fontSize: '0.8125rem' } as const;
const tinyChip = { height: 20, fontSize: '0.75rem' } as const;
const denseTable = { '& .MuiTableCell-root': { py: 0.25, px: 1, fontSize: '0.8125rem' } } as const;

export function ItemDetail() {
    const { user } = useAuth();


    const canReportDamage = canPerformCustody(user);
    const t = useT();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const { itemId } = useParams<{ itemId: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { data: item, isLoading, error: itemError, refetch: refetchItem } = useItem(itemId ?? '');
    const equipment = useEquipmentProfile(itemId ?? '');
    const canEdit = item?.access?.privateResource ? item.access.canEdit : canEditCatalog(user);
    const canTransact = item?.access?.privateResource ? item.access.canEdit : canOperateWarehouse(user);
    const canCheckout = canTakeOut(user) && (!item?.access?.privateResource || item.access.canEdit || item.access.publicUse);
    const { data: itemTransactionsData } = useTransactions({ itemId: itemId ?? undefined });
    const updateItem = useUpdateItem();
    const createTransaction = useCreateTransaction();
    const createReturn = useCreateReturnSubmission();
    const { data: storageLocations } = useStorageLocations();
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

    const checkoutRequest = `${itemId}:${searchParams.get('transaction')}:${canTransact || canCheckout}`;
    // "Add stock" from a lot opens the booking form with that lot preselected.
    const [lotRequest, setLotRequest] = useState<string | undefined>();
    const [handledCheckoutRequest, setHandledCheckoutRequest] = useState('');
    if (handledCheckoutRequest !== checkoutRequest) {
        setHandledCheckoutRequest(checkoutRequest);
        if ((canTransact || canCheckout) && searchParams.get('transaction') === '1') {
            setLotRequest(searchParams.get('lotId') ?? undefined);
            setCheckoutOpen(true);
        }
    }

    useEffect(() => {
        if (searchParams.get('transaction') !== '1') return;
        const next = new URLSearchParams(searchParams);
        next.delete('transaction');
        next.delete('lotId');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams, canTransact]);

    const itemTransactions = itemTransactionsData ?? [];

    const { data: categories = [] } = useItemCategories();

    const { totalStock, checkedOut, inTransit, damaged, remaining } = getItemStock(item);

    const stockHistory = buildStockHistory(itemTransactions, item?.stock?.onHand ?? 0);
    const historyDates = new Map(stockHistory.map((point) => [point.id, point.date]));

    function handleUpdate(data: ItemFormData) {
        if (!itemId) return;
        updateItem.mutate(
            { id: itemId, data },
            {
                onSuccess: () => {
                    setEditOpen(false);
                    showSnackbar(t('pages.itemDetail.itemUpdatedSuccessfully'), 'success');
                },
                onError: () => showSnackbar(t('pages.itemDetail.couldNotUpdateItem'), 'error'),
            },
        );
    }

    function handleTransaction(data: TransactionFormData) {
        if (data.transactionType === 'checkin') {
            // The form names the exact custody source; the return submission is checked against it.
            createReturn.mutate(
                { itemId: data.itemId, quantity: data.quantityChanged, assetInstanceId: data.assetInstanceId, returnedForUserId: data.userId, orderId: data.orderId, eventOccurrenceId: data.eventOccurrenceId, notes: data.notes },
                {
                    onSuccess: () => {
                        setCheckoutOpen(false);
                        showSnackbar(t('pages.itemDetail.returnIsAwaitingAcknowledgement'), 'success');
                    },
                    onError: (error) => {
                        if (isOfflineQueuedError(error)) return;
                        showSnackbar(t('pages.itemDetail.couldNotSubmitReturn'), 'error');
                    },
                },
            );
            return;
        }
        createTransaction.mutate(data, {
            onSuccess: () => {
                setCheckoutOpen(false);
                showSnackbar(t('pages.itemDetail.transactionCompleted'), 'success');
            },
            onError: (error) => {
                if (isOfflineQueuedError(error)) return;
                showSnackbar(t('pages.itemDetail.transactionFailed'), 'error');
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

    if (itemError) return <Box>
        <Typography variant="h4" component="h1" sx={{ mb: 2 }}>{t('common.item')}</Typography>
        <StateMessage kind="error" title={t('pages.itemDetail.couldNotLoadThisItem')}
            description={t('common.checkYourConnectionAndTryAgain')}
            action={<><Button variant="contained" onClick={() => void refetchItem()}>{t('common.tryAgain')}</Button>
                <Button onClick={() => navigate('/items')}>{t('pages.itemDetail.goToItems')}</Button></>} />
    </Box>;

    if (!item) {
        return (
            <Box>
                <Typography variant="h4" component="h1" sx={{ mb: 2 }}>{t('pages.itemDetail.itemNotFound')}</Typography>
                <StateMessage kind="no-matches" title={t('pages.itemDetail.thisItemDoesNotExistAnyMore')}
                    description={t('pages.itemDetail.itMayHaveBeenDeletedOrYouMayNotHave')}
                    action={<Button variant="contained" startIcon={<ArrowBackIcon />} onClick={() => navigate('/items')}>{t('pages.itemDetail.goToItems')}</Button>} />
            </Box>
        );
    }

    const physicalTotal = item.stock ? item.stock.onHand + item.stock.checkedOut + item.stock.inTransit : totalStock;
    const totalValue = (item.value ?? 0) * physicalTotal;
    const ownershipLabels = { organization: t('enum.value.organization'), private_owner: t('pages.itemDetail.private'), external: t('enum.value.external') };
    const policyLabels = { available: t('enum.itemStatus.available'), commitment_required: t('enum.value.commitment_required'), unavailable: t('enum.value.unavailable') };
    const availability = remaining <= 0 ? 'none' : remaining <= (item.minStock ?? 0) ? 'low' : 'ok';
    const availabilityColor = { none: 'error.main', low: 'warning.main', ok: 'success.main' }[availability];
    const location = item.expand?.storageLocation;
    const profile = equipment.data;
    const sortedTransactions = [...itemTransactions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const userName = (tx: typeof itemTransactions[number]) => tx.expand?.userId?.name?.trim() || tx.expand?.userId?.username?.trim() || tx.userId || '—';
    const assetLabel = (tx: typeof itemTransactions[number]) => tx.expand?.assetInstanceId
        ? [tx.expand.assetInstanceId.assetCode, tx.expand.assetInstanceId.serialNumber && `SN ${tx.expand.assetInstanceId.serialNumber}`].filter(Boolean).join(' · ')
        : '';
    const txColor = (type: string) => type === 'checkout' ? 'warning' : type === 'added' ? 'info' : 'success';

    const historyChart = stockHistory.length <= 1 && itemTransactions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{t('pages.itemDetail.noTransactionHistoryYet')}</Typography>
    ) : (
        <Box role="img" aria-label={t('pages.itemDetail.chartOfStockOverTime')}>
            <ResponsiveContainer width="100%" height={180}>
                <LineChart data={stockHistory} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                    <XAxis dataKey="id" tickFormatter={(id: string) => historyDates.get(id) ?? ''} stroke={theme.palette.text.secondary} fontSize={11} />
                    <YAxis stroke={theme.palette.text.secondary} fontSize={11} allowDecimals={false} />
                    <ChartTooltip
                        isAnimationActive={false}
                        labelFormatter={(id) => historyDates.get(String(id)) ?? ''}
                        contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 }}
                        labelStyle={{ color: theme.palette.text.primary, fontWeight: 600 }}
                        itemStyle={{ color: theme.palette.primary.main }}
                    />
                    <Line type="monotone" dataKey="stock" name={t('common.stock')} stroke={theme.palette.primary.main} strokeWidth={2}
                        dot={{ fill: theme.palette.primary.main, r: 2 }} activeDot={{ r: 4, fill: theme.palette.primary.main }} />
                </LineChart>
            </ResponsiveContainer>
        </Box>
    );

    const transactionList = itemTransactions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{t('pages.itemDetail.noTransactionsYet')}</Typography>
    ) : isMobile ? (
        <Stack component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {sortedTransactions.map((tx) => (
                <Box component="li" key={tx.id} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Chip label={formatStatus(tx.transactionType)} color={txColor(tx.transactionType)} size="small" variant="outlined" sx={tinyChip} />
                        <Typography variant="body2" className="tabular" sx={{ fontWeight: 600 }}>
                            {tx.quantityChanged > 0 && tx.transactionType === 'added' ? `+${tx.quantityChanged}` : tx.quantityChanged}
                        </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        {formatDateTime(tx.timestamp)} · {userName(tx)}
                    </Typography>
                    {assetLabel(tx) && <Typography variant="body2" className="mono">{assetLabel(tx)}</Typography>}
                    {(tx.reason || tx.notes) && <Typography variant="body2">{[tx.reason, tx.notes].filter(Boolean).join(' — ')}</Typography>}
                </Box>
            ))}
        </Stack>
    ) : (
        <TableContainer sx={{ maxHeight: 360 }}>
            <Table size="small" stickyHeader aria-label={t('pages.itemDetail.transactions')} sx={denseTable}>
                <TableHead>
                    <TableRow>
                        <TableCell>{t('common.date')}</TableCell>
                        <TableCell>{t('common.type')}</TableCell>
                        <TableCell>{t('common.user')}</TableCell>
                        <TableCell align="right">{t('common.quantity')}</TableCell>
                        <TableCell>{t('common.reason')}</TableCell>
                        <TableCell>{t('common.notes')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {sortedTransactions.map((tx) => (
                        <TableRow key={tx.id} hover>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(tx.timestamp)}</TableCell>
                            <TableCell>
                                <Chip label={formatStatus(tx.transactionType)} color={txColor(tx.transactionType)} size="small" variant="outlined" sx={tinyChip} />
                            </TableCell>
                            <TableCell>{userName(tx)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>{tx.quantityChanged}</TableCell>
                            <TableCell>
                                {tx.reason || '—'}
                                {assetLabel(tx) && <Box component="span" className="mono" sx={{ display: 'block', color: 'text.secondary' }}>{assetLabel(tx)}</Box>}
                            </TableCell>
                            <TableCell>{tx.notes || '—'}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );

    return (
        <Box>
            <Button variant="text" size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate('/items')} sx={{ ...compactButton, mb: 0.5, ml: -1 }}>
                {t('nav.items')}
            </Button>

            {/* What it is, whether it is available, where to find it, and what to do next. */}
            <Paper sx={{ p: 1.5, mb: 1.5 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.5 }}>
                    {!!item.images?.length && (
                        <MediaImage src={itemImageUrl(item, item.images[0], '120x120')} alt={item.name} sx={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 1, border: 1, borderColor: 'divider', flexShrink: 0 }} />
                    )}
                    <Box sx={{ flex: '1 1 280px', minWidth: 0 }}>
                        <Stack direction="row" useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
                            <Typography variant="h5" component="h1" sx={{ overflowWrap: 'anywhere', mr: 0.25 }}>{item.name}</Typography>
                            <Chip label={formatStatus(item.status)} color={statusColors[item.status] ?? 'default'} size="small" variant="outlined" sx={tinyChip} />
                            {profile && <Chip size="small" variant="outlined" sx={tinyChip} color={profile.availabilityPolicy === 'available' ? 'default' : 'warning'} label={`${ownershipLabels[profile.ownershipType]} · ${policyLabels[profile.availabilityPolicy]}`} />}
                        </Stack>
                    </Box>
                    <ActionBar size="small" buttonSx={compactButton} sx={{ flex: '1 0 auto' }} actions={[
                        (canTransact || canCheckout) && { key: 'checkout', label: canTransact ? t('pages.itemDetail.checkOutReturn') : t('pages.itemDetail.checkOut'), icon: <SwapHorizIcon />,
                            variant: 'contained', pinned: true, onClick: () => { setLotRequest(undefined); setCheckoutOpen(true); } },
                        canEdit && { key: 'edit', label: t('common.edit'), icon: <EditIcon />, variant: canTransact ? 'outlined' : 'contained', pinned: !canTransact && !canCheckout, onClick: () => setEditOpen(true) },
                        { key: 'label', label: t('pages.itemDetail.printLabel'), icon: <QrCode2Icon />, onClick: () => setQrOpen(true) },
                    ]} />
                </Box>
                {item.hint && <Alert severity="info" icon={false} sx={{ mt: 1, py: 0, px: 1.5, '& .MuiAlert-message': { py: 0.5 } }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.8125rem' }}>
                        <Box component="span" sx={{ fontWeight: 600 }}></Box>{item.hint}
                    </Typography>
                </Alert>}
                {item.locationRestricted && <Alert severity="info" sx={{ mt: 1, py: 0 }}>{t('pages.itemDetail.thePrivateStorageLocationIsNotSharedWithYouAsk')}</Alert>}
            </Paper>

            <Stack spacing={1.5}>
                <DetailPanel title={t('common.stock')}>
                    <MetricList minWidth={170}>
                        <Metric label={t('enum.itemStatus.available')} color={availabilityColor}>{remaining}</Metric>
                        <Metric label={t('pages.itemDetail.total')}>{physicalTotal}</Metric>
                        <Metric label={t('nav.checkedOut')}>{checkedOut}</Metric>
                        <Metric label={t('pages.itemDetail.inTransit')}>{inTransit}</Metric>
                        <Metric label={t('pages.itemDetail.damaged')} color={damaged > 0 ? 'error.main' : undefined}>{damaged}</Metric>
                        <Metric label={t('enum.value.ordered')}>{item.stock?.ordered ?? 0}</Metric>
                        <Metric label={t('pages.itemDetail.minimumStock')}>{item.minStock ?? 0}</Metric>
                        <Metric label={t('pages.itemDetail.unitValue')}>{formatMoney(item.value ?? 0)}</Metric>
                        <Metric label={t('pages.itemDetail.totalValue')}>{formatMoney(totalValue)}</Metric>
                        {(item.containerSize ?? 0) > 0 && <>
                            <Metric label={t('pages.itemDetail.unitsPerContainer')}>{item.containerSize}</Metric>
                            <Metric label={t('pages.itemDetail.containers')}>{item.containerCount ?? 0}</Metric>
                            <Metric label={t('pages.itemDetail.openedContainer')}>{t('pages.itemDetail.itemsRemainingInOpenedBox', { count: item.containerRemainingCount ?? 0 })}</Metric>
                        </>}
                    </MetricList>
                    <ItemStockLocations key={item.id} item={item} />
                    {item.trackingMode === 'serialized' && (
                        <Box sx={{ mt: 1.5 }}>
                            <Typography variant="subtitle2" sx={{ mb: 0.5, fontSize: '0.8125rem' }}>{t('pages.itemDetail.units')}</Typography>
                            <AssetInstancesList item={item} canEdit={canEdit} canReportDamage={canReportDamage} />
                        </Box>
                    )}
                    {item.trackingMode === 'lot_tracked' && (
                        <Box sx={{ mt: 1.5 }}>
                            <Typography variant="subtitle2" sx={{ mb: 0.5, fontSize: '0.8125rem' }}>{t('pages.itemDetail.lots')}</Typography>
                            <LotsPanel itemId={item.id} canEdit={canEdit} />
                        </Box>
                    )}
                </DetailPanel>

                <ItemDamageReports item={item} />

            <Box sx={{ display: 'grid', gap: 1.5, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 3fr) minmax(0, 2fr)' } }}>
                <DetailPanel title={t('common.overview')}>
                    <FieldGrid>
                        <Field label={t('common.category')}>{[item.category, item.subcategory].filter(Boolean).join(' · ') || '—'}</Field>
                        <Field label={t('common.storageLocation')}>{item.storageLocation ? <Link component={RouterLink} to={`/storage-locations?locationId=${encodeURIComponent(item.storageLocation)}`} underline="hover">{location ? locationLabel(location) : item.storageLocation}</Link> : '—'}</Field>
                        <Field label={t('forms.itemForm.positionInLocation')}>{item.positionDetails || '—'}</Field>
                        <Field label={t('common.returnLocation')}>{locationLabel(item.expand?.returnLocation ?? (!item.returnLocation || item.returnLocation === item.storageLocation ? location : undefined)) || '—'}</Field>
                        <Field label={t('pages.itemDetail.ownerProvider')}>{profile ? (profile.ownerName || (profile.ownershipType === 'organization' ? ownershipLabels.organization : '—')) : '—'}</Field>
                        <Field label={t('pages.itemDetail.keeperContact')}>{[profile?.keeperName, profile?.keeperContact].filter(Boolean).join(' · ') || '—'}</Field>
                        <Field label={item.access?.privateResource ? t('pages.itemDetail.privatelyOwned') : t('pages.itemDetail.organizationOwned')}>{item.stock?.totalOwned ?? 0}</Field>
                        <Field label={t('pages.itemDetail.trackingMode')}>{formatStatus(item.trackingMode ?? 'bulk')}</Field>
                        {item.tracksRuntime && <Field label={t('enum.value.operating_hours')}>{t('forms.itemForm.recordOperatingHoursOnReturn')}</Field>}
                        {item.supplier && <Field label={t('common.supplier')}>{item.supplier}</Field>}
                        <Field label={t('common.visibility')}>{item.access?.privateResource ? t('pages.itemDetail.private') : t('enum.value.organization')}</Field>
                        <Field label={t('pages.itemDetail.created')}>{formatDate(item.created)}</Field>
                        {isVehicle && <Field label={t('pages.itemDetail.fuelConsumption')}>{item.fuelConsumptionLitersPer100Km == null ? '—' : `${item.fuelConsumptionLitersPer100Km} l/100 km`}</Field>}
                        {isVehicle && <Field label={t('pages.itemDetail.batteryReplacementDue')}>{item.batteryReplacementDue ? formatDate(item.batteryReplacementDue) : '—'}</Field>}
                        {/* Serialized units carry their own meters (see each unit's runtime log). */}
                        {isGenerator && item.trackingMode !== 'serialized' && <Field label={t('pages.itemDetail.runningHours')}>{item.currentOperatingHours ?? 0}</Field>}
                        {isGenerator && <Field label={t('pages.itemDetail.nextMaintenance')}>{item.nextMaintenanceDue ? formatDate(item.nextMaintenanceDue) : '—'}</Field>}
                        {isFood && <Field label={t('pages.itemDetail.bestBeforeDate')}>{item.bestBeforeDate ? formatDate(item.bestBeforeDate) : '—'}</Field>}
                        <Field label={t('pages.itemDetail.itemID')}><span className="mono">{item.id}</span></Field>
                        <Field wide label={t('pages.itemDetail.approvedEventUse')}>
                            <Stack direction="row" useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                                {item.eventTypes?.length
                                    ? item.eventTypes.map(event => <Chip key={event} size="small" variant="outlined" sx={tinyChip} label={event === 'LS' ? 'LightSim' : event} />)
                                    : <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>— {t('pages.itemDetail.none')}</Box>}
                                <Tooltip arrow enterTouchDelay={0} title={t('pages.itemDetail.eventAssignmentsDescribeIntendedUseAvailabilityAndRequiredCommitmentsAre')}>
                                    <IconButton size="small" sx={{ p: 0.25 }} aria-label={t('pages.itemDetail.aboutEventUse')}><InfoOutlinedIcon sx={{ fontSize: 16 }} /></IconButton>
                                </Tooltip>
                            </Stack>
                        </Field>
                        {item.description && <Field wide label={t('common.description')}><Box component="span" sx={{ whiteSpace: 'pre-wrap', fontWeight: 400 }}>{item.description}</Box></Field>}
                    </FieldGrid>
                </DetailPanel>

                <Stack spacing={1.5}>
                    <DetailPanel title={t('pages.itemDetail.ownershipKeeper')}>
                        <EquipmentOwnership item={item} canEdit={canEdit} embedded showSummary={false} />
                    </DetailPanel>
                    <InventorySharing kind="items" id={item.id} access={item.access} />
                </Stack>
            </Box>

                <DetailPanel title={`${t('common.history')} (${itemTransactions.length})`}>
                    <Stack spacing={1.5}>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 0.5, fontSize: '0.8125rem' }}>{t('pages.itemDetail.stockHistory')}</Typography>
                            {historyChart}
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 0.5, fontSize: '0.8125rem' }}>{t('pages.itemDetail.transactions')}</Typography>
                            {transactionList}
                        </Box>
                    </Stack>
                    {isGenerator && <>
                        <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5, fontSize: '0.8125rem' }}>{t('pages.itemDetail.maintenanceLog')}</Typography>
                        {maintenanceRecords.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">{t('pages.itemDetail.noMaintenanceRecordsYet')}</Typography>
                        ) : (
                            <Stack>
                                {maintenanceRecords.map((record) => (
                                    <Box key={record.id} sx={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider', py: 0.5 }}>
                                        <Typography variant="body2">{formatDate(record.performedAt)} · {formatStatus(record.type)}</Typography>
                                        <Chip size="small" variant="outlined" sx={tinyChip} label={formatStatus(record.result)} color={record.result === 'passed' ? 'success' : record.result === 'failed' ? 'error' : 'warning'} />
                                    </Box>
                                ))}
                            </Stack>
                        )}
                    </>}
                </DetailPanel>

                {!!item.images?.length && (
                    <DetailPanel title={`${t('pages.itemDetail.images')} (${item.images.length})`}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1 }}>
                            {item.images.map((filename) => (
                                <MediaImage key={filename} src={itemImageUrl(item, filename, '900x600')} alt={item.name} sx={{ width: '100%', height: 160, objectFit: 'contain', borderRadius: 1, border: 1, borderColor: 'divider' }} />
                            ))}
                        </Box>
                    </DetailPanel>
                )}
            </Stack>

            <FormDialog open={editOpen} onClose={() => setEditOpen(false)}>
                <ItemForm
                    title={t('pages.itemDetail.editItem')}
                    onCancel={() => setEditOpen(false)}
                    initialData={item}
                    onSubmit={handleUpdate}
                    isLoading={updateItem.isPending}
                    storageLocations={storageLocations ?? []}
                    categories={categories}
                />
            </FormDialog>

            <QrLabelDialog label={qrOpen ? { title: t('pages.itemDetail.label'), itemId: item.id, itemName: item.name } : null}
                onClose={() => setQrOpen(false)} />

            <Dialog
                open={checkoutOpen}
                fullScreen={isMobile}
                onClose={() => { setCheckoutOpen(false); setLotRequest(undefined); }}
                keepMounted
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{canTransact ? t('pages.itemDetail.checkOutReturn') : t('pages.itemDetail.checkOut')}</DialogTitle>
                <DialogContent dividers>
                    <TransactionForm
                        items={[item]}
                        preselectedItemId={item.id}
                        initialData={lotRequest ? { itemId: item.id, transactionType: 'added', quantityChanged: 1, reason: '', notes: '', lotId: lotRequest } : undefined}
                        onSubmit={handleTransaction}
                        isLoading={createTransaction.isPending || createReturn.isPending}
                    />
                </DialogContent>
            </Dialog>
        </Box>
    );
}
