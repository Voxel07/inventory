import { ListItemButton, BottomNavigationAction } from './ActionButtons';
import {
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
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useAuth } from '../../hooks/useAuth';
import { AuthPersistenceError } from '../../services/authManager';
import { LanguageSelector } from './LanguageSelector';
import { useT } from '../../utils/naming';
import { isActivePath, useMobileNavigation, useNavGroups } from './navDestinations';

const DRAWER_WIDTH = 256;

export function Navigation() {
    const t = useT();
    const navigate = useNavigate();
    const location = useLocation();
    const sidebarOpen = useUIStore((s) => s.sidebarOpen);
    const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { logout, user } = useAuth();
    const groups = useNavGroups(user);
    const { bottom } = useMobileNavigation();

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Toolbar />
            <Box component="nav" aria-label={t('shared.navigation.mainNavigation')} sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', px: 1.5, py: 1 }}>
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
                            .catch((error: unknown) => {
                                navigate('/');
                                showSnackbar(t(error instanceof AuthPersistenceError ? 'nav.signOutPersistFailed' : 'nav.signOutProviderFailed'), 'error');
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
        const bottomValue = bottom.find((destination) => destination.path && isActivePath(location.pathname, destination.path))?.key ?? false;
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
                    aria-label={t('shared.navigation.quickNavigation')}
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
                        onChange={(_, value: string) => {
                            if (value === 'more') setSidebarOpen(true);
                            else bottom.find((destination) => destination.key === value)?.open();
                        }}
                        sx={{ height: 64, '& .MuiBottomNavigationAction-root': { minWidth: 0, px: 0.5 },
                            '& .MuiBottomNavigationAction-label': { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
                    >
                        {bottom.map((destination) => <BottomNavigationAction key={destination.key} label={destination.label} value={destination.key}
                            icon={destination.icon} aria-haspopup={destination.path ? undefined : 'dialog'} />)}
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
