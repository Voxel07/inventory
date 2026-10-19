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
import { useAppLanguage, useT } from '../utils/naming';
import { Contributor } from './Contributor';
import { TeamOverview } from './TeamOverview';

const WORK_PAGE = 5;

/** Overview: the user's open work first, then secondary personal or team summaries. */
export function UserDashboard() {
    const t = useT();
    const { user } = useAuth();
    const [params, setParams] = useSearchParams();
    const manager = canManageInventory(user);
    const scope = manager && params.get('scope') === 'team' ? 'team' : 'mine';

    return <Box>
        <PageHeader
            title={t('common.overview')}
            description={user?.name ? t('pages.userDashboard.helloName', { name: String(user.name) }) : undefined}
            actions={manager && <ToggleButtonGroup exclusive size="small" value={scope} aria-label={t('pages.userDashboard.overviewScope')}
                onChange={(_, value: string | null) => { if (value) setParams((current) => { if (value === 'team') current.set('scope', 'team'); else current.delete('scope'); return current; }); }}>
                <ToggleButton value="mine">{t('pages.userDashboard.mine')}</ToggleButton>
                <ToggleButton value="team">{t('pages.userDashboard.wholeInventory')}</ToggleButton>
            </ToggleButtonGroup>}
        />
        {!canViewOrganization(user) ? <TenantOverview /> : scope === 'team' ? <TeamOverview /> : <PersonalOverview />}
    </Box>;
}

/** Tenants manage only their private inventory: requests for items they offered, their items, buildings and groups. */
function TenantOverview() {
    const t = useT();
    return <Stack spacing={3}>
        <WorkQueue />
        <Paper component="section" aria-labelledby="overview-private" sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography id="overview-private" variant="h6" component="h2" sx={{ mb: 1 }}>{t('pages.userDashboard.myPrivateInventory')}</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>{t('pages.userDashboard.createYourRentedStorageLocationShareItWithAGroup')}</Typography>
            <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" component={RouterLink} to="/items" startIcon={<Inventory2OutlinedIcon />}>{t('pages.userDashboard.myItems')}</Button>
                <Button variant="outlined" component={RouterLink} to="/storage-locations" startIcon={<WarehouseOutlinedIcon />}>{t('pages.userDashboard.myStorageLocations')}</Button>
                <Button variant="outlined" component={RouterLink} to="/sharing" startIcon={<GroupsOutlinedIcon />}>{t('common.sharingGroups')}</Button>
            </Stack>
        </Paper>
    </Stack>;
}

function PersonalOverview() {
    const t = useT();
    return <Stack spacing={3}>
        <WorkQueue />

        <Paper component="section" aria-labelledby="overview-equipment" sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography id="overview-equipment" variant="h6" component="h2" sx={{ mb: 1 }}>{t('pages.userDashboard.myEquipmentPickups')}</Typography>
            <Contributor embedded />
        </Paper>
    </Stack>;
}

type WorkRow = { id: string; title: string; detail: string; due?: string; label: string; urgent: boolean; path?: string; notice: boolean };

/** Ready pickups, overdue returns, pending reviews and upcoming maintenance, as the server filters them by role. */
function WorkQueue() {
    const t = useT();
    const language = useAppLanguage();
    const navigate = useNavigate();
    const theme = useTheme();
    const compact = useCompactCatalog();
    const narrowTable = useMediaQuery(theme.breakpoints.down('lg'));
    const inbox = useActionInbox();
    const notices = usePickupNotifications();
    const { openActionInbox } = useActionInboxDialog();
    const [visibleCount, setVisibleCount] = useState(WORK_PAGE);
    const labels: Record<string, string> = { pickup: t('common.pickup'), overdue_return: t('pages.userDashboard.returnOverdue'), acknowledgement: t('pages.userDashboard.reviewReturn'), receipt: t('pages.userDashboard.receipt'), expiring_lot: t('pages.userDashboard.expiringLot'), maintenance: t('enum.reason.maintenance'), damage: t('common.damage'), collection: t('pages.userDashboard.collect'), provider_return: t('pages.userDashboard.returnToProvider') };
    const now = inbox.dataUpdatedAt;
    const due = (inbox.data ?? []).filter((action) => !action.remindAt || Date.parse(action.remindAt) <= now);
    const rows: WorkRow[] = [
        ...notices.unread.map((notification) => ({
            id: notification.id,
            title: notificationTitle(notification),
            detail: noticeDetails(notification),
            label: notification.type === 'item_requested' ? t('pages.userDashboard.request') : notification.type === 'action_reminder' || notification.type === 'action_digest' ? t('review.taskReminder') : labels.pickup, urgent: false,
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
        { field: 'title', headerName: t('pages.userDashboard.task'), flex: 1.5, minWidth: 200,
            renderCell: ({ row }) => <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'normal', lineHeight: 1.3 }}>{row.title}</Typography>
                {narrowTable && row.detail && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'normal' }}>{row.detail}</Typography>}
            </Box> },
        { field: 'label', headerName: t('common.type'), width: 170,
            renderCell: ({ row }) => <Chip size="small" variant="outlined" color={row.urgent ? 'error' : 'default'} label={row.label} /> },
        { field: 'detail', headerName: t('common.details'), flex: 1, minWidth: 160,
            renderCell: ({ row }) => <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'normal', lineHeight: 1.3 }}>{row.detail || '—'}</Typography> },
        { field: 'due', headerName: t('common.due'), width: 120,
            renderCell: ({ row }) => <Typography variant="body2" className="tabular" sx={{ color: row.urgent ? 'error.main' : undefined, fontWeight: row.urgent ? 600 : undefined }}>{dueText(row)}</Typography> },
    ];

    const list = compact ? <>
        <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }} aria-label={t('common.tasks')}>
            {rows.slice(0, visibleCount).map((row) => <CatalogRow key={row.id} to={row.path ?? '#'} title={row.title}
                onClick={() => { if (row.notice) notices.markRead.mutate([row.id]); }}
                primary={<Box component="span" sx={{ color: row.urgent ? 'error.main' : 'text.secondary', fontWeight: 600 }}>
                    {row.label}{row.due ? ` · ${t('common.due')}: ${dueText(row)}` : ''}
                </Box>}
                secondary={row.detail || undefined} />)}
        </Paper>
        {rows.length > visibleCount && <Button fullWidth variant="outlined" sx={{ mt: 1.5 }} onClick={() => setVisibleCount((count) => count + WORK_PAGE)}>
            {t('common.showMoreRemainingCountRemaining', { remainingCount: String(rows.length - visibleCount) })}
        </Button>}
    </> : <DataGrid rows={rows} columns={columns} columnVisibilityModel={{ detail: !narrowTable }}
        density="compact" getRowHeight={() => 'auto'} autoHeight disableRowSelectionOnClick hideFooter={rows.length <= WORK_PAGE}
        onRowClick={({ row }) => open(row)}
        initialState={{ pagination: { paginationModel: { page: 0, pageSize: WORK_PAGE } } }} pageSizeOptions={[WORK_PAGE, 10, 25]}
        localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
        sx={catalogGridSx} />;

    return <Paper component="section" aria-labelledby="overview-work" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
            <Typography id="overview-work" variant="h6" component="h2">{t('pages.userDashboard.toDo')}{!loading && rows.length > 0 ? ` (${rows.length})` : ''}</Typography>
            {rows.length > 0 && <Button onClick={openActionInbox} aria-haspopup="dialog">{t('pages.userDashboard.openInbox')}</Button>}
        </Stack>
        {loading && <LinearProgress aria-label={t('pages.userDashboard.loadingTasks')} />}
        {failed && <StateMessage compact kind="error" title={t('pages.userDashboard.couldNotLoadYourTasks')}
            description={t('common.checkYourConnectionAndTryAgain')}
            action={<Button variant="outlined" onClick={() => { void inbox.refetch(); void notices.refetch(); }}>{t('common.tryAgain')}</Button>} />}
        {!loading && !failed && rows.length === 0 && <StateMessage compact kind="done" title={t('pages.userDashboard.allCaughtUp')}
            description={t('pages.userDashboard.newPickupsReturnsAndReviewsWillAppearHere')} />}
        {rows.length > 0 && list}
    </Paper>;
}
