import {
    Drawer,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
    useMediaQuery,
    useTheme,
    Divider,
    Box,
    BottomNavigation,
    BottomNavigationAction,
    Paper,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Typography,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AssessmentIcon from '@mui/icons-material/Assessment';
import RoomIcon from '@mui/icons-material/Room';
import InventoryIcon from '@mui/icons-material/Inventory';
import CategoryIcon from '@mui/icons-material/Category';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import LogoutIcon from '@mui/icons-material/Logout';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useAuth } from '../../hooks/useAuth';
import { LanguageSelector } from './LanguageSelector';
import { useTranslate } from '../../utils/naming';
import EventIcon from '@mui/icons-material/Event';
import GroupsIcon from '@mui/icons-material/Groups';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import HistoryIcon from '@mui/icons-material/History';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import BuildIcon from '@mui/icons-material/Build';
import { EVENT_TYPES, type EventType } from '../../types';
import type { User } from '../../types';
import { canManageInventory } from '../../utils/access';

const DRAWER_WIDTH = 260;

export function Navigation() {
    const t = useTranslate();
    const navigate = useNavigate();
    const location = useLocation();
    const sidebarOpen = useUIStore((s) => s.sidebarOpen);
    const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
    const activeEventType = useUIStore((s) => s.activeEventType);
    const setActiveEventType = useUIStore((s) => s.setActiveEventType);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { logout, user } = useAuth();
    const isManager = canManageInventory(user as unknown as User);
    const managerNavItems = [
        { label: t('Globales Dashboard', 'Global dashboard'), path: '/global-dashboard', icon: <AssessmentIcon /> },
        { label: t('Mein Dashboard', 'My dashboard'), path: '/', icon: <DashboardIcon /> },
        { label: t('Artikel', 'Items'), path: '/items', icon: <InventoryIcon /> },
        { label: t('Lagerorte', 'Storage locations'), path: '/storage-locations', icon: <RoomIcon /> },
        { label: t('Baugruppen', 'Assemblies'), path: '/assemblies', icon: <CategoryIcon /> },
        { label: t('Events', 'Events'), path: '/events', icon: <EventIcon /> },
        { label: t('Fraktionsbestellungen', 'Faction orders'), path: '/events/orders', icon: <GroupsIcon /> },
        { label: t('Ausgeliehen', 'Checked out'), path: '/checked-out', icon: <AssignmentReturnIcon /> },
        { label: t('Transaktionsverlauf', 'Transaction history'), path: '/transactions', icon: <HistoryIcon /> },
        { label: t('QR-Codes drucken', 'Print QR codes'), path: '/print-qr', icon: <QrCode2Icon /> },
        { label: t('Schadensberichte', 'Damage reports'), path: '/damage-reports', icon: <ReportProblemIcon /> },
        { label: t('Beschaffung', 'Procurement'), path: '/procurement', icon: <ShoppingCartIcon /> },
        { label: t('Wartung & Prüfungen', 'Maintenance'), path: '/maintenance', icon: <BuildIcon /> },
        { label: t('Benutzerverwaltung', 'User management'), path: '/users', icon: <ManageAccountsIcon /> },
    ];
    const navItems = isManager
        ? managerNavItems
        : [{ label: t('Meine Fraktionsbestellungen', 'My faction orders'), path: '/events/orders', icon: <GroupsIcon /> }];

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Toolbar />
            <Box sx={{ px: 2, pt: 1.5, pb: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.14)' }}>
                <Typography variant="overline" sx={{ display: 'block', mb: 0.75, color: 'rgba(255, 255, 255, 0.62)' }}>
                    {t('Aktuelles Event', 'Current event')}
                </Typography>
                <FormControl fullWidth size="small">
                    <InputLabel id="active-event-label" sx={{ color: 'rgba(255, 255, 255, 0.68)' }}>
                        {t('Event', 'Event')}
                    </InputLabel>
                    <Select
                        labelId="active-event-label"
                        label={t('Event', 'Event')}
                        value={activeEventType}
                        onChange={(event) => setActiveEventType(event.target.value as EventType)}
                        sx={{
                            color: '#ffffff',
                            bgcolor: 'rgba(255, 255, 255, 0.08)',
                            '& .MuiSelect-icon': { color: 'rgba(255, 255, 255, 0.72)' },
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.58)' },
                        }}
                    >
                        {EVENT_TYPES.map((eventType) => (
                            <MenuItem key={eventType} value={eventType}>
                                {eventType === 'LS' ? 'LightSim' : eventType}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>
            <List sx={{ px: 1, pt: 1, flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ flexGrow: 1 }}>
                    {navItems.map((item) => {
                        const isActive = item.path === '/'
                            ? location.pathname === '/'
                            : item.path === '/events'
                                ? location.pathname.startsWith('/events') && !location.pathname.startsWith('/events/orders')
                            : location.pathname.startsWith(item.path);
                        return (
                            <ListItemButton
                                key={item.path}
                                selected={isActive}
                                onClick={() => {
                                    navigate(item.path);
                                    if (isMobile) setSidebarOpen(false);
                                }}
                                sx={{
                                    borderRadius: 0.5,
                                    mb: 0.5,
                                    '& .MuiListItemText-primary': {
                                        fontWeight: 600,
                                        letterSpacing: '0.025em',
                                    },
                                    '&.Mui-selected': {
                                        backgroundColor: 'primary.main',
                                        color: 'primary.contrastText',
                                        '&:hover': { backgroundColor: 'primary.dark' },
                                        '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                                    },
                                }}
                            >
                                <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                                <ListItemText primary={item.label} />
                            </ListItemButton>
                        );
                    })}
                </Box>
                <Box sx={{ p: 1 }}>
                    <Divider sx={{ mb: 1 }} />
                    <Box sx={{ px: 1, pb: 1.5 }}><LanguageSelector /></Box>
                    <ListItemButton
                        onClick={() => {
                            logout();
                            navigate('/');
                        }}
                        sx={{
                            borderRadius: 0.5,
                            color: 'error.main',
                            '&:hover': {
                                backgroundColor: 'rgba(227, 6, 19, 0.12)',
                            },
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 40, color: 'error.main' }}>
                            <LogoutIcon />
                        </ListItemIcon>
                        <ListItemText primary={t('Abmelden', 'Sign out')} />
                    </ListItemButton>
                    <Typography
                        variant="caption"
                        sx={{ display: 'block', px: 1, pt: 1.25, color: 'rgba(255, 255, 255, 0.45)', fontFamily: 'monospace' }}
                    >
                        {t('Version', 'Version')} {__APP_VERSION__}
                    </Typography>
                </Box>
            </List>
        </Box>
    );

    if (isMobile) {
        return (
            <>
                <Drawer
                    variant="temporary"
                    open={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    ModalProps={{ keepMounted: true }}
                    sx={{
                        '& .MuiDrawer-paper': {
                            width: 'min(86vw, 320px)',
                            boxSizing: 'border-box',
                        },
                    }}
                >
                    {drawerContent}
                </Drawer>
                <Paper
                    elevation={10}
                    className="no-print"
                    sx={{
                        position: 'fixed',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: (muiTheme) => muiTheme.zIndex.appBar,
                        borderRadius: 0,
                        borderInline: 0,
                        borderBottom: 0,
                        pb: 'env(safe-area-inset-bottom)',
                    }}
                >
                    <BottomNavigation
                        showLabels
                        value={
                            location.pathname === '/' ? '/' :
                            location.pathname.startsWith('/items') ? '/items' :
                            location.pathname.startsWith('/checked-out') ? '/checked-out' :
                            false
                        }
                        onChange={(_, value) => {
                            if (value === 'more') setSidebarOpen(true);
                            else navigate(value);
                        }}
                        sx={{ height: 64 }}
                    >
                        {isManager && <BottomNavigationAction label={t('Start', 'Home')} value="/" icon={<DashboardIcon />} />}
                        {isManager && <BottomNavigationAction label={t('Artikel', 'Items')} value="/items" icon={<InventoryIcon />} />}
                        {isManager && <BottomNavigationAction label={t('Rückgabe', 'Return')} value="/checked-out" icon={<AssignmentReturnIcon />} />}
                        {!isManager && <BottomNavigationAction label={t('Bestellungen', 'Orders')} value="/events/orders" icon={<GroupsIcon />} />}
                        <BottomNavigationAction label={t('Mehr', 'More')} value="more" icon={<MoreHorizIcon />} />
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
                '& .MuiDrawer-paper': {
                    width: DRAWER_WIDTH,
                    boxSizing: 'border-box',
                },
            }}
        >
            {drawerContent}
        </Drawer>
    );
}

export { DRAWER_WIDTH };
