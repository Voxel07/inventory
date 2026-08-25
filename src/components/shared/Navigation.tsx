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

const DRAWER_WIDTH = 260;

const navItems = [
    { label: 'Globales Dashboard', path: '/global-dashboard', icon: <AssessmentIcon /> },
    { label: 'Mein Dashboard', path: '/', icon: <DashboardIcon /> },
    { label: 'Artikel', path: '/items', icon: <InventoryIcon /> },
    { label: 'QR scannen', path: '/checkout', icon: <QrCodeScannerIcon /> },
    { label: 'Lagerorte', path: '/storage-locations', icon: <RoomIcon /> },
    { label: 'Baugruppen', path: '/assemblies', icon: <CategoryIcon /> },
    { label: 'Transaktionen', path: '/transactions', icon: <ReceiptLongIcon /> },
    { label: 'Ausgeliehen', path: '/checked-out', icon: <AssignmentReturnIcon /> },
    { label: 'QR-Codes drucken', path: '/print-qr', icon: <QrCode2Icon /> },
    { label: 'Schadensberichte', path: '/damage-reports', icon: <ReportProblemIcon /> },
];

export function Navigation() {
    const navigate = useNavigate();
    const location = useLocation();
    const sidebarOpen = useUIStore((s) => s.sidebarOpen);
    const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { logout } = usePocketBase();

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
                        <ListItemText primary="Abmelden" />
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
