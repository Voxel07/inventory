import { Box, Chip, LinearProgress, Paper, Stack, ToggleButtonGroup, Typography } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { Button, ToggleButton } from '../components/shared/ActionButtons';
import { PageHeader } from '../components/shared/PageHeader';
import { StateMessage } from '../components/common/StateMessage';
import { Fact, FactList } from '../components/items/DetailSection';
import { TransactionHistory } from '../components/lists/TransactionHistory';
import { useAuth } from '../hooks/useAuth';
import { useMember } from '../hooks/useMember';
import { useItems } from '../hooks/useItems';
import { useTransactions } from '../hooks/useTransactions';
import { useActionInbox } from '../hooks/useActionInbox';
import { useActionInboxDialog } from '../hooks/useActionInboxDialog';
import { noticeText, usePickupNotifications } from '../hooks/useInbox';
import { canManageInventory, canViewCatalog } from '../utils/access';
import { useLocalizedText } from '../utils/naming';
import { Contributor } from './Contributor';
import { TeamOverview } from './TeamOverview';

const WORK_PREVIEW = 6;

/** Overview: the user's open work first, then secondary personal or team summaries. */
export function UserDashboard() {
    const t = useLocalizedText();
    const { user } = useAuth();
    const [params, setParams] = useSearchParams();
    const manager = canManageInventory(user);
    const scope = manager && params.get('scope') === 'team' ? 'team' : 'mine';

    return <Box>
        <PageHeader
            title={t('Übersicht', 'Overview')}
            description={user?.name ? t(`Hallo ${user.name}`, `Hello ${user.name}`) : undefined}
            actions={manager && <ToggleButtonGroup exclusive size="small" value={scope} aria-label={t('Umfang der Übersicht', 'Overview scope')}
                onChange={(_, value: string | null) => { if (value) setParams((current) => { if (value === 'team') current.set('scope', 'team'); else current.delete('scope'); return current; }); }}>
                <ToggleButton value="mine">{t('Meine', 'Mine')}</ToggleButton>
                <ToggleButton value="team">{t('Lager gesamt', 'Whole inventory')}</ToggleButton>
            </ToggleButtonGroup>}
        />
        {scope === 'team' ? <TeamOverview /> : <PersonalOverview />}
    </Box>;
}

function PersonalOverview() {
    const t = useLocalizedText();
    const { user } = useAuth();
    const { custody, stored, requests } = useMember();
    const catalog = canViewCatalog(user);
    const manager = canManageInventory(user);
    const value = (query: { isLoading: boolean; isError: boolean }, compute: () => number) => query.isLoading ? '…' : query.isError ? '—' : compute();

    return <Stack spacing={3}>
        <WorkQueue />

        <Paper component="section" aria-labelledby="overview-summary" sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography id="overview-summary" variant="h6" component="h2" sx={{ mb: 2 }}>{t('Auf einen Blick', 'At a glance')}</Typography>
            <FactList>
                <Fact label={t('Bei mir ausgeliehen', 'Checked out to me')}>{value(custody, () => custody.data?.reduce((sum, row) => sum + row.checkedOut, 0) ?? 0)}</Fact>
                <Fact label={t('Bei mir gelagert', 'Stored with me')}>{value(stored, () => stored.data?.reduce((sum, row) => sum + row.quantity, 0) ?? 0)}</Fact>
                <Fact label={t('Offene Meldungen', 'Open reports')}>{value(requests, () => requests.data?.filter((row) => row.status !== 'resolved').length ?? 0)}</Fact>
            </FactList>
            <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', mt: 2.5 }}>
                {catalog && <Button variant="outlined" component={RouterLink} to="/items" startIcon={<Inventory2OutlinedIcon />}>{t('Katalog durchsuchen', 'Browse catalog')}</Button>}
                {catalog && <Button variant="outlined" component={RouterLink} to="/items?scope=mine" startIcon={<PersonOutlineIcon />}>{t('Meine Artikel', 'My items')}</Button>}
                <Button variant="outlined" component={RouterLink} to="/orders" startIcon={<ReceiptLongOutlinedIcon />}>{t('Bestellungen', 'Orders')}</Button>
            </Stack>
        </Paper>

        <Paper component="section" aria-labelledby="overview-equipment" sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography id="overview-equipment" variant="h6" component="h2" sx={{ mb: 1 }}>{t('Meine Ausrüstung & Abholungen', 'My equipment & pickups')}</Typography>
            <Contributor embedded />
        </Paper>

        {manager && <PersonalActivity />}
    </Stack>;
}

/** Ready pickups, overdue custody, pending reviews and upcoming maintenance, as the server filters them by role. */
function WorkQueue() {
    const t = useLocalizedText();
    const inbox = useActionInbox();
    const notices = usePickupNotifications();
    const { openActionInbox } = useActionInboxDialog();
    const labels: Record<string, string> = { pickup: t('Abholung', 'Pickup'), overdue_return: t('Überfällig', 'Overdue'), acknowledgement: t('Rückgabe prüfen', 'Review return'), receipt: t('Wareneingang', 'Receipt'), expiring_lot: t('Charge läuft ab', 'Expiring lot'), maintenance: t('Wartung', 'Maintenance'), damage: t('Schaden', 'Damage'), collection: t('Abholen', 'Collect'), provider_return: t('Zurückgeben', 'Return to provider') };
    const now = inbox.dataUpdatedAt;
    const due = (inbox.data ?? []).filter((action) => !action.remindAt || Date.parse(action.remindAt) <= now);
    const work = [
        ...notices.unread.map((notification) => ({
            key: notification.id,
            title: noticeText(notification, 'orderCode') ? t(`Bestellung ${noticeText(notification, 'orderCode')} ist abholbereit`, `Order ${noticeText(notification, 'orderCode')} is ready for pickup`) : t('Bestellung ist abholbereit', 'Order is ready for pickup'),
            detail: [noticeText(notification, 'faction'), noticeText(notification, 'pickupLocation')].filter(Boolean).join(' · '),
            label: labels.pickup, urgent: false,
            path: notification.orderId ? `/orders/faction/${notification.orderId}` : undefined,
        })),
        ...due.map((action) => ({ key: action.key, title: action.title, detail: [action.detail, action.due && `${t('Fällig', 'Due')}: ${action.due}`].filter(Boolean).join(' · '), label: labels[action.kind] ?? action.kind, urgent: action.kind === 'overdue_return', path: action.path })),
    ].sort((a, b) => Number(b.urgent) - Number(a.urgent));
    const loading = inbox.isLoading || notices.isLoading;
    const failed = inbox.isError || notices.isError;

    return <Paper component="section" aria-labelledby="overview-work" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
            <Typography id="overview-work" variant="h6" component="h2">{t('Zu erledigen', 'To do')}{!loading && work.length > 0 ? ` (${work.length})` : ''}</Typography>
            {work.length > 0 && <Button onClick={openActionInbox} aria-haspopup="dialog">{t('Posteingang öffnen', 'Open inbox')}</Button>}
        </Stack>
        {loading && <LinearProgress aria-label={t('Aufgaben werden geladen', 'Loading tasks')} />}
        {failed && <StateMessage compact kind="error" title={t('Aufgaben konnten nicht geladen werden', 'Could not load your tasks')}
            description={t('Prüfe die Verbindung und versuche es erneut.', 'Check your connection and try again.')}
            action={<Button variant="outlined" onClick={() => { void inbox.refetch(); void notices.refetch(); }}>{t('Erneut versuchen', 'Try again')}</Button>} />}
        {!loading && !failed && work.length === 0 && <StateMessage compact kind="done" title={t('Alles erledigt', 'All caught up')}
            description={t('Neue Abholungen, Rückgaben und Prüfungen erscheinen hier.', 'New pickups, returns and reviews will appear here.')} />}
        {work.length > 0 && <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {work.slice(0, WORK_PREVIEW).map((entry) => <Box component="li" key={entry.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" useFlexGap sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 600 }}>{entry.title}</Typography>
                        <Chip size="small" variant="outlined" color={entry.urgent ? 'error' : 'default'} label={entry.label} />
                    </Stack>
                    {entry.detail && <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{entry.detail}</Typography>}
                </Box>
                {entry.path && <Button variant="outlined" component={RouterLink} to={entry.path} onClick={() => { if (!due.some((action) => action.key === entry.key)) notices.markRead.mutate([entry.key]); }}>{t('Öffnen', 'Open')}</Button>}
            </Box>)}
        </Box>}
        {work.length > WORK_PREVIEW && <Button onClick={openActionInbox} sx={{ mt: 1 }}>{t(`Alle ${work.length} anzeigen`, `Show all ${work.length}`)}</Button>}
    </Paper>;
}

function PersonalActivity() {
    const t = useLocalizedText();
    const { user } = useAuth();
    const transactions = useTransactions({ userId: user?.id });
    const items = useItems();
    return <Paper component="section" aria-labelledby="overview-activity" sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography id="overview-activity" variant="h6" component="h2" sx={{ mb: 1.5 }}>{t('Meine letzten Buchungen', 'My recent transactions')}</Typography>
        {(transactions.isError || items.isError)
            ? <StateMessage compact kind="error" title={t('Aktivitäten konnten nicht geladen werden', 'Could not load your activity')}
                action={<Button variant="outlined" onClick={() => { void transactions.refetch(); void items.refetch(); }}>{t('Erneut versuchen', 'Try again')}</Button>} />
            : <TransactionHistory transactions={transactions.data?.slice(0, 5)} items={items.data} users={user ? [user] : []}
                isLoading={transactions.isLoading || items.isLoading} />}
    </Paper>;
}
