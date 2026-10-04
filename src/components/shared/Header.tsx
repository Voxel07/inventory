import { Chip, IconButton, Button } from './ActionButtons';
import { CameraScanner } from './CameraScanner';
import { useInboxCount } from '../../hooks/useInbox';
import { useActionInboxDialog } from '../../hooks/useActionInboxDialog';
import { Dialog } from './ClosableDialog';
import { AppBar, Toolbar, Typography, Box, DialogTitle, DialogContent, TextField, Badge, useTheme, useMediaQuery } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import InventoryIcon from '@mui/icons-material/Inventory2';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import ErrorOutlineIcon from '@mui/icons-material/ReportProblem';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import { useUIStore } from '../../store/uiStore';
import { translate, useT } from '../../utils/naming';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SyncIssuesDialog } from '../dialogs/SyncIssuesDialog';
import { QueuedActionsDialog } from '../dialogs/QueuedActionsDialog';
import { discardOfflineAction, discardSyncFailure, getOfflineActions, getSyncFailures, type OfflineAction, type SyncFailure } from '../../services/offlineQueue';
import { resolveScannedCode } from '../../utils/codeResolver';

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
    const [queuedActions, setQueuedActions] = useState<OfflineAction[]>([]);
    const [discardingAction, setDiscardingAction] = useState(false);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const isCompact = useMediaQuery(theme.breakpoints.down('md'));
    const { online, queued, syncIssues, cachedAt } = useOfflineStatus();
    const themeMode = useUIStore((s) => s.themeMode);
    const toggleThemeMode = useUIStore((s) => s.toggleThemeMode);
    const [quickScanOpen, setQuickScanOpen] = useState(false);
    const [quickScanInput, setQuickScanInput] = useState('');
    const syncAttention = !online || queued > 0 || Boolean(cachedAt);

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
        void getOfflineActions().then(setQueuedActions);
    }

    async function discardAction(idempotencyKey: string): Promise<boolean> {
        setDiscardingAction(true);
        try {
            await discardOfflineAction(idempotencyKey);
            setQueuedActions(await getOfflineActions());
            showSnackbar(t('header.queuedActionRemoved'), 'success');
            return true;
        } catch (error) {
            showSnackbar(error instanceof Error && error.message === 'SYNC_IN_PROGRESS'
                ? t('header.queuedActionSyncing') : t('header.queuedActionRemoveFailed'), 'error');
            return false;
        } finally {
            setDiscardingAction(false);
        }
    }

    useEffect(() => {
        if (!queuedActionsOpen) return;
        const refresh = () => { void getOfflineActions().then(setQueuedActions); };
        window.addEventListener('ash-offline-queue', refresh);
        return () => window.removeEventListener('ash-offline-queue', refresh);
    }, [queuedActionsOpen]);

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
                <IconButton title={translate('Das Navigationsmenü ein- oder ausblenden', 'Show or hide the navigation menu')}
                    color="inherit"
                    edge="start"
                    onClick={toggleSidebar}
                    sx={{ mr: { xs: 0.5, sm: 1.5 } }}
                    aria-label={t('header.toggleNavigation')}
                >
                    <MenuIcon />
                </IconButton>
                <InventoryIcon sx={{ mr: 1, color: 'primary.main', display: { xs: 'none', sm: 'block' } }} />
                <Typography variant="body1" noWrap component="div" sx={{ fontWeight: 600, fontSize: { xs: '1rem', sm: '1.125rem' } }}>
                    {t('header.inventory')}
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                <IconButton title={translate('Den QR- und Barcode-Scanner öffnen', 'Open the QR code and barcode scanner')}
                    color="inherit"
                    onClick={() => setQuickScanOpen(true)}
                    aria-label={translate('QR- oder Barcode scannen', 'Scan a QR code or barcode')}
                    sx={{ mr: 0.5 }}
                >
                    <QrCodeScannerIcon />
                </IconButton>
                {/* On phones the inbox lives in the bottom navigation as "Tasks". */}
                {!isCompact && <Button color="inherit" aria-haspopup="dialog" onClick={openActionInbox}
                    aria-label={translate(`Posteingang öffnen, ${inboxCount} offen`, `Open inbox, ${inboxCount} open`)}
                    startIcon={<Badge badgeContent={inboxCount} color="error" max={99}><InboxOutlinedIcon /></Badge>}
                    sx={{ mr: 0.5, px: 1.5 }}>
                    {translate('Posteingang', 'Inbox')}
                </Button>}
                <IconButton title={translate('Zwischen hellem und dunklem Farbschema wechseln', 'Switch between light and dark mode')}
                    color="inherit"
                    onClick={toggleThemeMode}
                    aria-label={t('header.toggleColourScheme')}
                    sx={{ display: { xs: 'none', sm: 'inline-flex' }, mr: 0.5 }}
                >
                    {themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
                </IconButton>

                <IconButton title={t('header.openProfile')}
                    color="inherit"
                    onClick={() => navigate('/profile')}
                    aria-label={t('header.openProfile')}
                    sx={{ mr: { xs: 0.5, sm: 1 } }}
                >
                    <AccountCircleIcon />
                </IconButton>

                {syncIssues > 0 && (
                    isMobile ? (

                        <IconButton title={translate('Synchronisationskonflikte prüfen', 'Review synchronization conflicts')}
                            color="error"
                            onClick={openSyncIssues}
                            sx={{ mr: 0.5 }}
                        >
                            <Badge badgeContent={syncIssues} color="error">
                                <ErrorOutlineIcon />
                            </Badge>
                        </IconButton>

                    ) : (
                        <Chip title={translate('Synchronisationskonflikte prüfen', 'Review synchronization conflicts')}
                            size="small"
                            color="error"
                            icon={<ErrorOutlineIcon />}
                            label={t('header.syncIssues', { count: syncIssues })}
                            onClick={openSyncIssues}
                            sx={{ mr: 1 }}
                        />
                    )
                )}
                {isMobile ? (
                    <IconButton title={translate('Vorgemerkte Offline-Aktionen anzeigen', 'Display queued offline actions')}
                        color={!online ? 'error' : syncAttention ? 'warning' : 'inherit'}
                        onClick={openQueuedActions}
                        aria-label={t('header.viewQueuedActions')}
                        sx={{ ml: 0.5 }}
                    >
                        <Badge badgeContent={queued > 0 ? queued : undefined} color={online ? 'warning' : 'error'}>
                            {!online ? <CloudOffIcon /> : syncAttention ? <CloudUploadIcon /> : <CloudDoneOutlinedIcon />}
                        </Badge>
                    </IconButton>
                ) : (
                    <Chip title={translate('Vorgemerkte Offline-Aktionen anzeigen', 'Display queued offline actions')}
                        size="small"
                        variant={syncAttention ? 'filled' : 'outlined'}
                        color={!online ? 'error' : syncAttention ? 'warning' : 'default'}
                        icon={!online ? <CloudOffIcon /> : syncAttention ? <CloudUploadIcon /> : <CloudDoneOutlinedIcon />}
                        label={cachedAt ? t('header.cachedData', 'Cached data') : online
                            ? (queued ? t('header.queuedActions', { count: queued }) : translate('Synchronisiert', 'In sync'))
                            : t('header.offlineQueued', { count: queued })}
                        onClick={openQueuedActions}
                    />
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
                <CameraScanner onScan={code => void handleQuickScanSubmit(undefined, code)} />
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
                        <Button title={translate('Den Scanner schließen', 'Close the scanner')} onClick={() => setQuickScanOpen(false)}>{t('common.cancel', 'Abbrechen')}</Button>
                        <Button title={translate('Das Ziel des eingegebenen QR- oder Barcodes öffnen', 'Open the target of the entered QR code or barcode')} variant="contained" type="submit" disabled={!quickScanInput.trim()}>
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
        <QueuedActionsDialog
            open={queuedActionsOpen}
            actions={queuedActions}
            onClose={() => setQueuedActionsOpen(false)}
            onDiscard={discardAction}
            discarding={discardingAction}
        />
        </>
    );
}
