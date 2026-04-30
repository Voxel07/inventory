import {
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Box,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useUIStore } from '../../store/uiStore';

export function Header() {
    const toggleSidebar = useUIStore((s) => s.toggleSidebar);

    return (
        <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
            <Toolbar>
                <IconButton
                    color="inherit"
                    edge="start"
                    onClick={toggleSidebar}
                    sx={{ mr: 2 }}
                    aria-label="toggle navigation"
                >
                    <MenuIcon />
                </IconButton>
                <Typography variant="h6" noWrap component="div">
                    Inventory Management
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
            </Toolbar>
        </AppBar>
    );
}
