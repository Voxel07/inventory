import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Typography,
    Paper,
    Grid,
    Chip,
    Button,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    Skeleton,
} from '@mui/material';
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
import { useItem, useItems, useUpdateItem } from '../hooks/useItems';
import { useTransactions, useCreateTransaction } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';
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
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    const [editOpen, setEditOpen] = useState(false);
    const [qrOpen, setQrOpen] = useState(false);
    const [checkoutOpen, setCheckoutOpen] = useState(false);

    const storageLocations = useMemo(
        () => [...new Set(allItems?.map((i) => i.storageLocation).filter(Boolean) ?? [])],
        [allItems],
    );
    const categories = useMemo(
        () => [...new Set(allItems?.map((i) => i.category).filter(Boolean) ?? [])],
        [allItems],
    );

    const itemTransactions = useMemo(
        () => allTransactions?.filter((tx) => tx.itemId === itemId) ?? [],
        [allTransactions, itemId],
    );

    const checkedOut = useMemo(() => {
        let net = 0;
        for (const tx of itemTransactions) {
            if (tx.transactionType === 'checkout') net += tx.quantityChanged;
            else if (tx.transactionType === 'checkin') net -= tx.quantityChanged;
        }
        return Math.max(0, net);
    }, [itemTransactions]);

    const damaged = useMemo(() => {
        return (itemDamageReports ?? [])
            .filter((report) => report.status === 'reported' || report.status === 'in_review')
            .reduce((sum, report) => sum + (report.amount ?? 0), 0);
    }, [itemDamageReports]);

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
                    showSnackbar('Item updated successfully', 'success');
                },
                onError: () => showSnackbar('Failed to update item', 'error'),
            },
        );
    }

    function handleTransaction(data: TransactionFormData) {
        createTransaction.mutate(data, {
            onSuccess: () => {
                setCheckoutOpen(false);
                showSnackbar('Transaction completed', 'success');
            },
            onError: () => showSnackbar('Transaction failed', 'error'),
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
                <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/items')}>
                    Back to Items
                </Button>
                <Typography variant="h5" sx={{ mt: 2 }}>
                    Item not found
                </Typography>
            </Box>
        );
    }

    const remaining = Math.max(0, item.amount - checkedOut - damaged);
    const totalValue = (item.value ?? 0) * item.amount;

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
                <IconButton onClick={() => navigate('/items')}>
                    <ArrowBackIcon />
                </IconButton>
                <Typography variant="h4" sx={{ flexGrow: 1 }}>
                    {item.name}
                </Typography>
                <IconButton onClick={() => setQrOpen(true)}>
                    <QrCode2Icon />
                </IconButton>
                <IconButton onClick={() => setEditOpen(true)}>
                    <EditIcon />
                </IconButton>
            </Box>

            <Grid container spacing={2}>
                {/* Info Cards */}
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="caption" color="text.secondary">Status</Typography>
                        <Box sx={{ mt: 0.5 }}>
                            <Chip
                                label={item.status.replace('_', ' ')}
                                color={statusColors[item.status] ?? 'default'}
                                size="small"
                            />
                        </Box>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="caption" color="text.secondary">Total Stock</Typography>
                        <Typography variant="h6">{item.amount}</Typography>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="caption" color="text.secondary">Checked Out</Typography>
                        <Typography variant="h6" color="warning.main">{checkedOut}</Typography>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="caption" color="text.secondary">Damaged</Typography>
                        <Typography variant="h6" color="error.main">{damaged}</Typography>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="caption" color="text.secondary">Remaining</Typography>
                        <Typography variant="h6" color="success.main">{remaining}</Typography>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="caption" color="text.secondary">Min Stock</Typography>
                        <Typography variant="h6">{item.minStock ?? 5}</Typography>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="caption" color="text.secondary">Unit Value</Typography>
                        <Typography variant="h6">{item.value?.toFixed(2) ?? '0.00'} €</Typography>
                    </Paper>
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
                                    Category
                                </Typography>
                                <Typography>{item.category || '—'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Storage Location
                                </Typography>
                                <Typography>{item.storageLocation || '—'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Position
                                </Typography>
                                <Typography>{item.position || '—'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Location
                                </Typography>
                                <Typography>{item.location || '—'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Total Value
                                </Typography>
                                <Typography>{totalValue.toFixed(2)} €</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Created
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
                            <Typography variant="subtitle2">Quick Checkout</Typography>
                            <Typography variant="caption" color="text.secondary">
                                Check out or return this item
                            </Typography>
                        </Box>
                        <Button
                            variant="contained"
                            size="small"
                            onClick={() => setCheckoutOpen(true)}
                            disabled={remaining <= 0}
                        >
                            Transaction
                        </Button>
                    </Paper>
                </Grid>

                {/* Container info */}
                {(item.containerSize ?? 0) > 0 && (
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Container Info
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Units / Container</Typography>
                                    <Typography variant="body2">{item.containerSize}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Containers</Typography>
                                    <Typography variant="body2">{item.containerCount ?? 0}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Opened</Typography>
                                    <Typography variant="body2">{item.containersOpened ?? 0}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Open Container</Typography>
                                    <Typography variant="body2">{item.containerRemainingPercent ?? 100}% remaining</Typography>
                                </Box>
                            </Box>
                        </Paper>
                    </Grid>
                )}

                {/* Stock History Graph */}
                <Grid size={12}>
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            Stock History
                        </Typography>
                        {stockHistory.length <= 1 && itemTransactions.length === 0 ? (
                            <Typography color="text.secondary">No transaction history yet.</Typography>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={stockHistory}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                                    <XAxis dataKey="date" stroke="#aaa" fontSize={12} />
                                    <YAxis stroke="#aaa" fontSize={12} allowDecimals={false} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#333',
                                            border: '1px solid #555',
                                            borderRadius: 4,
                                        }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="stock"
                                        stroke="#90caf9"
                                        strokeWidth={2}
                                        dot={{ fill: '#90caf9', r: 4 }}
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
                            Transaction History
                        </Typography>
                        {itemTransactions.length === 0 ? (
                            <Typography color="text.secondary">No transactions yet.</Typography>
                        ) : (
                            <Box sx={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #555' }}>Date</th>
                                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #555' }}>Type</th>
                                            <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #555' }}>Qty</th>
                                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #555' }}>Reason</th>
                                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #555' }}>Notes</th>
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
                                                            label={tx.transactionType === 'checkout' ? 'Check Out' : tx.transactionType === 'added' ? 'Added' : 'Check In'}
                                                            color={tx.transactionType === 'checkout' ? 'warning' : tx.transactionType === 'added' ? 'info' : 'success'}
                                                            size="small"
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px', borderBottom: '1px solid #333', textAlign: 'right' }}>
                                                        {tx.quantityChanged}
                                                    </td>
                                                    <td style={{ padding: '8px', borderBottom: '1px solid #333' }}>{tx.reason}</td>
                                                    <td style={{ padding: '8px', borderBottom: '1px solid #333' }}>{tx.notes}</td>
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
                <DialogTitle>Edit Item</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    <ItemForm
                        initialData={item}
                        onSubmit={handleUpdate}
                        isLoading={updateItem.isPending}
                        storageLocations={storageLocations}
                        categories={categories}
                    />
                </DialogContent>
            </Dialog>

            {/* QR Dialog */}
            <Dialog open={qrOpen} onClose={() => setQrOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>QR Code</DialogTitle>
                <DialogContent>
                    <QRCodeGenerator itemId={item.id} itemName={item.name} />
                </DialogContent>
            </Dialog>

            {/* Checkout Dialog */}
            <Dialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>New Transaction</DialogTitle>
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
