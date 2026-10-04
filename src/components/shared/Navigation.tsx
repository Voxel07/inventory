import { ListItemButton, BottomNavigationAction } from './ActionButtons';
import {
    Badge,
    Drawer,
    List,
    ListItemIcon,
    ListItemText,
    ListSubheader,
    Toolbar,
    useMediaQuery,
    useTheme,
    Divider,
    Box,
    BottomNavigation,
    Paper,
    Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import RoomOutlinedIcon from '@mui/icons-material/RoomOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import OutputIcon from '@mui/icons-material/Output';
import AssignmentReturnOutlinedIcon from '@mui/icons-material/AssignmentReturnOutlined';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import HistoryIcon from '@mui/icons-material/History';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useAuth } from '../../hooks/useAuth';
import { useActionInboxDialog } from '../../hooks/useActionInboxDialog';
import { useInboxCount } from '../../hooks/useInbox';
import { LanguageSelector } from './LanguageSelector';
import { useT, useLocalizedText } from '../../utils/naming';
import { canAccessProcurement, canManageInventory, canManageUsers, canManagePurchasing, canOperateWarehouse, canPerformMaintenance, canViewCatalog } from '../../utils/access';
import type { User } from '../../types';

const DRAWER_WIDTH = 256;

type NavItem = { label: string; path: string; icon: ReactNode };
type NavGroup = { label: string; items: NavItem[] };

/** Destinations grouped by user task; each group appears only with at least one permitted entry. */
function useNavGroups(user: User | null | undefined): NavGroup[] {
    const t = useT();
    const text = useLocalizedText();
    const manager = canManageInventory(user);
    const catalog = manager || canViewCatalog(user);
    const operations = canOperateWarehouse(user) || canManagePurchasing(user) || canPerformMaintenance(user);
    const groups: NavGroup[] = [
        { label: text('Übersicht', 'Overview'), items: [
            { label: text('Start', 'Home'), path: '/', icon: <HomeOutlinedIcon /> },
        ] },
        { label: text('Inventar', 'Inventory'), items: catalog ? [
            { label: t('nav.items'), path: '/items', icon: <Inventory2OutlinedIcon /> },
            { label: t('nav.assemblies'), path: '/assemblies', icon: <CategoryOutlinedIcon /> },
            { label: text('Lagerorte', 'Locations'), path: '/storage-locations', icon: <RoomOutlinedIcon /> },
            ...(manager ? [{ label: text('Etiketten & QR-Codes', 'Labels & QR codes'), path: '/print-qr', icon: <QrCode2Icon /> }] : []),
        ] : [] },
        { label: text('Bestellungen & Rückgaben', 'Orders & returns'), items: [
            { label: t('nav.orders'), path: '/orders', icon: <ReceiptLongOutlinedIcon /> },
            ...(manager ? [
                { label: text('Eventplanung', 'Event planning'), path: '/events', icon: <EventOutlinedIcon /> },
                { label: text('Ausgegeben', 'Checked out'), path: '/checked-out', icon: <OutputIcon /> },
                { label: text('Rückgaben prüfen', 'Review returns'), path: '/returns', icon: <AssignmentReturnOutlinedIcon /> },
            ] : []),
        ] },
        { label: text('Betrieb', 'Operations'), items: manager ? [
            ...(operations ? [{ label: text('Lageraufgaben', 'Warehouse tasks'), path: '/operations', icon: <WarehouseOutlinedIcon /> }] : []),
            ...(canAccessProcurement(user) ? [{ label: t('nav.procurement'), path: '/procurement', icon: <ShoppingCartOutlinedIcon /> }] : []),
            { label: t('nav.maintenance'), path: '/maintenance', icon: <BuildOutlinedIcon /> },
            { label: t('nav.damageReports'), path: '/damage-reports', icon: <ReportProblemOutlinedIcon /> },
        ] : [] },
        { label: text('Berichte', 'Reports'), items: manager ? [
            { label: t('nav.transactions'), path: '/transactions', icon: <HistoryIcon /> },
        ] : [] },
        { label: text('Verwaltung', 'Administration'), items: canManageUsers(user) ? [
            { label: t('nav.userManagement'), path: '/users', icon: <ManageAccountsOutlinedIcon /> },
        ] : [] },
    ];
    return groups.filter((group) => group.items.length > 0);
}

function isActivePath(pathname: string, path: string) {
    return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
}

export function Navigation() {
    const t = useT();
    const text = useLocalizedText();
    const navigate = useNavigate();
    const location = useLocation();
    const sidebarOpen = useUIStore((s) => s.sidebarOpen);
    const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { logout, user } = useAuth();
    const { openActionInbox } = useActionInboxDialog();
    const inboxCount = useInboxCount();
    const groups = useNavGroups(user);
    const catalog = canManageInventory(user) || canViewCatalog(user);

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Toolbar />
            <Box component="nav" aria-label={text('Hauptnavigation', 'Main navigation')} sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', px: 1.5, py: 1 }}>
                {groups.map((group) => (
                    <List key={group.label} dense disablePadding sx={{ mb: 1 }}
                        subheader={<ListSubheader disableSticky sx={{ px: 1.5 }}>{group.label}</ListSubheader>}>
                        {group.items.map((item) => {
                            const active = isActivePath(location.pathname, item.path);
                            return (
                                <ListItemButton
                                    key={item.path}
                                    component={RouterLink}
                                    to={item.path}
                                    selected={active}
                                    aria-current={active ? 'page' : undefined}
                                    onClick={() => { if (isMobile) setSidebarOpen(false); }}
                                    sx={{ mb: 0.25, minHeight: 40 }}
                                >
                                    <ListItemIcon>{item.icon}</ListItemIcon>
                                    <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: active ? 600 : 500 } } }} />
                                </ListItemButton>
                            );
                        })}
                    </List>
                ))}
            </Box>
            <Box sx={{ px: 1.5, pb: 1.5 }}>
                <Divider sx={{ mb: 1.5 }} />
                <Box sx={{ px: 1, pb: 1.5 }}><LanguageSelector /></Box>
                <ListItemButton
                    onClick={() => {
                        void logout()
                            .then((redirectingToProvider) => {
                                if (!redirectingToProvider) navigate('/');
                            })
                            .catch(() => {
                                navigate('/');
                                showSnackbar(t('nav.signOutProviderFailed'), 'error');
                            });
                    }}
                >
                    <ListItemIcon><LogoutIcon /></ListItemIcon>
                    <ListItemText primary={t('nav.signOut')} />
                </ListItemButton>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1, pt: 1.25 }}>
                    {t('nav.version')} {__APP_VERSION__}
                </Typography>
            </Box>
        </Box>
    );

    if (isMobile) {
        const bottomValue = isActivePath(location.pathname, '/') ? '/'
            : ['/items', '/assemblies', '/storage-locations'].some((path) => isActivePath(location.pathname, path)) ? '/items'
            : isActivePath(location.pathname, '/orders') ? '/orders'
            : false;
        return (
            <>
                <Drawer
                    variant="temporary"
                    open={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    ModalProps={{ keepMounted: true }}
                    sx={{ '& .MuiDrawer-paper': { width: 'min(86vw, 320px)', boxSizing: 'border-box' } }}
                >
                    {drawerContent}
                </Drawer>
                <Paper
                    component="nav"
                    aria-label={text('Schnellnavigation', 'Quick navigation')}
                    className="no-print"
                    sx={{
                        position: 'fixed',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: (muiTheme) => muiTheme.zIndex.appBar,
                        borderRadius: 0,
                        border: 0,
                        borderTop: 1,
                        borderColor: 'divider',
                        pb: 'env(safe-area-inset-bottom)',
                    }}
                >
                    <BottomNavigation
                        showLabels
                        value={bottomValue}
                        onChange={(_, value) => {
                            if (value === 'more') setSidebarOpen(true);
                            else if (value === 'tasks') openActionInbox();
                            else navigate(value);
                        }}
                        sx={{ height: 64 }}
                    >
                        <BottomNavigationAction label={text('Start', 'Home')} value="/" icon={<HomeOutlinedIcon />} />
                        {catalog && <BottomNavigationAction label={text('Inventar', 'Inventory')} value="/items" icon={<Inventory2OutlinedIcon />} />}
                        <BottomNavigationAction label={t('nav.orders')} value="/orders" icon={<ReceiptLongOutlinedIcon />} />
                        <BottomNavigationAction label={text('Aufgaben', 'Tasks')} value="tasks" aria-haspopup="dialog"
                            icon={<Badge badgeContent={inboxCount} color="error" max={99}><InboxOutlinedIcon /></Badge>} />
                        <BottomNavigationAction label={t('nav.more')} value="more" aria-haspopup="dialog" icon={<MenuIcon />} />
                    </BottomNavigation>
                </Paper>
            </>
        );
    }

    return (
        <Drawer
            variant="persistent"
            open={sidebarOpen}
            sx={{
                width: sidebarOpen ? DRAWER_WIDTH : 0,
                transition: (theme) => theme.transitions.create('width', {
                    easing: sidebarOpen ? theme.transitions.easing.easeOut : theme.transitions.easing.sharp,
                    duration: sidebarOpen ? theme.transitions.duration.enteringScreen : theme.transitions.duration.leavingScreen,
                }),
                flexShrink: 0,
                overflow: 'hidden',
                '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
            }}
        >
            {drawerContent}
        </Drawer>
    );
}

export { DRAWER_WIDTH };
