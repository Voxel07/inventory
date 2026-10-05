import { formatMoney } from '../utils/money';
import { useEquipmentProfile } from '../hooks/useEquipment';
import { LotsPanel } from '../components/operations/StockOperations';
import { ItemStockLocations } from '../components/items/ItemStockLocations';
import { Dialog } from '../components/shared/ClosableDialog';
import { FormDialog } from '../components/shared/FormDialog';
import { DetailPanel, Field, FieldGrid, Metric, MetricList } from '../components/items/CompactDetail';
import { EquipmentOwnership } from '../components/items/EquipmentOwnership';
import { InventorySharing } from '../components/items/InventorySharing';
import { CodeManagement } from '../components/qr/CodeManagement';
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
import { useItem, useUpdateItem } from '../hooks/useItems';
import { useTransactions, useCreateTransaction } from '../hooks/useTransactions';
import { useFactionOrders } from '../hooks/useFactionOrders';
import { getItemStock } from '../utils/stock';
import { buildStockHistory } from '../utils/stockHistory';
import { formatStatus } from '../utils/formatters';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { useAssignableUsers } from '../hooks/useUsers';
import { useUIStore } from '../store/uiStore';
import { ItemForm } from '../components/forms/ItemForm';
import { TransactionForm } from '../components/forms/TransactionForm';
import { QrLabelDialog } from '../components/qr/QrLabelDialog';
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

/** Desktop controls are compact; phones keep the product's 44 px touch target. */
const compactButton = { minHeight: { xs: 44, sm: 30 }, py: { sm: 0.25 }, fontSize: '0.8125rem' } as const;
const tinyChip = { height: 20, fontSize: '0.75rem' } as const;
const denseTable = { '& .MuiTableCell-root': { py: 0.25, px: 1, fontSize: '0.8125rem' } } as const;

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

    if (itemError) return <Box>
        <Typography variant="h4" component="h1" sx={{ mb: 2 }}>{t('Artikel', 'Item')}</Typography>
        <StateMessage kind="error" title={t('Artikel konnte nicht geladen werden', 'Could not load this item')}
            description={t('Prüfe die Verbindung und versuche es erneut.', 'Check your connection and try again.')}
            action={<><Button variant="contained" onClick={() => void refetchItem()}>{t('Erneut versuchen', 'Try again')}</Button>
                <Button onClick={() => navigate('/items')}>{t('Zur Artikelliste', 'Go to items')}</Button></>} />
    </Box>;

    if (!item) {
        return (
            <Box>
                <Typography variant="h4" component="h1" sx={{ mb: 2 }}>{t('Artikel nicht gefunden', 'Item not found')}</Typography>
                <StateMessage kind="no-matches" title={t('Diesen Artikel gibt es nicht (mehr)', 'This item does not exist (any more)')}
                    description={t('Er wurde eventuell gelöscht oder du hast keinen Zugriff.', 'It may have been deleted, or you may not have access.')}
                    action={<Button variant="contained" startIcon={<ArrowBackIcon />} onClick={() => navigate('/items')}>{t('Zur Artikelliste', 'Go to items')}</Button>} />
            </Box>
        );
    }

    const physicalTotal = item.stock ? item.stock.onHand + item.stock.checkedOut + item.stock.inTransit : totalStock;
    const totalValue = (item.value ?? 0) * physicalTotal;
    const ownershipLabels = { organization: t('Organisation', 'Organization'), private_owner: t('Privat', 'Private'), external: t('Extern', 'External') };
    const policyLabels = { available: t('Verfügbar', 'Available'), commitment_required: t('Zusage erforderlich', 'Commitment required'), unavailable: t('Nicht verfügbar', 'Unavailable') };
    const availability = remaining <= 0 ? 'none' : remaining <= (item.minStock ?? 5) ? 'low' : 'ok';
    const availabilityColor = { none: 'error.main', low: 'warning.main', ok: 'success.main' }[availability];
    const availabilityText = remaining <= 0
        ? t(`Nicht verfügbar (0 von ${physicalTotal})`, `None available (0 of ${physicalTotal})`)
        : t(`${remaining} von ${physicalTotal} verfügbar`, `${remaining} of ${physicalTotal} available`) + (availability === 'low' ? ` · ${t('niedriger Bestand', 'low stock')}` : '');
    const secondaryStock = [
        checkedOut > 0 && t(`${checkedOut} ausgeliehen`, `${checkedOut} checked out`),
        inTransit > 0 && t(`${inTransit} im Transfer`, `${inTransit} in transit`),
        damaged > 0 && t(`${damaged} defekt`, `${damaged} damaged`),
    ].filter(Boolean).join(' · ');
    const location = item.expand?.storageLocation;
    const locationText = location ? [location.name, location.location, location.position].filter(Boolean).join(' / ') : '';
    const exactLocation = [location?.location, location?.position].filter(Boolean).join(' / ');
    const profile = equipment.data;
    const sortedTransactions = [...itemTransactions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const userName = (tx: typeof itemTransactions[number]) => tx.expand?.userId?.name?.trim() || tx.expand?.userId?.username?.trim() || tx.expand?.userId?.email?.trim() || tx.userId || '—';
    const assetLabel = (tx: typeof itemTransactions[number]) => tx.expand?.assetInstanceId
        ? [tx.expand.assetInstanceId.assetCode, tx.expand.assetInstanceId.serialNumber && `SN ${tx.expand.assetInstanceId.serialNumber}`].filter(Boolean).join(' · ')
        : '';
    const txColor = (type: string) => type === 'checkout' ? 'warning' : type === 'added' ? 'info' : 'success';

    const historyChart = stockHistory.length <= 1 && itemTransactions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{t('Noch kein Transaktionsverlauf vorhanden.', 'No transaction history yet.')}</Typography>
    ) : (
        <Box role="img" aria-label={t('Diagramm des Bestandsverlaufs', 'Chart of stock over time')}>
            <ResponsiveContainer width="100%" height={180}>
                <LineChart data={stockHistory} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                    <XAxis dataKey="date" stroke={theme.palette.text.secondary} fontSize={11} />
                    <YAxis stroke={theme.palette.text.secondary} fontSize={11} allowDecimals={false} />
                    <ChartTooltip
                        isAnimationActive={false}
                        contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 }}
                        labelStyle={{ color: theme.palette.text.primary, fontWeight: 600 }}
                        itemStyle={{ color: theme.palette.primary.main }}
                    />
                    <Line type="monotone" dataKey="stock" name={t('Bestand', 'Stock')} stroke={theme.palette.primary.main} strokeWidth={2}
                        dot={{ fill: theme.palette.primary.main, r: 2 }} activeDot={{ r: 4, fill: theme.palette.primary.main }} />
                </LineChart>
            </ResponsiveContainer>
        </Box>
    );

    const transactionList = itemTransactions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{t('Noch keine Transaktionen vorhanden.', 'No transactions yet.')}</Typography>
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
            <Table size="small" stickyHeader aria-label={t('Transaktionen', 'Transactions')} sx={denseTable}>
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
                {t('Artikel', 'Items')}
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
                        <Typography className="tabular" sx={{ fontSize: '0.8125rem', mt: 0.25 }}>
                            <Box component="span" sx={{ color: availabilityColor, fontWeight: 600 }}>{availabilityText}</Box>
                            {secondaryStock && <Box component="span" sx={{ color: 'text.secondary' }}> · {secondaryStock}</Box>}
                            <Box component="span" sx={{ color: 'text.secondary' }}> · {t('Lagerort', 'Location')}: </Box>
                            {item.storageLocation
                                ? <Link component={RouterLink} to={`/storage-locations?locationId=${encodeURIComponent(item.storageLocation)}`}>{locationText || item.storageLocation}</Link>
                                : t('Nicht zugewiesen', 'Not assigned')}
                        </Typography>
                    </Box>
                    <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap' }}>
                        {canTransact && <Button variant="contained" size="small" sx={compactButton} startIcon={<SwapHorizIcon />} onClick={() => setCheckoutOpen(true)}>{t('Ausgabe / Rückgabe', 'Check out / return')}</Button>}
                        {canEdit && <Button variant={canTransact ? 'outlined' : 'contained'} size="small" sx={compactButton} startIcon={<EditIcon />} onClick={() => setEditOpen(true)}>{t('Bearbeiten', 'Edit')}</Button>}
                        <Button variant="outlined" size="small" sx={compactButton} startIcon={<QrCode2Icon />} onClick={() => setQrOpen(true)}>{t('Etikett drucken', 'Print label')}</Button>
                    </Stack>
                </Box>
                {item.hint && <Alert severity="info" icon={false} sx={{ mt: 1, py: 0, px: 1.5, '& .MuiAlert-message': { py: 0.5 } }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.8125rem' }}>
                        <Box component="span" sx={{ fontWeight: 600 }}>{t('Besonderer Hinweis', 'Special instruction')}: </Box>{item.hint}
                    </Typography>
                </Alert>}
                {item.locationRestricted && <Alert severity="info" sx={{ mt: 1, py: 0 }}>{t('Der private Lagerort wurde nicht für dich freigegeben. Bitte den Eigentümer um eine Lagerortfreigabe.', 'The private storage location is not shared with you. Ask its owner for location access.')}</Alert>}
            </Paper>

            <Stack spacing={1.5}>
                <DetailPanel title={t('Bestand', 'Stock')}>
                    <MetricList minWidth={170}>
                        <Metric label={t('Verfügbar', 'Available')} color={availabilityColor}>{remaining}</Metric>
                        <Metric label={t('Gesamt', 'Total')}>{physicalTotal}</Metric>
                        <Metric label={t('Ausgeliehen', 'Checked out')}>{checkedOut}</Metric>
                        <Metric label={t('Im Transfer', 'In transit')}>{inTransit}</Metric>
                        <Metric label={t('Defekt', 'Damaged')} color={damaged > 0 ? 'error.main' : undefined}>{damaged}</Metric>
                        <Metric label={t('Bestellt', 'Ordered')}>{item.stock?.ordered ?? 0}</Metric>
                        <Metric label={t('Mindestbestand', 'Minimum stock')}>{item.minStock ?? 5}</Metric>
                        <Metric label={t('Einzelwert', 'Unit value')}>{formatMoney(item.value ?? 0)}</Metric>
                        <Metric label={t('Gesamtwert', 'Total value')}>{formatMoney(totalValue)}</Metric>
                        {(item.containerSize ?? 0) > 0 && <>
                            <Metric label={t('Einheiten je Behälter', 'Units per container')}>{item.containerSize}</Metric>
                            <Metric label={t('Behälter', 'Containers')}>{item.containerCount ?? 0}</Metric>
                            <Metric label={t('Geöffnet', 'Opened')}>{item.containersOpened ?? 0}</Metric>
                            <Metric label={t('Geöffneter Behälter', 'Opened container')}>{t(`${item.containerRemainingPercent ?? 100} % verbleibend`, `${item.containerRemainingPercent ?? 100}% remaining`)}</Metric>
                        </>}
                    </MetricList>
                    <ItemStockLocations key={item.id} item={item} />
                    {item.trackingMode === 'serialized' && (
                        <Box sx={{ mt: 1.5 }}>
                            <Typography variant="subtitle2" sx={{ mb: 0.5, fontSize: '0.8125rem' }}>{t('Einheiten', 'Units')}</Typography>
                            <AssetInstancesList item={item} canEdit={canEdit} canReportDamage={canReportDamage} />
                        </Box>
                    )}
                    {canEdit && item.trackingMode === 'lot_tracked' && (
                        <Box sx={{ mt: 1.5 }}>
                            <Typography variant="subtitle2" sx={{ mb: 0.5, fontSize: '0.8125rem' }}>{t('Chargen', 'Lots')}</Typography>
                            <LotsPanel itemId={item.id} />
                        </Box>
                    )}
                </DetailPanel>

            <Box sx={{ display: 'grid', gap: 1.5, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 3fr) minmax(0, 2fr)' } }}>
                <DetailPanel title={t('Übersicht', 'Overview')}>
                    <FieldGrid>
                        <Field label={t('Kategorie', 'Category')}>{[item.category, item.subcategory].filter(Boolean).join(' · ') || '—'}</Field>
                        <Field label={t('Lagerort', 'Storage location')}>{item.storageLocation ? <Link component={RouterLink} to={`/storage-locations?locationId=${encodeURIComponent(item.storageLocation)}`} underline="hover">{location?.name || item.storageLocation}</Link> : '—'}</Field>
                        <Field label={t('Genauer Ort', 'Exact location')}>{exactLocation || '—'}</Field>
                        <Field label={t('Rückgabeort', 'Return location')}>{item.expand?.returnLocation?.name || item.returnLocation || '—'}</Field>
                        <Field label={t('Eigentümer / Anbieter', 'Owner / provider')}>{profile ? (profile.ownerName || (profile.ownershipType === 'organization' ? ownershipLabels.organization : '—')) : '—'}</Field>
                        <Field label={t('Verwahrer / Kontakt', 'Keeper / contact')}>{[profile?.keeperName, profile?.keeperContact].filter(Boolean).join(' · ') || '—'}</Field>
                        <Field label={item.access?.privateResource ? t('Privates Eigentum', 'Privately owned') : t('Organisationseigentum', 'Organization owned')}>{item.stock?.totalOwned ?? 0}</Field>
                        <Field label={t('Bestandsführung', 'Tracking mode')}>{formatStatus(item.trackingMode ?? 'bulk')}</Field>
                        {item.supplier && <Field label={t('Lieferant', 'Supplier')}>{item.supplier}</Field>}
                        {item.assignedUserName && <Field label={t('Zugeordnete Person', 'Assigned person')}>{item.assignedUserName}</Field>}
                        {item.assignedGroup && <Field label={t('Zugeordnete Gruppe', 'Assigned group')}>{item.assignedGroup}</Field>}
                        <Field label={t('Sichtbarkeit', 'Visibility')}>{item.access?.privateResource ? t('Privat', 'Private') : item.visibilityScope || 'global'}</Field>
                        <Field label={t('Erstellt', 'Created')}>{formatDate(item.created)}</Field>
                        {isVehicle && <Field label={t('Kraftstoffverbrauch', 'Fuel consumption')}>{item.fuelConsumptionLitersPer100Km == null ? '—' : `${item.fuelConsumptionLitersPer100Km} l/100 km`}</Field>}
                        {isVehicle && <Field label={t('Batteriewechsel fällig', 'Battery replacement due')}>{item.batteryReplacementDue ? formatDate(item.batteryReplacementDue) : '—'}</Field>}
                        {isGenerator && <Field label={t('Betriebsstunden', 'Running hours')}>{item.currentOperatingHours ?? 0}</Field>}
                        {isGenerator && <Field label={t('Nächste Wartung', 'Next maintenance')}>{item.nextMaintenanceDue ? formatDate(item.nextMaintenanceDue) : '—'}</Field>}
                        {isFood && <Field label={t('Mindestens haltbar bis', 'Best before date')}>{item.bestBeforeDate ? formatDate(item.bestBeforeDate) : '—'}</Field>}
                        <Field label={t('Artikel-ID', 'Item ID')}><span className="mono">{item.id}</span></Field>
                        <Field wide label={t('Freigegebene Event-Nutzung', 'Approved event use')}>
                            <Stack direction="row" useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                                {item.eventTypes?.length
                                    ? item.eventTypes.map(event => <Chip key={event} size="small" variant="outlined" sx={tinyChip} label={event === 'LS' ? 'LightSim' : event} />)
                                    : <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>— {t('keine', 'none')}</Box>}
                                <Tooltip arrow enterTouchDelay={0} title={t('Die Event-Zuordnung beschreibt die Nutzung. Verfügbarkeit und erforderliche Zusagen werden getrennt geprüft.', 'Event assignments describe intended use. Availability and required commitments are checked separately.')}>
                                    <IconButton size="small" sx={{ p: 0.25 }} aria-label={t('Information zur Event-Nutzung', 'About event use')}><InfoOutlinedIcon sx={{ fontSize: 16 }} /></IconButton>
                                </Tooltip>
                            </Stack>
                        </Field>
                        {item.description && <Field wide label={t('Beschreibung', 'Description')}><Box component="span" sx={{ whiteSpace: 'pre-wrap', fontWeight: 400 }}>{item.description}</Box></Field>}
                    </FieldGrid>
                </DetailPanel>

                <Stack spacing={1.5}>
                    <DetailPanel title={t('Eigentum & Verwahrung', 'Ownership & keeper')}>
                        <EquipmentOwnership item={item} canEdit={canEdit} embedded showSummary={false} />
                    </DetailPanel>
                    <InventorySharing kind="items" id={item.id} access={item.access} />
                    {canEdit && <CodeManagement targetId={item.id} targetType="product" embedded />}
                </Stack>
            </Box>

                <DetailPanel title={`${t('Verlauf', 'History')} (${itemTransactions.length})`}>
                    <Stack spacing={1.5}>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 0.5, fontSize: '0.8125rem' }}>{t('Bestandsverlauf', 'Stock history')}</Typography>
                            {historyChart}
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 0.5, fontSize: '0.8125rem' }}>{t('Transaktionen', 'Transactions')}</Typography>
                            {transactionList}
                        </Box>
                    </Stack>
                    {isGenerator && <>
                        <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5, fontSize: '0.8125rem' }}>{t('Wartungsprotokoll', 'Maintenance log')}</Typography>
                        {maintenanceRecords.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">{t('Noch keine Wartungseinträge.', 'No maintenance records yet.')}</Typography>
                        ) : (
                            <Stack>
                                {maintenanceRecords.map((record) => (
                                    <Box key={record.id} sx={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider', py: 0.5 }}>
                                        <Typography variant="body2">{formatDate(record.performedAt)} · {record.type.replaceAll('_', ' ')}</Typography>
                                        <Chip size="small" variant="outlined" sx={tinyChip} label={record.result} color={record.result === 'passed' ? 'success' : record.result === 'failed' ? 'error' : 'warning'} />
                                    </Box>
                                ))}
                            </Stack>
                        )}
                    </>}
                </DetailPanel>

                {!!item.images?.length && (
                    <DetailPanel title={`${t('Bilder', 'Images')} (${item.images.length})`}>
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
                    title={t('Artikel bearbeiten', 'Edit item')}
                    onCancel={() => setEditOpen(false)}
                    initialData={item}
                    onSubmit={handleUpdate}
                    isLoading={updateItem.isPending}
                    storageLocations={storageLocations ?? []}
                    categories={categories}
                    assignableUsers={assignableUsers ?? []}
                />
            </FormDialog>

            <QrLabelDialog label={qrOpen ? { title: t('Etikett', 'Label'), itemId: item.id, itemName: item.name } : null}
                onClose={() => setQrOpen(false)} />

            <Dialog
                open={checkoutOpen}
                fullScreen={isMobile}
                onClose={() => setCheckoutOpen(false)}
                keepMounted
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{t('Ausgabe / Rückgabe', 'Check out / return')}</DialogTitle>
                <DialogContent dividers>
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
