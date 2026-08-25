import { useMemo, useState } from 'react';
import {
    Box,
    Typography,
    Grid,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
} from '@mui/material';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import ListAltIcon from '@mui/icons-material/ListAlt';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { useNavigate } from 'react-router-dom';
import { useItems } from '../hooks/useItems';
import { useTransactions, useCreateTransaction } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';
import { usePocketBase } from '../hooks/usePocketBase';
import { useUIStore } from '../store/uiStore';
import { TransactionHistory } from '../components/lists/TransactionHistory';
import { TransactionForm } from '../components/forms/TransactionForm';
import type { Item, TransactionFormData } from '../types';
import { useNames, useTranslate } from '../utils/naming';

export function UserDashboard() {
    const names = useNames();
    const t = useTranslate();
    const navigate = useNavigate();
    const { user: currentUser } = usePocketBase();
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    const { data: items, isLoading: itemsLoading } = useItems();
    const { data: allTransactions, isLoading: txLoading } = useTransactions();
    const { data: damageReports } = useDamageReports();
    const createTransaction = useCreateTransaction();

    const [returnItem, setReturnItem] = useState<{ item: Item; quantity: number } | null>(null);

    // 1. Transactions belonging to this user
    const userTransactions = useMemo(() => {
        if (!allTransactions || !currentUser) return [];
        return allTransactions.filter((tx) => tx.userId === currentUser.id);
    }, [allTransactions, currentUser]);

    // 2. Items currently checked out by this user
    const checkedOutItems = useMemo(() => {
        if (!items || !allTransactions || !currentUser) return [];
        const checkoutMap = new Map<string, number>();

        // Sort all transactions chronologically to calculate user's net checkouts
        const sortedTransactions = [...allTransactions].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        for (const tx of sortedTransactions) {
            if (tx.userId !== currentUser.id) continue;
            const currentVal = checkoutMap.get(tx.itemId) ?? 0;
            if (tx.transactionType === 'checkout') {
                checkoutMap.set(tx.itemId, currentVal + tx.quantityChanged);
            } else if (tx.transactionType === 'checkin') {
                checkoutMap.set(tx.itemId, Math.max(0, currentVal - tx.quantityChanged));
            }
        }

        const results: { item: Item; quantity: number }[] = [];
        for (const [itemId, quantity] of checkoutMap.entries()) {
            if (quantity > 0) {
                const item = items.find((i) => i.id === itemId);
                if (item) {
                    results.push({ item, quantity });
                }
            }
        }
        return results;
    }, [items, allTransactions, currentUser]);

    const totalUniqueCheckedOut = checkedOutItems.length;
    const totalUnitsCheckedOut = checkedOutItems.reduce((sum, current) => sum + current.quantity, 0);
    const totalUserTransactionsCount = userTransactions.length;
    const userDamageReportsCount = useMemo(() => {
        if (!damageReports || !currentUser) return 0;
        return damageReports.filter((r) => r.reportedBy === currentUser.id && (r.status === 'reported' || r.status === 'in_review')).length;
    }, [damageReports, currentUser]);

    const metrics = [
        { label: t('Meine ausgeliehenen Artikel', 'My checked-out items'), value: totalUniqueCheckedOut, icon: <ShoppingBagIcon />, color: '#7c4dff' },
        { label: t('Einheiten insgesamt ausgeliehen', 'Total units checked out'), value: totalUnitsCheckedOut, icon: <AssignmentReturnIcon />, color: '#00e676' },
        { label: t('Meine Protokolle', 'My records'), value: totalUserTransactionsCount, icon: <ListAltIcon />, color: '#448aff' },
        { label: t('Meine offenen Schadensberichte', 'My open damage reports'), value: userDamageReportsCount, icon: <ReportProblemIcon />, color: '#ff5252' },
    ];

    function handleReturnSubmit(data: TransactionFormData) {
        createTransaction.mutate(data, {
            onSuccess: () => {
                setReturnItem(null);
                showSnackbar(t('Artikel erfolgreich zurückgegeben', 'Item returned successfully'), 'success');
            },
            onError: () => {
                showSnackbar(t('Fehler beim Erfassen der Rückgabe', 'Could not record return'), 'error');
            }
        });
    }

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 0.5, fontWeight: 700 }}>
                {t('Hallo', 'Hello')}, {currentUser?.name || t('Benutzer', 'User')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                {t('Hier ist eine Übersicht Ihrer aktuellen Ausleihen und Aktivitäten.', 'Here is an overview of your current checkouts and activity.')}
            </Typography>

            {/* Personalized Metrics */}
            <Grid container spacing={2} sx={{ mb: 4 }}>
                {metrics.map((metric) => (
                    <Grid size={{ xs: 6, sm: 6, md: 3 }} key={metric.label}>
                        <Paper sx={{ p: 2.5, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                            <Box sx={{ color: metric.color, mb: 1, '& .MuiSvgIcon-root': { fontSize: 32 } }}>
                                {metric.icon}
                            </Box>
                            <Typography variant="h4" sx={{ fontWeight: 700 }}>
                                {metric.value}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {metric.label}
                            </Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            {/* Currently Checked Out Items */}
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                {t('Meine ausgeliehenen Artikel', 'My checked-out items')}
            </Typography>
            {checkedOutItems.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center', mb: 4 }}>
                    <Typography color="text.secondary">{t('Sie haben derzeit keine Artikel ausgeliehen.', 'You currently have no items checked out.')}</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ overflowX: 'auto', mb: 4 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('Artikelname', 'Item name')}</TableCell>
                                <TableCell>{t('Kategorie', 'Category')}</TableCell>
                                <TableCell align="right">{t('Ausgeliehene Menge', 'Quantity checked out')}</TableCell>
                                <TableCell>{t('Lagerort', 'Storage location')}</TableCell>
                                <TableCell align="right">{t('Aktionen', 'Actions')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {checkedOutItems.map(({ item, quantity }) => (
                                <TableRow key={item.id} hover>
                                    <TableCell
                                        onClick={() => navigate(`/items/${item.id}`)}
                                        sx={{ cursor: 'pointer', fontWeight: 600, '&:hover': { color: 'primary.main' } }}
                                    >
                                        {item.name}
                                    </TableCell>
                                    <TableCell>{item.category || '—'}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, color: 'warning.main' }}>
                                        {quantity}
                                    </TableCell>
                                    <TableCell>
                                        {item.expand?.storageLocation?.name || item.storageLocation || '—'}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Button
                                            variant="outlined"
                                            color="success"
                                            size="small"
                                            startIcon={<AssignmentReturnIcon />}
                                            onClick={() => setReturnItem({ item, quantity })}
                                        >
                                            {names.action.checkin}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* My Recent Activity */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {t('Meine kürzlichen Transaktionen', 'My recent transactions')}
                </Typography>
                <Button
                    endIcon={<KeyboardArrowRightIcon />}
                    onClick={() => navigate('/transactions')}
                    sx={{ textTransform: 'none' }}
                >
                    {t('Alle anzeigen', 'View all')}
                </Button>
            </Box>
            <TransactionHistory
                transactions={userTransactions.slice(0, 5)}
                items={items}
                isLoading={txLoading || itemsLoading}
            />

            {/* Quick Return Dialog */}
            <Dialog
                open={Boolean(returnItem)}
                onClose={() => setReturnItem(null)}
                keepMounted
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{t(`${returnItem?.item.name ?? ''} zurückgeben`, `Return ${returnItem?.item.name ?? ''}`)}</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    {returnItem && (
                        <TransactionForm
                            key={returnItem.item.id}
                            items={items ?? []}
                            preselectedItemId={returnItem.item.id}
                            onSubmit={handleReturnSubmit}
                            isLoading={createTransaction.isPending}
                            initialData={{
                                itemId: returnItem.item.id,
                                transactionType: 'checkin',
                                quantityChanged: returnItem.quantity,
                                reason: names.reason.returnAfterUse,
                                notes: '',
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
}
