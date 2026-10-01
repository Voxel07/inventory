import { Alert, Box, Grid, Paper, Stack, Tabs, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { Button, Tab } from '../components/shared/ActionButtons';
import { TransactionHistory } from '../components/lists/TransactionHistory';
import { useAuth } from '../hooks/useAuth';
import { useMember } from '../hooks/useMember';
import { useItems } from '../hooks/useItems';
import { useTransactions } from '../hooks/useTransactions';
import { canManageInventory, canViewCatalog } from '../utils/access';
import { useLocalizedText } from '../utils/naming';
import { Items } from './Items';
import { Assemblies } from './Assemblies';
import { Contributor } from './Contributor';

export function UserDashboard() {
    const t = useLocalizedText();
    const { user } = useAuth();
    const { custody, stored, requests } = useMember();
    const [params, setParams] = useSearchParams();
    const catalog = canViewCatalog(user);
    const manager = canManageInventory(user);
    const tabs = [
        ...(catalog ? [
            { value: 'items', label: t('Artikel', 'Items') },
            { value: 'assemblies', label: t('Baugruppen', 'Assemblies') },
        ] : []),
        { value: 'equipment', label: t('Meine Ausrüstung & Abholungen', 'My equipment & pickups') },
        ...(manager ? [{ value: 'activity', label: t('Meine Aktivitäten', 'My activity') }] : []),
    ];
    const requestedTab = params.get('tab');
    const tab = tabs.find((entry) => entry.value === requestedTab)?.value ?? tabs[0].value;
    const metrics = [
        { label: t('Meine ausgeliehenen Artikel', 'My checked-out items'), value: custody.isLoading || custody.isError ? '—' : custody.data?.length ?? 0 },
        { label: t('Einheiten insgesamt ausgeliehen', 'Total units checked out'), value: custody.isLoading || custody.isError ? '—' : custody.data?.reduce((sum, row) => sum + row.checkedOut, 0) ?? 0 },
        { label: t('Bei mir gelagerte Einheiten', 'Units stored with me'), value: stored.isLoading || stored.isError ? '—' : stored.data?.reduce((sum, row) => sum + row.quantity, 0) ?? 0 },
        { label: t('Offene Meldungen & Absprachen', 'Open reports & coordination'), value: requests.isLoading || requests.isError ? '—' : requests.data?.filter((row) => row.status !== 'resolved').length ?? 0 },
    ];
    const error = custody.error || stored.error || requests.error;

    return <Stack spacing={3}>
        <Box>
            <Typography variant="h4">{t('Mein Dashboard', 'My dashboard')}</Typography>
            <Typography color="text.secondary">{t('Hallo', 'Hello')}, {user?.name}</Typography>
        </Box>
        {error && <Alert severity="error" action={<Button onClick={() => { void custody.refetch(); void stored.refetch(); void requests.refetch(); }}>{t('Erneut laden', 'Retry')}</Button>}>{error.message}</Alert>}
        <Grid container spacing={2}>
            {metrics.map((metric) => <Grid key={metric.label} size={{ xs: 6, md: 3 }}>
                <Paper sx={{ p: 2, height: '100%', textAlign: 'center' }}>
                    <Typography variant="h4">{metric.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{metric.label}</Typography>
                </Paper>
            </Grid>)}
        </Grid>
        <Tabs value={tab} onChange={(_, value: string) => setParams((current) => { current.set('tab', value); return current; })}
            variant="scrollable" scrollButtons="auto" aria-label={t('Dashboard-Bereiche', 'Dashboard sections')}>
            {tabs.map((entry) => <Tab key={entry.value} value={entry.value} label={entry.label} id={`dashboard-tab-${entry.value}`} aria-controls={`dashboard-panel-${entry.value}`} />)}
        </Tabs>
        <Box role="tabpanel" id={`dashboard-panel-${tab}`} aria-labelledby={`dashboard-tab-${tab}`}>
            {tab === 'items' && <Items showAllEvents />}
            {tab === 'assemblies' && <Assemblies />}
            {tab === 'equipment' && <Contributor />}
            {tab === 'activity' && <PersonalActivity />}
        </Box>
    </Stack>;
}

function PersonalActivity() {
    const t = useLocalizedText();
    const { user } = useAuth();
    const transactions = useTransactions({ userId: user?.id });
    const items = useItems();
    return <Stack spacing={2}>
        <Typography variant="h6">{t('Meine kürzlichen Transaktionen', 'My recent transactions')}</Typography>
        {(transactions.isError || items.isError) && <Alert severity="error" action={<Button onClick={() => { void transactions.refetch(); void items.refetch(); }}>{t('Erneut laden', 'Retry')}</Button>}>{t('Aktivitäten konnten nicht vollständig geladen werden.', 'Could not load all activity.')}</Alert>}
        <TransactionHistory transactions={transactions.data?.slice(0, 5)} items={items.data} users={user ? [user] : []}
            isLoading={transactions.isLoading || items.isLoading} />
    </Stack>;
}
