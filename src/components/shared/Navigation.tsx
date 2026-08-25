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
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AssessmentIcon from '@mui/icons-material/Assessment';
import RoomIcon from '@mui/icons-material/Room';
import InventoryIcon from '@mui/icons-material/Inventory';
import CategoryIcon from '@mui/icons-material/Category';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import LogoutIcon from '@mui/icons-material/Logout';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { usePocketBase } from '../../hooks/usePocketBase';
import { LanguageSelector } from './LanguageSelector';
import { useTranslate } from '../../utils/naming';
import EventIcon from '@mui/icons-material/Event';

const DRAWER_WIDTH = 260;

export function Navigation() {
    const t = useTranslate();
    const navigate = useNavigate();
    const location = useLocation();
    const sidebarOpen = useUIStore((s) => s.sidebarOpen);
    const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { logout } = usePocketBase();
    const navItems = [
        { label: t('Globales Dashboard', 'Global dashboard'), path: '/global-dashboard', icon: <AssessmentIcon /> },
        { label: t('Mein Dashboard', 'My dashboard'), path: '/', icon: <DashboardIcon /> },
        { label: t('Artikel', 'Items'), path: '/items', icon: <InventoryIcon /> },
        { label: t('QR scannen', 'Scan QR code'), path: '/checkout', icon: <QrCodeScannerIcon /> },
        { label: t('Lagerorte', 'Storage locations'), path: '/storage-locations', icon: <RoomIcon /> },
        { label: t('Baugruppen', 'Assemblies'), path: '/assemblies', icon: <CategoryIcon /> },
        { label: t('Events', 'Events'), path: '/events', icon: <EventIcon /> },
        { label: t('Transaktionen', 'Transactions'), path: '/transactions', icon: <ReceiptLongIcon /> },
        { label: t('Ausgeliehen', 'Checked out'), path: '/checked-out', icon: <AssignmentReturnIcon /> },
        { label: t('QR-Codes drucken', 'Print QR codes'), path: '/print-qr', icon: <QrCode2Icon /> },
        { label: t('Schadensberichte', 'Damage reports'), path: '/damage-reports', icon: <ReportProblemIcon /> },
    ];

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Toolbar />
            <List sx={{ px: 1, pt: 1, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ flexGrow: 1 }}>
                    {navItems.map((item) => {
                        const isActive = item.path === '/'
                            ? location.pathname === '/'
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
                                    borderRadius: 2,
                                    mb: 0.5,
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
                            borderRadius: 2,
                            color: 'error.main',
                            '&:hover': {
                                backgroundColor: 'rgba(255, 82, 82, 0.08)',
                            },
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 40, color: 'error.main' }}>
                            <LogoutIcon />
                        </ListItemIcon>
                        <ListItemText primary={t('Abmelden', 'Sign out')} />
                    </ListItemButton>
                </Box>
            </List>
        </Box>
    );

    if (isMobile) {
        return (
            <Drawer
                variant="temporary"
                open={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                ModalProps={{ keepMounted: true }}
                sx={{
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
