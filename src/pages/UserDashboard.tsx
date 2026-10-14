import { useState } from 'react';
import { Box, Chip, LinearProgress, Paper, Stack, ToggleButtonGroup, Typography, useMediaQuery, useTheme } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { Button, ToggleButton } from '../components/shared/ActionButtons';
import { PageHeader } from '../components/shared/PageHeader';
import { StateMessage } from '../components/common/StateMessage';
import { CatalogRow } from '../components/lists/CatalogParts';
import { catalogGridSx } from '../components/lists/catalogGrid';
import { useAuth } from '../hooks/useAuth';
import { useCompactCatalog } from '../hooks/useCompactCatalog';
import { useActionInbox } from '../hooks/useActionInbox';
import { useActionInboxDialog } from '../hooks/useActionInboxDialog';
import { noticeDetails, notificationPath, notificationTitle, usePickupNotifications } from '../hooks/useInbox';
import { canManageInventory, canViewOrganization } from '../utils/access';
import { formatDate } from '../utils/dateFormat';
import { useAppLanguage, useLocalizedText } from '../utils/naming';
import { Contributor } from './Contributor';
import { TeamOverview } from './TeamOverview';

const WORK_PAGE = 5;

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
        {!canViewOrganization(user) ? <TenantOverview /> : scope === 'team' ? <TeamOverview /> : <PersonalOverview />}
    </Box>;
}

/** Tenants manage only their private inventory: requests for items they offered, their items, buildings and groups. */
function TenantOverview() {
    const t = useLocalizedText();
    return <Stack spacing={3}>
        <WorkQueue />
        <Paper component="section" aria-labelledby="overview-private" sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography id="overview-private" variant="h6" component="h2" sx={{ mb: 1 }}>{t('Meine privaten Sachen', 'My private inventory')}</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>{t(
                'Lege deinen gemieteten Lagerort an, gib ihn für eine Gruppe frei und alles, was dort lagert, wird für die Gruppe sichtbar. Artikel, die du zur Nutzung anbietest, können andere anfragen.',
                'Create your rented storage location, share it with a group and everything stored there becomes visible to that group. Others can request items you offer for use.')}</Typography>
            <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" component={RouterLink} to="/items" startIcon={<Inventory2OutlinedIcon />}>{t('Meine Artikel', 'My items')}</Button>
                <Button variant="outlined" component={RouterLink} to="/storage-locations" startIcon={<WarehouseOutlinedIcon />}>{t('Meine Lagerorte', 'My storage locations')}</Button>
                <Button variant="outlined" component={RouterLink} to="/sharing" startIcon={<GroupsOutlinedIcon />}>{t('Freigabegruppen', 'Sharing groups')}</Button>
            </Stack>
        </Paper>
    </Stack>;
}

function PersonalOverview() {
    const t = useLocalizedText();
    return <Stack spacing={3}>
        <WorkQueue />

        <Paper component="section" aria-labelledby="overview-equipment" sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography id="overview-equipment" variant="h6" component="h2" sx={{ mb: 1 }}>{t('Meine Ausrüstung & Abholungen', 'My equipment & pickups')}</Typography>
            <Contributor embedded />
        </Paper>
    </Stack>;
}

type WorkRow = { id: string; title: string; detail: string; due?: string; label: string; urgent: boolean; path?: string; notice: boolean };

/** Ready pickups, overdue returns, pending reviews and upcoming maintenance, as the server filters them by role. */
function WorkQueue() {
    const t = useLocalizedText();
    const language = useAppLanguage();
    const navigate = useNavigate();
    const theme = useTheme();
    const compact = useCompactCatalog();
    const narrowTable = useMediaQuery(theme.breakpoints.down('lg'));
    const inbox = useActionInbox();
    const notices = usePickupNotifications();
    const { openActionInbox } = useActionInboxDialog();
    const [visibleCount, setVisibleCount] = useState(WORK_PAGE);
    const labels: Record<string, string> = { pickup: t('Abholung', 'Pickup'), overdue_return: t('Rückgabe überfällig', 'Return overdue'), acknowledgement: t('Rückgabe prüfen', 'Review return'), receipt: t('Wareneingang', 'Receipt'), expiring_lot: t('Charge läuft ab', 'Expiring lot'), maintenance: t('Wartung', 'Maintenance'), damage: t('Schaden', 'Damage'), collection: t('Abholen', 'Collect'), provider_return: t('Zurückgeben', 'Return to provider') };
    const now = inbox.dataUpdatedAt;
    const due = (inbox.data ?? []).filter((action) => !action.remindAt || Date.parse(action.remindAt) <= now);
    const rows: WorkRow[] = [
        ...notices.unread.map((notification) => ({
            id: notification.id,
            title: notificationTitle(notification),
            detail: noticeDetails(notification),
            label: notification.type === 'item_requested' ? t('Anfrage', 'Request') : labels.pickup, urgent: false,
            path: notificationPath(notification), notice: true,
        })),
        ...due.map((action) => ({ id: action.key, title: action.title, detail: action.detail ?? '', due: action.due, label: labels[action.kind] ?? action.kind, urgent: action.kind === 'overdue_return', path: action.path, notice: false })),
    ].sort((a, b) => Number(b.urgent) - Number(a.urgent));
    const loading = inbox.isLoading || notices.isLoading;
    const failed = inbox.isError || notices.isError;

    function open(row: WorkRow) {
        if (row.notice) notices.markRead.mutate([row.id]);
        if (row.path) navigate(row.path);
    }
    const dueText = (row: WorkRow) => row.due ? formatDate(row.due) : '—';

    const columns: GridColDef<WorkRow>[] = [
        { field: 'title', headerName: t('Aufgabe', 'Task'), flex: 1.5, minWidth: 200,
            renderCell: ({ row }) => <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'normal', lineHeight: 1.3 }}>{row.title}</Typography>
                {narrowTable && row.detail && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'normal' }}>{row.detail}</Typography>}
            </Box> },
        { field: 'label', headerName: t('Typ', 'Type'), width: 170,
            renderCell: ({ row }) => <Chip size="small" variant="outlined" color={row.urgent ? 'error' : 'default'} label={row.label} /> },
        { field: 'detail', headerName: t('Details', 'Details'), flex: 1, minWidth: 160,
            renderCell: ({ row }) => <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'normal', lineHeight: 1.3 }}>{row.detail || '—'}</Typography> },
        { field: 'due', headerName: t('Fällig', 'Due'), width: 120,
            renderCell: ({ row }) => <Typography variant="body2" className="tabular" sx={{ color: row.urgent ? 'error.main' : undefined, fontWeight: row.urgent ? 600 : undefined }}>{dueText(row)}</Typography> },
    ];

    const list = compact ? <>
        <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }} aria-label={t('Aufgaben', 'Tasks')}>
            {rows.slice(0, visibleCount).map((row) => <CatalogRow key={row.id} to={row.path ?? '#'} title={row.title}
                onClick={() => { if (row.notice) notices.markRead.mutate([row.id]); }}
                primary={<Box component="span" sx={{ color: row.urgent ? 'error.main' : 'text.secondary', fontWeight: 600 }}>
                    {row.label}{row.due ? ` · ${t('Fällig', 'Due')}: ${dueText(row)}` : ''}
                </Box>}
                secondary={row.detail || undefined} />)}
        </Paper>
        {rows.length > visibleCount && <Button fullWidth variant="outlined" sx={{ mt: 1.5 }} onClick={() => setVisibleCount((count) => count + WORK_PAGE)}>
            {t(`Weitere anzeigen (${rows.length - visibleCount} übrig)`, `Show more (${rows.length - visibleCount} remaining)`)}
        </Button>}
    </> : <DataGrid rows={rows} columns={columns} columnVisibilityModel={{ detail: !narrowTable }}
        density="compact" getRowHeight={() => 'auto'} autoHeight disableRowSelectionOnClick hideFooter={rows.length <= WORK_PAGE}
        onRowClick={({ row }) => open(row)}
        initialState={{ pagination: { paginationModel: { page: 0, pageSize: WORK_PAGE } } }} pageSizeOptions={[WORK_PAGE, 10, 25]}
        localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
        sx={catalogGridSx} />;

    return <Paper component="section" aria-labelledby="overview-work" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
            <Typography id="overview-work" variant="h6" component="h2">{t('Zu erledigen', 'To do')}{!loading && rows.length > 0 ? ` (${rows.length})` : ''}</Typography>
            {rows.length > 0 && <Button onClick={openActionInbox} aria-haspopup="dialog">{t('Posteingang öffnen', 'Open inbox')}</Button>}
        </Stack>
        {loading && <LinearProgress aria-label={t('Aufgaben werden geladen', 'Loading tasks')} />}
        {failed && <StateMessage compact kind="error" title={t('Aufgaben konnten nicht geladen werden', 'Could not load your tasks')}
            description={t('Prüfe die Verbindung und versuche es erneut.', 'Check your connection and try again.')}
            action={<Button variant="outlined" onClick={() => { void inbox.refetch(); void notices.refetch(); }}>{t('Erneut versuchen', 'Try again')}</Button>} />}
        {!loading && !failed && rows.length === 0 && <StateMessage compact kind="done" title={t('Alles erledigt', 'All caught up')}
            description={t('Neue Abholungen, Rückgaben und Prüfungen erscheinen hier.', 'New pickups, returns and reviews will appear here.')} />}
        {rows.length > 0 && list}
    </Paper>;
}
