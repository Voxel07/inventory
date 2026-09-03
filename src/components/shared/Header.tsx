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
import { useUIStore } from '../../store/uiStore';
import { useTranslate } from '../../utils/naming';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotifications, markNotificationRead, type AppNotification } from '../../services/notificationService';

function payloadText(notification: AppNotification, key: string): string | undefined {
    const value = notification.payload[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
}

export function Header() {
    const toggleSidebar = useUIStore((s) => s.toggleSidebar);
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const t = useTranslate();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [notificationAnchor, setNotificationAnchor] = useState<HTMLElement | null>(null);
    const { online, queued } = useOfflineStatus();
    const { data: notifications = [] } = useQuery({ queryKey: ['notifications'], queryFn: getNotifications, refetchInterval: 60_000 });
    const unreadNotifications = notifications.filter((notification) => !notification.readAt);
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
            showSnackbar(t('Abholhinweis konnte nicht bestätigt werden', 'Could not dismiss pickup notice'), 'error');
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
                {unreadNotifications.length > 0 && (
                    <>
                        <Chip
                            id="pickup-notices-button"
                            size="small"
                            color="primary"
                            icon={<NotificationsActiveIcon />}
                            label={t(`${unreadNotifications.length} Abholhinweise`, `${unreadNotifications.length} pickup notices`)}
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
                                                ? t(`Bestellung ${orderCode} ist abholbereit`, `Order ${orderCode} is ready for pickup`)
                                                : t('Bestellung ist abholbereit', 'Order is ready for pickup')}
                                            secondary={details || t('Bestellung öffnen', 'Open order')}
                                            sx={{ whiteSpace: 'normal' }}
                                        />
                                    </MenuItem>
                                );
                            })}
                            <Divider />
                            <MenuItem onClick={dismissAllNotifications} disabled={markRead.isPending}>
                                <DoneAllIcon fontSize="small" sx={{ mr: 1.5 }} />
                                {t('Alle als gelesen markieren', 'Mark all as read')}
                            </MenuItem>
                        </Menu>
                    </>
                )}
                {(!online || queued > 0) && (
                    <Chip
                        size="small"
                        color={online ? 'warning' : 'error'}
                        label={online
                            ? t(`${queued} Aktionen warten`, `${queued} actions queued`)
                            : t(`Offline — ${queued} warten`, `Offline — ${queued} queued`)}
                        sx={{ color: 'white', fontWeight: 700 }}
                    />
                )}
            </Toolbar>
        </AppBar>
    );
}
