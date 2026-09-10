import { useMemo, useState } from 'react';
import {
    Box,
    Typography,
    Grid,
    Paper,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    Stack,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import ListAltIcon from '@mui/icons-material/ListAlt';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { useNavigate } from 'react-router-dom';
import { useItems } from '../hooks/useItems';
import { useTransactions, useCreateTransaction } from '../hooks/useTransactions';
import { useDamageReports, useCreateDamageReport } from '../hooks/useDamageReports';
import { useAssemblies } from '../hooks/useAssemblies';
import { useAuth } from '../hooks/useAuth';
import { useUsers } from '../hooks/useUsers';
import { useUIStore } from '../store/uiStore';
import { TransactionHistory } from '../components/lists/TransactionHistory';
import { TransactionForm } from '../components/forms/TransactionForm';
import { DamageReportForm } from '../components/forms/DamageReportForm';
import { CheckedOutList, type CheckedOutRow } from '../components/lists/CheckedOutList';
import type { DamageReportFormData, Item, TransactionFormData } from '../types';
import { useNames, useLocalizedText } from '../utils/naming';
import { isOfflineQueuedError } from '../utils/offline';

export function UserDashboard() {
    const names = useNames();
    const t = useLocalizedText();
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const { user: currentUser } = useAuth();
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    const { data: items, isLoading: itemsLoading } = useItems();
    const { data: allTransactions, isLoading: txLoading } = useTransactions();
    const { data: damageReports } = useDamageReports();
    const { data: assemblies } = useAssemblies();
    const { data: users } = useUsers();
    const createTransaction = useCreateTransaction();
    const createDamageReport = useCreateDamageReport();

    const [returnItem, setReturnItem] = useState<{ item: Item; quantity: number } | null>(null);
    const [damageItem, setDamageItem] = useState<{ item: Item; quantity: number } | null>(null);

    // 1. Transactions belonging to this user
    const userTransactions = useMemo(() => {
        if (!allTransactions || !currentUser) return [];
        return allTransactions.filter((tx) => tx.userId === currentUser.id);
    }, [allTransactions, currentUser]);

    // 2. Build CheckedOutRow format for the shared component and metrics
    const checkedOutRows = useMemo<CheckedOutRow[]>(() => {
        if (!items || !allTransactions || !currentUser) return [];
        const itemMap = new Map(items.map((item) => [item.id, item]));
        const rows = new Map<string, CheckedOutRow>();
        const chronological = [...allTransactions]
            .filter((tx) => tx.userId === currentUser.id)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        for (const tx of chronological) {
            if (tx.transactionType !== 'checkout' && tx.transactionType !== 'checkin') continue;
            const item = itemMap.get(tx.itemId);
            if (!item) continue;
            const order = tx.expand?.factionOrderId;
            const eventKey = order ? `${order.eventType}:${order.faction}` : tx.reason || t('Ohne Event', 'No event');
            const key = `${tx.itemId}:${tx.factionOrderId ?? 'manual'}`;
            const existing = rows.get(key);
            const amount = tx.transactionType === 'checkout' ? tx.quantityChanged : -tx.quantityChanged;
            const loc = item.expand?.storageLocation;
            rows.set(key, {
                key,
                itemId: item.id,
                name: item.name,
                category: item.category,
                storageLocation: loc ? [loc.name, loc.location, loc.position].filter(Boolean).join(' / ') : item.storageLocation || '—',
                checkedOut: Math.max(0, (existing?.checkedOut ?? 0) + amount),
                personId: currentUser.id,
                person: currentUser.name || currentUser.email || currentUser.id,
                eventKey: existing?.eventKey ?? eventKey,
                event: existing?.event ?? (order ? `${order.eventType} · ${order.faction}${order.orderCode ? ` · ${order.orderCode}` : ''}` : tx.reason || t('Ohne Event', 'No event')),
                factionOrderId: tx.factionOrderId,
            });
        }
        return [...rows.values()].filter((row) => row.checkedOut > 0).sort((a, b) => b.checkedOut - a.checkedOut);
    }, [items, allTransactions, currentUser, t]);

    const totalUniqueCheckedOut = checkedOutRows.length;
    const totalUnitsCheckedOut = checkedOutRows.reduce((sum, r) => sum + r.checkedOut, 0);
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
            onError: (error) => {
                if (isOfflineQueuedError(error)) return;
                showSnackbar(t('Fehler beim Erfassen der Rückgabe', 'Could not record return'), 'error');
            }
        });
    }

    function handleDamageSubmit(data: DamageReportFormData) {
        createDamageReport.mutate(data, {
            onSuccess: () => {
                setDamageItem(null);
                showSnackbar(t('Schaden erfolgreich gemeldet', 'Damage reported successfully'), 'success');
            },
            onError: (error) => {
                if (isOfflineQueuedError(error)) return;
                showSnackbar(t('Schaden konnte nicht gemeldet werden', 'Could not report damage'), 'error');
            },
        });
    }

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 0.5, fontWeight: 700 }}>
                {t('Hallo', 'Hello')}, {currentUser?.name || t('Benutzer', 'User')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: { xs: 2, sm: 4 } }}>
                {t('Hier ist eine Übersicht Ihrer aktuellen Ausleihen und Aktivitäten.', 'Here is an overview of your current checkouts and activity.')}
            </Typography>

            <Stack direction="row" spacing={1.5} sx={{ mb: 3, display: { xs: 'flex', md: 'none' } }}>
                <Button fullWidth variant="outlined" color="success" size="large" startIcon={<AssignmentReturnIcon />} onClick={() => navigate('/checked-out')} sx={{ minHeight: 52 }}>
                    {t('Rückgabe', 'Return')}
                </Button>
            </Stack>

            {/* Personalized Metrics */}
            <Grid container spacing={{ xs: 1, sm: 2 }} sx={{ mb: { xs: 3, sm: 4 } }}>
                {metrics.map((metric) => (
                    <Grid size={{ xs: 6, sm: 6, md: 3 }} key={metric.label}>
                        <Paper sx={{ p: { xs: 1.5, sm: 2.5 }, minHeight: { xs: 142, sm: 'auto' }, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
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
            <Box
                sx={{
                    mb: 4,
                    '& a[href^="/items/"]': {
                        color: 'text.secondary',
                        '&:hover, &:visited': { color: 'text.secondary' },
                    },
                }}
            >
                <CheckedOutList
                    rows={checkedOutRows}
                    assemblies={assemblies}
                    showPerson={false}
                    linkToItem
                    onQuickReturn={(row) => {
                        const item = items?.find((i) => i.id === row.itemId);
                        if (item) setReturnItem({ item, quantity: row.checkedOut });
                    }}
                    onDamageReport={(row) => {
                        const item = items?.find((i) => i.id === row.itemId);
                        if (item) setDamageItem({ item, quantity: row.checkedOut });
                    }}
                    returnPending={createTransaction.isPending}
                />
            </Box>

            {/* My Recent Activity */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {t('Meine kürzlichen Transaktionen', 'My recent transactions')}
                </Typography>
            </Box>
            <TransactionHistory
                transactions={userTransactions.slice(0, 5)}
                items={items}
                users={users}
                isLoading={txLoading || itemsLoading}
            />

            {/* Quick Return Dialog */}
            <Dialog
                open={Boolean(returnItem)}
                onClose={() => setReturnItem(null)}
                keepMounted
                maxWidth="sm"
                fullWidth
                fullScreen={isMobile}
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

            <Dialog open={Boolean(damageItem)} onClose={() => setDamageItem(null)} keepMounted maxWidth="sm" fullWidth fullScreen={isMobile}>
                <DialogTitle>{t(`Schaden an ${damageItem?.item.name ?? ''} melden`, `Report damage to ${damageItem?.item.name ?? ''}`)}</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    {damageItem && (
                        <DamageReportForm
                            key={damageItem.item.id}
                            items={items ?? []}
                            preselectedItemId={damageItem.item.id}
                            maxAmount={damageItem.quantity}
                            onSubmit={handleDamageSubmit}
                            isLoading={createDamageReport.isPending}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
}
