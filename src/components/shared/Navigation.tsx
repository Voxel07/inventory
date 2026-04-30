import {
    Drawer,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import InventoryIcon from '@mui/icons-material/Inventory';
import CategoryIcon from '@mui/icons-material/Category';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';

const DRAWER_WIDTH = 240;

const navItems = [
    { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
    { label: 'Items', path: '/items', icon: <InventoryIcon /> },
    { label: 'Assemblies', path: '/assemblies', icon: <CategoryIcon /> },
    { label: 'Transactions', path: '/transactions', icon: <ReceiptLongIcon /> },
    { label: 'Damage Reports', path: '/damage-reports', icon: <ReportProblemIcon /> },
];

export function Navigation() {
    const navigate = useNavigate();
    const location = useLocation();
    const sidebarOpen = useUIStore((s) => s.sidebarOpen);

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
            <Toolbar />
            <List>
                {navItems.map((item) => (
                    <ListItemButton
                        key={item.path}
                        selected={location.pathname === item.path}
                        onClick={() => navigate(item.path)}
                    >
                        <ListItemIcon>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.label} />
                    </ListItemButton>
                ))}
            </List>
        </Drawer>
    );
}

export { DRAWER_WIDTH };
