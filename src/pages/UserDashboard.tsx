import { Button } from '../components/shared/ActionButtons';
import { useCustodyBalances } from '../hooks/useCustodyBalances';
import { Dialog } from '../components/shared/ClosableDialog';
import { useState } from 'react';
import {
    Box,
    Typography,
    Grid,
    Paper,
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
import { useTransactions } from '../hooks/useTransactions';
import { useDamageReports, useCreateDamageReport } from '../hooks/useDamageReports';
import { useAssemblies } from '../hooks/useAssemblies';
import { useAuth } from '../hooks/useAuth';
import { useUsers } from '../hooks/useUsers';
import { useUIStore } from '../store/uiStore';
import { TransactionHistory } from '../components/lists/TransactionHistory';
import { ReturnSubmissionForm } from '../components/forms/ReturnSubmissionForm';
import { DamageReportForm } from '../components/forms/DamageReportForm';
import { CheckedOutList } from '../components/lists/CheckedOutList';
import type { CheckedOutRow } from '../types/custody';
import type { DamageReportFormData, Item, ReturnSubmissionFormData } from '../types';
import { translate, useLocalizedText } from '../utils/naming';
import { isOfflineQueuedError } from '../utils/offline';
import { useCreateReturnSubmission } from '../hooks/useReturnSubmissions';

export function UserDashboard() {
    const t = useLocalizedText();
    const custody = useCustodyBalances(true);
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const { user: currentUser } = useAuth();
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    const { data: items, isLoading: itemsPending, isComplete: itemsComplete, isError: itemsError, refetch: refetchItems } = useItems();
    const { data: allTransactions, isLoading: txPending, isComplete: txComplete, isError: txError, refetch: refetchTransactions } = useTransactions();
    const itemsLoading = itemsPending || !itemsComplete;
    const txLoading = txPending || !txComplete;
    const { data: damageReports } = useDamageReports();
    const { data: assemblies } = useAssemblies();
    const { data: users } = useUsers();
    const createReturn = useCreateReturnSubmission();
    const createDamageReport = useCreateDamageReport();

    const [returnItem, setReturnItem] = useState<{ item: Item; quantity: number; factionOrderId?: string; assetInstanceId?: string; eventOccurrenceId?: string } | null>(null);
    const [damageItem, setDamageItem] = useState<{ item: Item; quantity: number } | null>(null);

    // 1. Transactions belonging to this user
    const userTransactions = (() => {
        if (!allTransactions || !currentUser) return [];
        return allTransactions.filter((tx) => tx.userId === currentUser.id);
    })();

    // 2. Build CheckedOutRow format for the shared component and metrics
    const checkedOutRows: CheckedOutRow[] = custody.data ?? [];

    const totalUniqueCheckedOut = checkedOutRows.length;
    const totalUnitsCheckedOut = checkedOutRows.reduce((sum, r) => sum + r.checkedOut, 0);
    const totalUserTransactionsCount = userTransactions.length;
    const userDamageReportsCount = (() => {
        if (!damageReports || !currentUser) return 0;
        return damageReports.filter((r) => r.reportedBy === currentUser.id && (r.status === 'reported' || r.status === 'in_review')).length;
    })();

    const metrics = [
        { label: t('Meine ausgeliehenen Artikel', 'My checked-out items'), value: totalUniqueCheckedOut, icon: <ShoppingBagIcon />, color: '#7c4dff' },
        { label: t('Einheiten insgesamt ausgeliehen', 'Total units checked out'), value: totalUnitsCheckedOut, icon: <AssignmentReturnIcon />, color: '#00e676' },
        { label: t('Meine Protokolle', 'My records'), value: totalUserTransactionsCount, icon: <ListAltIcon />, color: '#448aff' },
        { label: t('Meine offenen Schadensberichte', 'My open damage reports'), value: userDamageReportsCount, icon: <ReportProblemIcon />, color: '#ff5252' },
    ];

    function handleReturnSubmit(data: ReturnSubmissionFormData) {
        createReturn.mutate(data, {
            onSuccess: () => {
                setReturnItem(null);
                showSnackbar(t('Rückgabe wartet auf Bestätigung', 'Return is awaiting acknowledgement'), 'success');
            },
            onError: () => showSnackbar(t('Fehler beim Erfassen der Rückgabe', 'Could not submit return'), 'error'),
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

    if (itemsError || txError || custody.isError) return <Paper sx={{ p: 3 }}>
        <Typography>{t('Die vollständige Übersicht konnte nicht geladen werden.', 'Could not load the complete overview.')}</Typography>
        <Button title={translate('Die Daten erneut laden', 'Retry loading the data')} onClick={() => { void refetchItems(); void custody.refetch(); void refetchTransactions(); }}>{t('Erneut versuchen', 'Retry')}</Button>
    </Paper>;
    if (itemsLoading || txLoading || custody.isLoading) return <Paper sx={{ p: 3 }}><Typography>{t('Übersicht wird geladen…', 'Loading overview…')}</Typography></Paper>;

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 0.5, fontWeight: 700 }}>
                {t('Hallo', 'Hello')}, {currentUser?.name || t('Benutzer', 'User')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: { xs: 2, sm: 4 } }}>
                {t('Hier ist eine Übersicht Ihrer aktuellen Ausleihen und Aktivitäten.', 'Here is an overview of your current checkouts and activity.')}
            </Typography>

            <Stack direction="row" spacing={1.5} sx={{ mb: 3, display: { xs: 'flex', md: 'none' } }}>
                <Button title={translate('Ausgeliehene Artikel für die Rückgabe anzeigen', 'Display checked-out items for return')} fullWidth variant="outlined" color="success" size="large" startIcon={<AssignmentReturnIcon />} onClick={() => navigate('/checked-out')} sx={{ minHeight: 52 }}>
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
                        if (row.generalOrderId) { navigate('/orders?tab=general'); return; }
                        if (row.factionOrderId) { navigate(`/orders/faction/${row.factionOrderId}`); return; }
                        const item = items?.find((i) => i.id === row.itemId);
                        if (item) setReturnItem({ item, quantity: row.checkedOut - (row.pendingQuantity ?? 0), eventOccurrenceId: row.eventOccurrenceId, factionOrderId: row.factionOrderId, assetInstanceId: row.assetInstanceId });
                    }}
                    onDamageReport={(row) => {
                        const item = items?.find((i) => i.id === row.itemId);
                        if (item) setDamageItem({ item, quantity: row.checkedOut });
                    }}
                    returnPending={createReturn.isPending}
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
                        <ReturnSubmissionForm
                            item={returnItem.item}
                            maxQuantity={returnItem.quantity}
                            eventOccurrenceId={returnItem.eventOccurrenceId}
                            assetInstanceId={returnItem.assetInstanceId}
                            returnedForUserId={currentUser?.id}
                            factionOrderId={returnItem.factionOrderId}
                            onSubmit={handleReturnSubmit}
                            isLoading={createReturn.isPending}
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
