import { IconButton, Button } from './ActionButtons';
import { CameraScanner } from './CameraScanner';
import { useInboxCount } from '../../hooks/useInbox';
import { useActionInboxDialog } from '../../hooks/useActionInboxDialog';
import { Dialog } from './ClosableDialog';
import { AppBar, Toolbar, Typography, Box, DialogTitle, DialogContent, TextField, Badge, ButtonBase, ListItemIcon, ListItemText, Menu, MenuItem, useTheme, useMediaQuery } from '@mui/material';
import { amber, blue } from '@mui/material/colors';
import MenuIcon from '@mui/icons-material/Menu';
import InventoryIcon from '@mui/icons-material/Inventory2';
import MailOutlineIcon from '@mui/icons-material/MailOutlined';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import { useUIStore } from '../../store/uiStore';
import { translate, useT } from '../../utils/naming';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { useAuth } from '../../hooks/useAuth';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { SyncIssuesDialog } from '../dialogs/SyncIssuesDialog';
import { QueuedActionsDialog } from '../dialogs/QueuedActionsDialog';
import { discardSyncFailure, getSyncFailures, type SyncFailure } from '../../services/offlineQueue';
import { resolveScannedCode } from '../../utils/codeResolver';
import { getSnapshotStatus, restoreSnapshotStatus, subscribeSnapshot } from '../../services/offlineSnapshot';
import { useMobileNavigation } from './navDestinations';

export function Header() {
    const { openActionInbox } = useActionInboxDialog();
    const inboxCount = useInboxCount();
    const toggleSidebar = useUIStore((s) => s.toggleSidebar);
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const t = useT();
    const navigate = useNavigate();
    const [syncIssuesOpen, setSyncIssuesOpen] = useState(false);
    const [syncFailures, setSyncFailures] = useState<SyncFailure[]>([]);
    const [queuedActionsOpen, setQueuedActionsOpen] = useState(false);
    const theme = useTheme();
    const isCompact = useMediaQuery(theme.breakpoints.down('md'));
    const { top, inboxInProfile } = useMobileNavigation();
    const profileOpensInbox = isCompact && inboxInProfile;
    const [profileMenuAnchor, setProfileMenuAnchor] = useState<HTMLElement | null>(null);
    const { online, queued, syncIssues, sync } = useOfflineStatus();
    const { generation } = useAuth();
    const snapshot = useSyncExternalStore(subscribeSnapshot, getSnapshotStatus);
    useEffect(() => { void restoreSnapshotStatus().catch(() => {}); }, [generation]);
    const themeMode = useUIStore((s) => s.themeMode);
    const toggleThemeMode = useUIStore((s) => s.toggleThemeMode);
    const quickScanOpen = useUIStore((s) => s.quickScanOpen);
    const setQuickScanOpen = useUIStore((s) => s.setQuickScanOpen);
    const [quickScanInput, setQuickScanInput] = useState('');
    const syncPending = queued > 0 || syncIssues > 0 || sync.kind !== 'idle' || snapshot.kind === 'downloading';
    let syncColor = theme.palette.success.main;
    let syncLabel = t('shared.header.inSync');
    if (!online) {
        const synced = snapshot.kind === 'complete' && !syncPending;
        syncColor = synced ? amber[theme.palette.mode === 'dark' ? 300 : 700] : theme.palette.error.main;
        syncLabel = t(synced ? 'header.offlineSynced' : 'header.offlineNotSynced');
    } else if (syncIssues > 0 || sync.kind === 'paused') {
        syncColor = theme.palette.error.main;
        syncLabel = syncIssues > 0 ? t('header.syncIssues', { count: syncIssues }) : t('shared.header.syncPaused');
    } else if (syncPending) {
        syncColor = blue[theme.palette.mode === 'dark' ? 300 : 700];
        syncLabel = queued > 0 ? t('header.queuedActions', { count: queued }) : t('operations.offlineStatusPanel.syncing');
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

    function openQueuedActions() {
        setQueuedActionsOpen(true);
    }

    async function handleQuickScanSubmit(e?: React.FormEvent, scannedCode?: string) {
        if (e) e.preventDefault();
        const code = (scannedCode ?? quickScanInput).trim();
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
        } catch (error) {
            showSnackbar(error instanceof Error ? error.message : t('header.codeNotFound', { code }), 'warning');
            return;
        }

        showSnackbar(t('header.codeNotFound', { code }), 'warning');
    }

    return (
        <>
        <AppBar position="fixed" elevation={0} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
            <Toolbar sx={{ px: { xs: 1, sm: 2 } }}>
                {/* Phones open the menu from "More" in the bottom bar. */}
                {!isCompact && <IconButton title={translate('shared.header.showOrHideTheNavigationMenu')}
                    color="inherit"
                    edge="start"
                    onClick={toggleSidebar}
                    sx={{ ml: -1.5, mr: 1.5 }}
                    aria-label={t('header.toggleNavigation')}
                >
                    <MenuIcon />
                </IconButton>}
                <ButtonBase component={RouterLink} to="/" aria-label={t('nav.home')}
                    sx={{ ml: { xs: 1, sm: 0 }, px: 0.5, py: 0.5, borderRadius: 1, minWidth: 0 }}>
                    <InventoryIcon sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="body1" noWrap component="span" sx={{ fontWeight: 600, fontSize: { xs: '1rem', sm: '1.125rem' } }}>
                        {t('header.inventory')}
                    </Typography>
                </ButtonBase>
                <Box sx={{ flexGrow: 1 }} />
                {/* On phones the scanner and the inbox ("Tasks") are placeable destinations, like the user's other top-bar picks. */}
                {!isCompact && <IconButton title={translate('shared.header.openTheQRCodeAndBarcodeScanner')}
                    color="inherit"
                    onClick={() => setQuickScanOpen(true)}
                    aria-label={translate('shared.header.scanAQRCodeOrBarcode')}
                    sx={{ mr: 0.5 }}
                >
                    <QrCodeScannerIcon />
                </IconButton>}
                {isCompact ? top.map((destination) => <IconButton key={destination.key} title={destination.label} color="inherit"
                    aria-haspopup={destination.path ? undefined : 'dialog'} onClick={destination.open} sx={{ mr: 0.5 }}>
                    {destination.icon}
                </IconButton>) : <Button color="inherit" aria-haspopup="dialog" onClick={openActionInbox}
                    aria-label={translate('shared.header.openInboxInboxCountOpen', { inboxCount: inboxCount })}
                    startIcon={<Badge badgeContent={inboxCount} color="error" max={99}><MailOutlineIcon /></Badge>}
                    sx={{ mr: 0.5, px: 1.5 }}>
                    {translate('shared.header.inbox')}
                </Button>}
                <IconButton title={translate('shared.header.switchBetweenLightAndDarkMode')}
                    color="inherit"
                    onClick={toggleThemeMode}
                    aria-label={t('header.toggleColourScheme')}
                    sx={{ display: { xs: 'none', sm: 'inline-flex' }, mr: 0.5 }}
                >
                    {themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
                </IconButton>

                {profileOpensInbox ? <IconButton title={t('header.profileAndInbox')}
                    color="inherit"
                    onClick={(event) => setProfileMenuAnchor(event.currentTarget)}
                    aria-label={translate('shared.header.openInboxInboxCountOpen', { inboxCount: inboxCount })}
                    aria-haspopup="menu"
                    sx={{ mr: { xs: 0.5, sm: 1 } }}
                >
                    <Badge badgeContent={inboxCount} color="error" max={99}><AccountCircleIcon /></Badge>
                </IconButton> : <IconButton title={t('header.openProfile')}
                    color="inherit"
                    onClick={() => navigate('/profile')}
                    aria-label={t('header.openProfile')}
                    sx={{ mr: { xs: 0.5, sm: 1 } }}
                >
                    <AccountCircleIcon />
                </IconButton>}
                <Menu anchorEl={profileMenuAnchor} open={profileOpensInbox && profileMenuAnchor !== null} onClose={() => setProfileMenuAnchor(null)}>
                    <MenuItem onClick={() => { setProfileMenuAnchor(null); openActionInbox(); }}>
                        <ListItemIcon><Badge badgeContent={inboxCount} color="error" max={99}><MailOutlineIcon fontSize="small" /></Badge></ListItemIcon>
                        <ListItemText>{translate('shared.header.inbox')}</ListItemText>
                    </MenuItem>
                    <MenuItem onClick={() => { setProfileMenuAnchor(null); navigate('/profile'); }}>
                        <ListItemIcon><AccountCircleIcon fontSize="small" /></ListItemIcon>
                        <ListItemText>{t('profile.title')}</ListItemText>
                    </MenuItem>
                </Menu>

                <IconButton title={syncLabel}
                    onClick={openQueuedActions}
                    aria-label={`${syncLabel}. ${t('header.viewQueuedActions')}`}
                    aria-haspopup="dialog"
                    sx={{ ml: 0.5, color: syncColor }}
                >
                    {/* Sync issues outrank queued actions; the dialog links to their review. */}
                    <Badge badgeContent={syncIssues || queued} max={99} sx={{
                        '& .MuiBadge-badge': { bgcolor: syncColor, color: theme.palette.getContrastText(syncColor) },
                    }}>
                        {!online ? <CloudOffIcon /> : syncPending ? <CloudUploadIcon /> : <CloudDoneOutlinedIcon />}
                    </Badge>
                </IconButton>
            </Toolbar>
        </AppBar>
        <Dialog
            open={quickScanOpen}
            onClose={() => setQuickScanOpen(false)}
            maxWidth="xs"
            fullWidth
        >
            <DialogTitle sx={{ fontWeight: 700 }}>{t('header.quickScanTitle')}</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <CameraScanner onScan={code => void handleQuickScanSubmit(undefined, code)} />
                <Box component="form" onSubmit={handleQuickScanSubmit}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        {t('header.quickScanHint')}
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        size="small"
                        label={t('header.quickScanPlaceholder')}
                        value={quickScanInput}
                        onChange={(e) => setQuickScanInput(e.target.value)}
                        placeholder={t('header.quickScanExample')}
                        sx={{ mb: 2 }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button title={translate('shared.header.closeTheScanner')} onClick={() => setQuickScanOpen(false)}>{t('common.cancel')}</Button>
                        <Button title={translate('shared.header.openTheTargetOfTheEnteredQRCodeOrBarcode')} variant="contained" type="submit" disabled={!quickScanInput.trim()}>
                            {t('common.open')}
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
        <QueuedActionsDialog
            open={queuedActionsOpen}
            onClose={() => setQueuedActionsOpen(false)}
            syncIssues={syncIssues}
            onReviewSyncIssues={() => { setQueuedActionsOpen(false); openSyncIssues(); }}
        />
        </>
    );
}
