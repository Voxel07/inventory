import {
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Box,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import InventoryIcon from '@mui/icons-material/Inventory2';
import { useUIStore } from '../../store/uiStore';
import { useTranslate } from '../../utils/naming';

export function Header() {
    const toggleSidebar = useUIStore((s) => s.toggleSidebar);
    const t = useTranslate();

    return (
        <AppBar position="fixed" elevation={0} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
            <Toolbar>
                <IconButton
                    color="inherit"
                    edge="start"
                    onClick={toggleSidebar}
                    sx={{ mr: { xs: 1, sm: 2 } }}
                    aria-label={t('Navigation umschalten', 'Toggle navigation')}
                >
                    <MenuIcon />
                </IconButton>
                <InventoryIcon sx={{ mr: 1.5, color: 'primary.main', display: { xs: 'none', sm: 'block' } }} />
                <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 700 }}>
                    {t('Inventar', 'Inventory')}
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
            </Toolbar>
        </AppBar>
    );
}
