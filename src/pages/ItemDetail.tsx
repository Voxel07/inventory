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

    let stock = 0;
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
                    showSnackbar('Transaktion erfolgreich aktualisiert', 'success');
                },
                onError: () => showSnackbar('Fehler beim Aktualisieren der Transaktion', 'error'),
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
        return calculateItemStock(itemId ?? '', allTransactions, itemDamageReports);
    }, [itemId, allTransactions, itemDamageReports]);

    const stockHistory = useMemo(
        () => buildStockHistory(itemTransactions, totalStock),
        [itemTransactions, totalStock],
    );

    function handleUpdate(data: ItemFormData) {
        if (!itemId) return;
        updateItem.mutate(
            { id: itemId, data },
            {
                onSuccess: () => {
                    setEditOpen(false);
                    showSnackbar('Artikel erfolgreich aktualisiert', 'success');
                },
                onError: () => showSnackbar('Fehler beim Aktualisieren des Artikels', 'error'),
            },
        );
    }

    function handleTransaction(data: TransactionFormData) {
        createTransaction.mutate(data, {
            onSuccess: () => {
                setCheckoutOpen(false);
                showSnackbar('Transaktion abgeschlossen', 'success');
            },
            onError: () => showSnackbar('Transaktion fehlgeschlagen', 'error'),
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
                    tooltipText="Zurück zur Artikelübersicht"
                    icon={<ArrowBackIcon />}
                    label="Zurück zur Übersicht"
                    variant="text"
                    onClick={() => navigate('/items')}
                />
                <Typography variant="h5" sx={{ mt: 2 }}>
                    Artikel nicht gefunden
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
                    tooltipText="Zurück zur Artikelübersicht"
                    icon={<ArrowBackIcon />}
                    onClick={() => navigate('/items')}
                />
                <Typography variant="h4" sx={{ flexGrow: 1 }}>
                    {item.name}
                </Typography>
                <TooltipButton
                    variant="icon"
                    tooltipText="QR-Code generieren und anzeigen"
                    icon={<QrCode2Icon />}
                    onClick={() => setQrOpen(true)}
                />
                <TooltipButton
                    variant="icon"
                    tooltipText="Ausleihe oder Rückgabe erfassen"
                    icon={<ShoppingCartCheckoutIcon />}
                    onClick={() => setCheckoutOpen(true)}
                />
                <TooltipButton
                    variant="icon"
                    tooltipText="Artikeldetails bearbeiten"
                    icon={<EditIcon />}
                    onClick={() => setEditOpen(true)}
                />
            </Box>

            <Grid container spacing={2}>
                {/* Info Cards */}
                <Grid size={12}>
                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', '& > *': { flex: 1, minWidth: 90 } }}>
                        <Paper sx={{ p: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">Status</Typography>
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
                            <Typography variant="caption" color="text.secondary">Verfügbar</Typography>
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
                                    Kategorie
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
                                    Lagerort
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
                        </Box>
                    </Paper>
                </Grid>

                {/* Checkout card */}
                <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="subtitle2">Schnelle Erfassung</Typography>
                            <Typography variant="caption" color="text.secondary">
                                Diesen Artikel ausleihen oder zurückgeben
                            </Typography>
                        </Box>
                        <TooltipButton
                            tooltipText="Ausleihe oder Rückgabe erfassen"
                            label="Transaktion"
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
                                Behälter-Details
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Einheiten / Behälter</Typography>
                                    <Typography variant="body2">{item.containerSize}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Behälter</Typography>
                                    <Typography variant="body2">{item.containerCount ?? 0}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Geöffnet</Typography>
                                    <Typography variant="body2">{item.containersOpened ?? 0}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Geöffneter Behälter</Typography>
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
                            Bestandsverlauf
                        </Typography>
                        {stockHistory.length <= 1 && itemTransactions.length === 0 ? (
                            <Typography color="text.secondary">Noch kein Transaktionsverlauf vorhanden.</Typography>
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
                                        name="Bestand"
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
                            <Typography color="text.secondary">Noch keine Transaktionen vorhanden.</Typography>
                        ) : (
                            <Box sx={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #555' }}>Datum</th>
                                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #555' }}>Typ</th>
                                            <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #555' }}>Menge</th>
                                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #555' }}>Grund</th>
                                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #555' }}>Anmerkungen</th>
                                            <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid #555', width: '80px' }}>Aktionen</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {itemTransactions
                                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                                            .map((tx) => (
                                                <tr key={tx.id}>
                                                    <td style={{ padding: '8px', borderBottom: '1px solid #333' }}>
                                                        {new Date(tx.timestamp).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '8px', borderBottom: '1px solid #333' }}>
                                                        <Chip
                                                            label={formatStatus(tx.transactionType)}
                                                            color={tx.transactionType === 'checkout' ? 'warning' : tx.transactionType === 'added' ? 'info' : 'success'}
                                                            size="small"
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px', borderBottom: '1px solid #333', textAlign: 'right' }}>
                                                        {tx.quantityChanged}
                                                    </td>
                                                    <td style={{ padding: '8px', borderBottom: '1px solid #333' }}>{tx.reason}</td>
                                                    <td style={{ padding: '8px', borderBottom: '1px solid #333' }}>{tx.notes}</td>
                                                    <td style={{ padding: '8px', borderBottom: '1px solid #333', textAlign: 'center' }}>
                                                        <TooltipButton
                                                            variant="icon"
                                                            tooltipText="Transaktion bearbeiten"
                                                            icon={<EditIcon sx={{ fontSize: 18 }} />}
                                                            onClick={() => setEditingTransaction(tx)}
                                                            size="small"
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </Box>
                        )}
                    </Paper>
                </Grid>
            </Grid>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Artikel bearbeiten</DialogTitle>
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
                onClose={() => setEditingTransaction(null)}
                keepMounted
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Transaktion bearbeiten</DialogTitle>
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
                onClose={() => setCheckoutOpen(false)}
                keepMounted
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Neue Transaktion</DialogTitle>
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
