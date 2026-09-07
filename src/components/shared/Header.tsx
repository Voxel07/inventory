import {
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Box,
    Chip,
    Divider,
    ListItemText,
    Menu,
    MenuItem,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import InventoryIcon from '@mui/icons-material/Inventory2';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import ErrorOutlineIcon from '@mui/icons-material/ReportProblem';
import { useUIStore } from '../../store/uiStore';
import { useT } from '../../utils/naming';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotifications, markNotificationRead, type AppNotification } from '../../services/notificationService';
import { subscribeToApiChanges } from '../../services/apiClient';
import { SyncIssuesDialog } from '../dialogs/SyncIssuesDialog';
import { discardSyncFailure, getSyncFailures, type SyncFailure } from '../../services/offlineQueue';

function payloadText(notification: AppNotification, key: string): string | undefined {
    const value = notification.payload[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
}

export function Header() {
    const toggleSidebar = useUIStore((s) => s.toggleSidebar);
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const t = useT();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [notificationAnchor, setNotificationAnchor] = useState<HTMLElement | null>(null);
    const [syncIssuesOpen, setSyncIssuesOpen] = useState(false);
    const [syncFailures, setSyncFailures] = useState<SyncFailure[]>([]);
    const { online, queued, syncIssues } = useOfflineStatus();
    const themeMode = useUIStore((s) => s.themeMode);
    const toggleThemeMode = useUIStore((s) => s.toggleThemeMode);
    const { data: notifications = [] } = useQuery({ queryKey: ['notifications'], queryFn: getNotifications, refetchInterval: 60_000 });
    const unreadNotifications = notifications.filter((notification) => !notification.readAt);
    useEffect(() => subscribeToApiChanges(() => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }), [queryClient]);
    const markRead = useMutation({
        mutationFn: (ids: string[]) => Promise.all(ids.map(markNotificationRead)),
        onMutate: async (ids) => {
            await queryClient.cancelQueries({ queryKey: ['notifications'] });
            const previous = queryClient.getQueryData<AppNotification[]>(['notifications']);
            const readAt = new Date().toISOString();
            queryClient.setQueryData<AppNotification[]>(['notifications'], (current = []) =>
                current.map((notification) => ids.includes(notification.id) ? { ...notification, readAt } : notification),
            );
            return { previous };
        },
        onError: (_error, _ids, context) => {
            if (context?.previous) queryClient.setQueryData(['notifications'], context.previous);
            showSnackbar(t('header.dismissPickupNoticeFailed'), 'error');
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    });

    function openNotifications(event: MouseEvent<HTMLElement>) {
        setNotificationAnchor(event.currentTarget);
    }

    function openNotification(notification: AppNotification) {
        setNotificationAnchor(null);
        markRead.mutate([notification.id]);
        if (notification.orderId) navigate(`/orders/faction/${notification.orderId}`);
    }

    function dismissAllNotifications() {
        setNotificationAnchor(null);
        markRead.mutate(unreadNotifications.map((notification) => notification.id));
    }

    function openSyncIssues() {
        setSyncIssuesOpen(true);
        void getSyncFailures().then(setSyncFailures);
    }

    function discardFailure(idempotencyKey: string) {
        void discardSyncFailure(idempotencyKey).then(() => {
            setSyncFailures((current) => current.filter((failure) => failure.idempotencyKey !== idempotencyKey));
        });
    }

    return (
        <>
        <AppBar position="fixed" elevation={0} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
            <Toolbar>
                <IconButton
                    color="inherit"
                    edge="start"
                    onClick={toggleSidebar}
                    sx={{ mr: { xs: 1, sm: 2 } }}
                    aria-label={t('header.toggleNavigation')}
                >
                    <MenuIcon />
                </IconButton>
                <InventoryIcon sx={{ mr: 1.5, color: 'primary.main', display: { xs: 'none', sm: 'block' } }} />
                <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 700 }}>
                    {t('header.inventory')}
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                {unreadNotifications.length > 0 && (
                    <>
                        <Chip
                            id="pickup-notices-button"
                            size="small"
                            color="primary"
                            icon={<NotificationsActiveIcon />}
                            label={t('header.pickupNotices', { count: unreadNotifications.length })}
                            onClick={openNotifications}
                            aria-controls={notificationAnchor ? 'pickup-notices-menu' : undefined}
                            aria-haspopup="menu"
                            aria-expanded={notificationAnchor ? 'true' : undefined}
                            sx={{ mr: 1, color: 'white', '& .MuiChip-icon': { color: 'inherit' } }}
                        />
                        <Menu
                            id="pickup-notices-menu"
                            anchorEl={notificationAnchor}
                            open={Boolean(notificationAnchor)}
                            onClose={() => setNotificationAnchor(null)}
                            slotProps={{
                                list: { 'aria-labelledby': 'pickup-notices-button' },
                                paper: { sx: { minWidth: 280, maxWidth: 380 } },
                            }}
                        >
                            {unreadNotifications.map((notification) => {
                                const orderCode = payloadText(notification, 'orderCode');
                                const faction = payloadText(notification, 'faction');
                                const pickupLocation = payloadText(notification, 'pickupLocation');
                                const details = [faction, pickupLocation].filter(Boolean).join(' · ');
                                return (
                                    <MenuItem key={notification.id} onClick={() => openNotification(notification)}>
                                        <ListItemText
                                            primary={orderCode
                                                ? t('header.orderReady', { orderCode })
                                                : t('header.orderReadyGeneric')}
                                            secondary={details || t('header.openOrder')}
                                            sx={{ whiteSpace: 'normal' }}
                                        />
                                    </MenuItem>
                                );
                            })}
                            <Divider />
                            <MenuItem onClick={dismissAllNotifications} disabled={markRead.isPending}>
                                <DoneAllIcon fontSize="small" sx={{ mr: 1.5 }} />
                                {t('header.markAllRead')}
                            </MenuItem>
                        </Menu>
                    </>
                )}
                <IconButton
                    color="inherit"
                    onClick={toggleThemeMode}
                    aria-label={t('header.toggleColourScheme')}
                    sx={{ mr: { xs: 0.5, sm: 1 } }}
                >
                    {themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
                </IconButton>
                {syncIssues > 0 && (
                    <Chip
                        size="small"
                        color="error"
                        icon={<ErrorOutlineIcon />}
                        label={t('header.syncIssues', { count: syncIssues })}
                        onClick={openSyncIssues}
                        sx={{ mr: 1, color: 'white', fontWeight: 700, '& .MuiChip-icon': { color: 'inherit' } }}
                    />
                )}
                {(!online || queued > 0) && (
                    <Chip
                        size="small"
                        color={online ? 'warning' : 'error'}
                        label={online
                            ? t('header.queuedActions', { count: queued })
                            : t('header.offlineQueued', { count: queued })}
                        sx={{ color: 'white', fontWeight: 700 }}
                    />
                )}
            </Toolbar>
        </AppBar>
        <SyncIssuesDialog
            open={syncIssuesOpen}
            failures={syncFailures}
            onClose={() => setSyncIssuesOpen(false)}
            onDiscard={discardFailure}
        />
        </>
    );
}
