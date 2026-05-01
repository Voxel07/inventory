import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Typography,
    Paper,
    IconButton,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Skeleton,
    Alert,
    TextField,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useAssembly, useUpdateAssembly } from '../hooks/useAssemblies';
import { useItems } from '../hooks/useItems';
import { useTransactions, useAssemblyCheckout } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';
import { AssemblyForm } from '../components/forms/AssemblyForm';
import { useUIStore } from '../store/uiStore';
import type { AssemblyFormData, Item } from '../types';

const statusColors: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    available: 'success',
    checked_out: 'warning',
    damaged: 'error',
    retired: 'default',
};

export function AssemblyDetail() {
    const { assemblyId } = useParams<{ assemblyId: string }>();
    const navigate = useNavigate();
    const { data: assembly, isLoading } = useAssembly(assemblyId ?? '');
    const { data: items } = useItems();
    const { data: transactions } = useTransactions();
    const { data: damageReports } = useDamageReports();
    const updateAssembly = useUpdateAssembly();
    const checkoutAssembly = useAssemblyCheckout();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const [editOpen, setEditOpen] = useState(false);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [checkoutReason, setCheckoutReason] = useState('');
    const [checkoutNotes, setCheckoutNotes] = useState('');

    function handleUpdate(data: AssemblyFormData) {
        if (!assembly) return;
        updateAssembly.mutate(
            { id: assembly.id, data },
            {
                onSuccess: () => {
                    setEditOpen(false);
                    showSnackbar('Assembly updated', 'success');
                },
                onError: () => showSnackbar('Failed to update assembly', 'error'),
            },
        );
    }

    function handleCheckout() {
        if (!assembly) return;
        const quantities = assembly.itemQuantities ?? {};
        // Build full quantities map including items with default qty 1
        const fullQuantities: Record<string, number> = {};
        for (const id of assembly.itemIds ?? []) {
            fullQuantities[id] = quantities[id] ?? 1;
        }
        checkoutAssembly.mutate(
            {
                itemQuantities: fullQuantities,
                assemblyName: assembly.name,
                reason: checkoutReason || `Assembly checkout: ${assembly.name}`,
                notes: checkoutNotes,
            },
            {
                onSuccess: () => {
                    setCheckoutOpen(false);
                    setCheckoutReason('');
                    setCheckoutNotes('');
                    showSnackbar('Assembly checked out successfully', 'success');
                },
                onError: () => showSnackbar('Failed to checkout assembly', 'error'),
            },
        );
    }

    // Calculate available stock for each item
    const stockInfo = useMemo(() => {
        if (!items || !transactions) return new Map<string, number>();
        const map = new Map<string, number>();
        for (const item of items) {
            const checkedOut = (transactions ?? [])
                .filter((tx) => tx.itemId === item.id)
                .reduce((count, tx) => {
                    if (tx.transactionType === 'checkout') return count + tx.quantityChanged;
                    if (tx.transactionType === 'checkin') return count - tx.quantityChanged;
                    return count;
                }, 0);
            const damaged = (damageReports ?? [])
                .filter((r) => r.itemId === item.id && (r.status === 'reported' || r.status === 'in_review'))
                .reduce((sum, r) => sum + (r.amount ?? 0), 0);
            map.set(item.id, Math.max(0, item.amount - checkedOut - damaged));
        }
        return map;
    }, [items, transactions, damageReports]);

    if (isLoading) {
        return (
            <Box>
                <Skeleton height={60} width={300} />
                <Skeleton height={200} />
            </Box>
        );
    }

    if (!assembly) {
        return (
            <Box>
                <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/assemblies')}>
                    Back to Assemblies
                </Button>
                <Typography variant="h5" sx={{ mt: 2 }}>
                    Assembly not found
                </Typography>
            </Box>
        );
    }

    const assemblyItems: Item[] = assembly.expand?.itemIds?.length
        ? assembly.expand.itemIds
        : (assembly.itemIds ?? [])
            .map((id) => items?.find((i) => i.id === id))
            .filter((i): i is Item => !!i);

    const totalValue = assemblyItems.reduce(
        (sum, item) => sum + (item.value ?? 0) * (assembly.itemQuantities?.[item.id] ?? 1), 0,
    );

    // Check which items have insufficient stock
    const insufficientItems = assemblyItems.filter((item) => {
        const needed = assembly.itemQuantities?.[item.id] ?? 1;
        const available = stockInfo.get(item.id) ?? 0;
        return available < needed;
    });

    const canCheckout = insufficientItems.length === 0 && assemblyItems.length > 0;

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
                <IconButton onClick={() => navigate('/assemblies')}>
                    <ArrowBackIcon />
                </IconButton>
                <Typography variant="h4" sx={{ flexGrow: 1 }}>
                    {assembly.name}
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<ShoppingCartCheckoutIcon />}
                    onClick={() => setCheckoutOpen(true)}
                    disabled={!canCheckout}
                >
                    Checkout
                </Button>
                <IconButton onClick={() => setEditOpen(true)}>
                    <EditIcon />
                </IconButton>
            </Box>

            {insufficientItems.length > 0 && (
                <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 3 }}>
                    Insufficient stock for: {insufficientItems.map((i) => {
                        const needed = assembly.itemQuantities?.[i.id] ?? 1;
                        const available = stockInfo.get(i.id) ?? 0;
                        return `${i.name} (need ${needed}, have ${available})`;
                    }).join(', ')}
                </Alert>
            )}

            {assembly.description && (
                <Paper sx={{ p: 2, mb: 3 }}>
                    <Typography variant="body1">{assembly.description}</Typography>
                </Paper>
            )}

            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Paper sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">Items</Typography>
                    <Typography variant="h6">{assemblyItems.length}</Typography>
                </Paper>
                <Paper sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">Total Value</Typography>
                    <Typography variant="h6">{totalValue.toFixed(2)} €</Typography>
                </Paper>
                <Paper sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">Created</Typography>
                    <Typography variant="h6">{new Date(assembly.created).toLocaleDateString()}</Typography>
                </Paper>
            </Box>

            <Typography variant="h6" sx={{ mb: 2 }}>
                Items in this Assembly
            </Typography>

            {assemblyItems.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">No items in this assembly</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell align="right">Qty</TableCell>
                                <TableCell align="right">Available</TableCell>
                                <TableCell>Category</TableCell>
                                <TableCell>Location</TableCell>
                                <TableCell align="right">Value</TableCell>
                                <TableCell>Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {assemblyItems.map((item) => {
                                const qty = assembly.itemQuantities?.[item.id] ?? 1;
                                const available = stockInfo.get(item.id) ?? 0;
                                const isInsufficient = available < qty;
                                return (
                                    <TableRow
                                        key={item.id}
                                        hover
                                        onClick={() => navigate(`/items/${item.id}`)}
                                        sx={{ cursor: 'pointer' }}
                                    >
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                {item.name}
                                                {isInsufficient && (
                                                    <WarningAmberIcon fontSize="small" color="warning" />
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell align="right">{qty}</TableCell>
                                        <TableCell align="right">
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    color: isInsufficient ? 'error.main' : 'success.main',
                                                    fontWeight: isInsufficient ? 700 : 400,
                                                }}
                                            >
                                                {available}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{item.category || '—'}</TableCell>
                                        <TableCell>
                                            {[item.storageLocation, item.position].filter(Boolean).join(' / ') || '—'}
                                        </TableCell>
                                        <TableCell align="right">{((item.value ?? 0) * qty).toFixed(2)} €</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={item.status.replace('_', ' ')}
                                                color={statusColors[item.status] ?? 'default'}
                                                size="small"
                                            />
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Checkout Dialog */}
            <Dialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Checkout Assembly</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        This will check out all items in "{assembly.name}" with their specified quantities.
                    </DialogContentText>
                    <TextField
                        label="Reason"
                        value={checkoutReason}
                        onChange={(e) => setCheckoutReason(e.target.value)}
                        fullWidth
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        label="Notes (optional)"
                        value={checkoutNotes}
                        onChange={(e) => setCheckoutNotes(e.target.value)}
                        fullWidth
                        multiline
                        rows={2}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCheckoutOpen(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={handleCheckout}
                        disabled={checkoutAssembly.isPending}
                    >
                        Checkout All Items
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Edit Assembly</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    <AssemblyForm
                        initialData={assembly}
                        items={items ?? []}
                        onSubmit={handleUpdate}
                        isLoading={updateAssembly.isPending}
                    />
                </DialogContent>
            </Dialog>
        </Box>
    );
}
