import {
    Drawer,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import InventoryIcon from '@mui/icons-material/Inventory';
import CategoryIcon from '@mui/icons-material/Category';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';

const DRAWER_WIDTH = 260;

const navItems = [
    { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
    { label: 'Items', path: '/items', icon: <InventoryIcon /> },
    { label: 'Assemblies', path: '/assemblies', icon: <CategoryIcon /> },
    { label: 'Transactions', path: '/transactions', icon: <ReceiptLongIcon /> },
    { label: 'Checked Out', path: '/checked-out', icon: <AssignmentReturnIcon /> },
    { label: 'QR Codes', path: '/print-qr', icon: <QrCode2Icon /> },
    { label: 'Damage Reports', path: '/damage-reports', icon: <ReportProblemIcon /> },
];

export function Navigation() {
    const navigate = useNavigate();
    const location = useLocation();
    const sidebarOpen = useUIStore((s) => s.sidebarOpen);
    const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const drawerContent = (
        <>
            <Toolbar />
            <List sx={{ px: 1, pt: 1 }}>
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
            </List>
        </>
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
                flexShrink: 0,
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
