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
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    TextField,
    Button,
    Badge,
    useTheme,
    useMediaQuery,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import InventoryIcon from '@mui/icons-material/Inventory2';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import ErrorOutlineIcon from '@mui/icons-material/ReportProblem';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { EVENT_TYPES } from '../../types';
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
import { resolveScannedCode } from '../../utils/codeResolver';

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
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const { online, queued, syncIssues } = useOfflineStatus();
    const themeMode = useUIStore((s) => s.themeMode);
    const toggleThemeMode = useUIStore((s) => s.toggleThemeMode);
    const activeEventType = useUIStore((s) => s.activeEventType);
    const setActiveEventType = useUIStore((s) => s.setActiveEventType);
    const [eventAnchor, setEventAnchor] = useState<HTMLElement | null>(null);
    const [quickScanOpen, setQuickScanOpen] = useState(false);
    const [quickScanInput, setQuickScanInput] = useState('');
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

    async function handleQuickScanSubmit(e?: React.FormEvent) {
        if (e) e.preventDefault();
        const code = quickScanInput.trim();
        if (!code) return;
        setQuickScanOpen(false);
        setQuickScanInput('');
        const scanEvent = new CustomEvent('ash-barcode-scanned', { detail: { code }, cancelable: true });
        window.dispatchEvent(scanEvent);
        if (scanEvent.defaultPrevented) return;

        try {
            const result = await resolveScannedCode(code);
            if (result.found && result.path) {
                navigate(result.path);
                showSnackbar(t('header.codeResolved', { name: result.name || result.code }), 'success');
                return;
            }
        } catch {
            // Ignore resolution errors
        }

        showSnackbar(t('header.codeNotFound', { code }), 'warning');
    }

    return (
        <>
        <AppBar position="fixed" elevation={0} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
            <Toolbar sx={{ px: { xs: 1, sm: 2 } }}>
                <IconButton
                    color="inherit"
                    edge="start"
                    onClick={toggleSidebar}
                    sx={{ mr: { xs: 0.5, sm: 1.5 } }}
                    aria-label={t('header.toggleNavigation')}
                >
                    <MenuIcon />
                </IconButton>
                <InventoryIcon sx={{ mr: 1, color: 'primary.main', display: { xs: 'none', sm: 'block' } }} />
                <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                    {t('header.inventory')}
                </Typography>
                <Chip
                    size="small"
                    variant="outlined"
                    label={activeEventType === 'LS' ? 'LightSim' : activeEventType}
                    deleteIcon={<ArrowDropDownIcon />}
                    onDelete={(e) => setEventAnchor(e.currentTarget)}
                    onClick={(e) => setEventAnchor(e.currentTarget)}
                    sx={{
                        ml: { xs: 1, sm: 1.5 },
                        color: 'white',
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                        fontWeight: 700,
                        cursor: 'pointer',
                        '& .MuiChip-deleteIcon': { color: 'white' },
                    }}
                />
                <Menu
                    anchorEl={eventAnchor}
                    open={Boolean(eventAnchor)}
                    onClose={() => setEventAnchor(null)}
                >
                    {EVENT_TYPES.map((type) => (
                        <MenuItem
                            key={type}
                            selected={type === activeEventType}
                            onClick={() => {
                                setActiveEventType(type);
                                setEventAnchor(null);
                            }}
                        >
                            {type === 'LS' ? 'LightSim' : type}
                        </MenuItem>
                    ))}
                </Menu>
                <Box sx={{ flexGrow: 1 }} />
                <Tooltip title={t('header.quickScan', 'QR / Barcode Scan')}>
                    <IconButton
                        color="inherit"
                        onClick={() => setQuickScanOpen(true)}
                        aria-label="Scan QR/Barcode"
                        sx={{ mr: 0.5 }}
                    >
                        <QrCodeScannerIcon />
                    </IconButton>
                </Tooltip>
                {unreadNotifications.length > 0 && (
                    <>
                        {isMobile ? (
                            <IconButton
                                id="pickup-notices-button"
                                color="inherit"
                                onClick={openNotifications}
                                aria-controls={notificationAnchor ? 'pickup-notices-menu' : undefined}
                                aria-haspopup="menu"
                                aria-expanded={notificationAnchor ? 'true' : undefined}
                                sx={{ mr: 0.5 }}
                            >
                                <Badge badgeContent={unreadNotifications.length} color="error">
                                    <NotificationsActiveIcon />
                                </Badge>
                            </IconButton>
                        ) : (
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
                        )}
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
                    sx={{ display: { xs: 'none', sm: 'inline-flex' }, mr: 0.5 }}
                >
                    {themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
                </IconButton>
                <Tooltip title={t('header.openProfile')}>
                    <IconButton
                        color="inherit"
                        onClick={() => navigate('/profile')}
                        aria-label={t('header.openProfile')}
                        sx={{ mr: { xs: 0.5, sm: 1 } }}
                    >
                        <AccountCircleIcon />
                    </IconButton>
                </Tooltip>
                {syncIssues > 0 && (
                    isMobile ? (
                        <Tooltip title={t('header.syncIssues', { count: syncIssues })}>
                            <IconButton
                                color="error"
                                onClick={openSyncIssues}
                                sx={{ mr: 0.5 }}
                            >
                                <Badge badgeContent={syncIssues} color="error">
                                    <ErrorOutlineIcon />
                                </Badge>
                            </IconButton>
                        </Tooltip>
                    ) : (
                        <Chip
                            size="small"
                            color="error"
                            icon={<ErrorOutlineIcon />}
                            label={t('header.syncIssues', { count: syncIssues })}
                            onClick={openSyncIssues}
                            sx={{ mr: 1, color: 'white', fontWeight: 700, '& .MuiChip-icon': { color: 'inherit' } }}
                        />
                    )
                )}
                {(!online || queued > 0) && (
                    isMobile ? (
                        <Tooltip title={online
                            ? t('header.queuedActions', { count: queued })
                            : t('header.offlineQueued', { count: queued })}>
                            <IconButton
                                size="small"
                                color={online ? 'warning' : 'error'}
                                sx={{ ml: 0.5 }}
                            >
                                <Badge badgeContent={queued > 0 ? queued : undefined} color={online ? 'warning' : 'error'}>
                                    {online ? <CloudUploadIcon /> : <CloudOffIcon />}
                                </Badge>
                            </IconButton>
                        </Tooltip>
                    ) : (
                        <Chip
                            size="small"
                            color={online ? 'warning' : 'error'}
                            label={online
                                ? t('header.queuedActions', { count: queued })
                                : t('header.offlineQueued', { count: queued })}
                            sx={{ color: 'white', fontWeight: 700 }}
                        />
                    )
                )}
            </Toolbar>
        </AppBar>
        <Dialog
            open={quickScanOpen}
            onClose={() => setQuickScanOpen(false)}
            maxWidth="xs"
            fullWidth
        >
            <DialogTitle sx={{ fontWeight: 700 }}>{t('header.quickScanTitle', 'QR- / Barcode-Suche')}</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Box component="form" onSubmit={handleQuickScanSubmit}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        {t('header.quickScanHint', 'Gescannte Barcodes werden automatisch geöffnet, oder tippen/fügen Sie hier einen Code ein:')}
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        size="small"
                        label={t('header.quickScanPlaceholder', 'Code / SKU / URL eingeben')}
                        value={quickScanInput}
                        onChange={(e) => setQuickScanInput(e.target.value)}
                        placeholder="z.B. DE26-KGG-01 oder QR-Link"
                        sx={{ mb: 2 }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button onClick={() => setQuickScanOpen(false)}>{t('common.cancel', 'Abbrechen')}</Button>
                        <Button variant="contained" type="submit" disabled={!quickScanInput.trim()}>
                            {t('common.open', 'Öffnen')}
                        </Button>
                    </Box>
                </Box>
            </DialogContent>
        </Dialog>
        <SyncIssuesDialog
            open={syncIssuesOpen}
            failures={syncFailures}
            onClose={() => setSyncIssuesOpen(false)}
            onDiscard={discardFailure}
        />
        </>
    );
}
