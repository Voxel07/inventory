import { MediaImage } from '../components/common/MediaImage';
import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Typography,
    Paper,
    Grid,
    Chip,
    Dialog,
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
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts';
import { useItem, useItems, useUpdateItem } from '../hooks/useItems';
import { useTransactions, useCreateTransaction, useUpdateTransaction } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';
import { calculateItemStock } from '../utils/stock';
import { formatStatus } from '../utils/formatters';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { useUIStore } from '../store/uiStore';
import { ItemForm } from '../components/forms/ItemForm';
import { TransactionForm } from '../components/forms/TransactionForm';
import { QRCodeGenerator } from '../components/qr/QRCodeGenerator';
import type { ItemFormData, TransactionFormData, StockTransaction } from '../types';
import { useLocalizedText } from '../utils/naming';
import { isOfflineQueuedError } from '../utils/offline';
import { itemImageUrl } from '../utils/itemImages';

const statusColors: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    available: 'success',
    checked_out: 'warning',
    damaged: 'error',
    retired: 'default',
};

function buildStockHistory(transactions: StockTransaction[], initialAmount: number) {
    const sorted = [...transactions].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const hasAddedTransaction = transactions.some((tx) => tx.transactionType === 'added');
    let stock = hasAddedTransaction ? 0 : initialAmount;
    const data: { date: string; stock: number }[] = [];

    for (const tx of sorted) {
        if (tx.transactionType === 'added') {
            stock += tx.quantityChanged;
        } else if (tx.transactionType === 'checkout') {
            stock -= tx.quantityChanged;
        } else if (tx.transactionType === 'checkin') {
            stock += tx.quantityChanged;
        }
        data.push({
            date: new Date(tx.timestamp).toLocaleDateString(),
            stock,
        });
    }

    if (data.length === 0) {
        data.push({ date: 'Now', stock: initialAmount });
    }

    return data;
}

export function ItemDetail() {
    const t = useLocalizedText();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { itemId } = useParams<{ itemId: string }>();
    const navigate = useNavigate();
    const { data: item, isLoading } = useItem(itemId ?? '');
    const { data: allItems } = useItems();
    const { data: allTransactions } = useTransactions();
    const { data: itemDamageReports } = useDamageReports(itemId);
    const updateItem = useUpdateItem();
    const createTransaction = useCreateTransaction();
    const updateTransaction = useUpdateTransaction();
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    const [editOpen, setEditOpen] = useState(false);
    const [qrOpen, setQrOpen] = useState(false);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<StockTransaction | null>(null);

    function handleUpdateTransaction(data: TransactionFormData) {
        if (!editingTransaction) return;
        updateTransaction.mutate(
            { id: editingTransaction.id, data },
            {
                onSuccess: () => {
                    setEditingTransaction(null);
                    showSnackbar(t('Transaktion erfolgreich aktualisiert', 'Transaction updated successfully'), 'success');
                },
                onError: () => showSnackbar(t('Fehler beim Aktualisieren der Transaktion', 'Could not update transaction'), 'error'),
            },
        );
    }

    const { data: storageLocations } = useStorageLocations();
    const categories = useMemo(
        () => [...new Set(allItems?.map((i) => i.category).filter(Boolean) ?? [])],
        [allItems],
    );

    const itemTransactions = useMemo(
        () => allTransactions?.filter((tx) => tx.itemId === itemId) ?? [],
        [allTransactions, itemId],
    );

    const { totalStock, checkedOut, damaged, remaining } = useMemo(() => {
        return calculateItemStock(itemId ?? '', allTransactions, itemDamageReports, item?.amount ?? 0, item);
    }, [itemId, item, allTransactions, itemDamageReports]);

    const stockHistory = useMemo(
        () => buildStockHistory(itemTransactions, item?.amount ?? 0),
        [itemTransactions, item?.amount],
    );

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

    const totalValue = (item.value ?? 0) * totalStock;

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
                <TooltipButton
                    variant="icon"
                    tooltipText={t('Zurück zur Artikelübersicht', 'Back to items')}
                    icon={<ArrowBackIcon />}
                    onClick={() => navigate('/items')}
                />
                <Typography variant="h4" sx={{ flexGrow: 1 }}>
                    {item.name}
                </Typography>
                <TooltipButton
                    variant="icon"
                    tooltipText={t('QR-Code generieren und anzeigen', 'Generate and display QR code')}
                    icon={<QrCode2Icon />}
                    onClick={() => setQrOpen(true)}
                />
                <TooltipButton
                    variant="icon"
                    tooltipText={t('Ausleihe oder Rückgabe erfassen', 'Record a checkout or return')}
                    icon={<ShoppingCartCheckoutIcon />}
                    onClick={() => setCheckoutOpen(true)}
                />
                <TooltipButton
                    variant="icon"
                    tooltipText={t('Artikeldetails bearbeiten', 'Edit item details')}
                    icon={<EditIcon />}
                    onClick={() => setEditOpen(true)}
                />
            </Box>

            {!!item.images?.length && (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5, mb: 2 }}>
                    {item.images.map((filename) => (
                        <MediaImage key={filename} src={itemImageUrl(item, filename, '900x600')} alt={item.name} sx={{ width: '100%', height: 220, objectFit: 'contain', borderRadius: 1, border: 1, borderColor: 'divider' }} />
                    ))}
                </Box>
            )}
            {item.hint && (
                <Alert severity="info" sx={{ mb: 2, alignItems: 'flex-start', '& .MuiAlert-icon': { pt: '2px' } }}>
                    <Typography sx={{ fontWeight: 700 }}>{t('Besonderer Hinweis', 'Special instruction')}</Typography>
                    <Typography variant="body2">{item.hint}</Typography>
                </Alert>
            )}

            <Grid container spacing={2}>
                {/* Info Cards */}
                <Grid size={12}>
                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', '& > *': { flex: 1, minWidth: 90 } }}>
                        <Paper sx={{ p: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">{t('Status', 'Status')}</Typography>
                            <Box sx={{ mt: 0.5 }}>
                                <Chip
                                    label={formatStatus(item.status)}
                                    color={statusColors[item.status] ?? 'default'}
                                    size="small"
                                />
                            </Box>
                        </Paper>
                        <Paper sx={{ p: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">Gesamtbestand</Typography>
                            <Typography variant="h6">{totalStock}</Typography>
                        </Paper>
                        <Paper sx={{ p: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">Ausgeliehen</Typography>
                            <Typography variant="h6" color="warning.main">{checkedOut}</Typography>
                        </Paper>
                        <Paper sx={{ p: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">Defekt</Typography>
                            <Typography variant="h6" color="error.main">{damaged}</Typography>
                        </Paper>
                        <Paper sx={{ p: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">{t('Verfügbar', 'Available')}</Typography>
                            <Typography variant="h6" color="success.main">{remaining}</Typography>
                        </Paper>
                        <Paper sx={{ p: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">Mindestbestand</Typography>
                            <Typography variant="h6">{item.minStock ?? 5}</Typography>
                        </Paper>
                        <Paper sx={{ p: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">Einzelwert</Typography>
                            <Typography variant="h6">{item.value?.toFixed(2) ?? '0.00'} €</Typography>
                        </Paper>
                    </Box>
                </Grid>

                {/* Details */}
                <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            Details
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    {t('Kategorie', 'Category')}
                                </Typography>
                                <Typography>{item.category || '—'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Unterkategorie
                                </Typography>
                                <Typography>{item.subcategory || '—'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    {t('Lagerort', 'Storage location')}
                                </Typography>
                                <Typography>{item.expand?.storageLocation?.name || item.storageLocation || '—'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Position
                                </Typography>
                                <Typography>{item.expand?.storageLocation?.position || '—'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Genauer Ort
                                </Typography>
                                <Typography>{item.expand?.storageLocation?.location || '—'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Gesamtwert
                                </Typography>
                                <Typography>{totalValue.toFixed(2)} €</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Erstellt
                                </Typography>
                                <Typography>{new Date(item.created).toLocaleDateString()}</Typography>
                            </Box>
                            <Box sx={{ gridColumn: '1 / -1' }}>
                                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.75 }}>
                                    {t('Event-Nutzung', 'Event use')}
                                </Typography>
                                {item.eventTypes?.length ? (
                                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                        {item.eventTypes.map((eventType) => (
                                            <Chip
                                                key={eventType}
                                                label={eventType === 'LS' ? 'LightSim' : eventType}
                                                color="primary"
                                                variant="outlined"
                                                size="small"
                                            />
                                        ))}
                                    </Stack>
                                ) : (
                                    <Typography>—</Typography>
                                )}
                            </Box>
                        </Box>
                    </Paper>
                </Grid>

                {/* Checkout card */}
                <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="subtitle2">Schnelle Erfassung</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {t('Diesen Artikel ausleihen oder zurückgeben', 'Check out or return this item')}
                            </Typography>
                        </Box>
                        <TooltipButton
                            tooltipText={t('Ausleihe oder Rückgabe erfassen', 'Record a checkout or return')}
                            label={t('Transaktion', 'Transaction')}
                            variant="contained"
                            size="small"
                            onClick={() => setCheckoutOpen(true)}
                            disabled={remaining <= 0}
                        />
                    </Paper>
                </Grid>

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

                {/* Stock History Graph */}
                <Grid size={12}>
                    <Paper sx={{ p: 3 }}>
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
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            Transaktionsverlauf
                        </Typography>
                        {itemTransactions.length === 0 ? (
                            <Typography color="text.secondary">{t('Noch keine Transaktionen vorhanden.', 'No transactions yet.')}</Typography>
                        ) : isMobile ? (
                            <Stack spacing={1.5}>
                                {itemTransactions
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
                                                    <TooltipButton
                                                        variant="icon"
                                                        tooltipText={t('Transaktion bearbeiten', 'Edit transaction')}
                                                        icon={<EditIcon sx={{ fontSize: 18 }} />}
                                                        onClick={() => setEditingTransaction(tx)}
                                                        size="small"
                                                    />
                                                </Box>
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                    {new Date(tx.timestamp).toLocaleString()} · {tx.expand?.userId?.name?.trim() || tx.expand?.userId?.username?.trim() || tx.expand?.userId?.email?.trim() || tx.userId || '—'}
                                                </Typography>
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
                                            <TableCell align="center" sx={{ width: 80 }}>{t('Aktionen', 'Actions')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {itemTransactions
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
                                                    <TableCell>{tx.reason || '—'}</TableCell>
                                                    <TableCell>{tx.notes || '—'}</TableCell>
                                                    <TableCell align="center">
                                                        <TooltipButton
                                                            variant="icon"
                                                            tooltipText={t('Transaktion bearbeiten', 'Edit transaction')}
                                                            icon={<EditIcon sx={{ fontSize: 18 }} />}
                                                            onClick={() => setEditingTransaction(tx)}
                                                            size="small"
                                                        />
                                                    </TableCell>
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

            {/* Edit Transaction Dialog */}
            <Dialog
                open={Boolean(editingTransaction)}
                fullScreen={isMobile}
                onClose={() => setEditingTransaction(null)}
                keepMounted
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{t('Transaktion bearbeiten', 'Edit transaction')}</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    {editingTransaction && (
                        <TransactionForm
                            key={editingTransaction.id}
                            items={allItems ?? []}
                            initialData={editingTransaction}
                            onSubmit={handleUpdateTransaction}
                            isLoading={updateTransaction.isPending}
                        />
                    )}
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
                        items={allItems ?? []}
                        preselectedItemId={item.id}
                        onSubmit={handleTransaction}
                        isLoading={createTransaction.isPending}
                    />
                </DialogContent>
            </Dialog>
        </Box>
    );
}
