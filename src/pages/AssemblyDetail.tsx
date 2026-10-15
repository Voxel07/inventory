import { formatDate } from '../utils/dateFormat';
import { formatMoney } from '../utils/money';
import { useFactionCatalog } from '../hooks/useFactionCatalog';
import { Button } from '../components/shared/ActionButtons';
import { useEventReports } from '../hooks/useEvents';
import { Dialog } from '../components/shared/ClosableDialog';
import { MediaImage } from '../components/common/MediaImage';
import { apiFileUrl } from '../services/apiClient';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Typography,
    Paper,
    Chip,
    DialogActions,
    DialogContentText,
    DialogTitle,
    DialogContent,
    Skeleton,
    Alert,
    TextField,
    MenuItem,

    Stack,
    useTheme,
    useMediaQuery,
} from '@mui/material';
import { TooltipButton } from '../components/shared/TooltipButton';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { useAssembly, useUpdateAssembly } from '../hooks/useAssemblies';
import { useItemsByIds } from '../hooks/useItems';
import { ItemAutocomplete } from '../components/shared/ItemAutocomplete';
import { useAssemblyCheckout } from '../hooks/useTransactions';
import { AssemblyForm } from '../components/forms/AssemblyForm';
import { FormDialog } from '../components/shared/FormDialog';
import { DamageReportDialog } from '../components/forms/DamageReportDialog';
import { useUIStore } from '../store/uiStore';
import type { AssemblyFormData, EventType, Item } from '../types';
import { getItemStock } from '../utils/stock';
import { ItemsList } from '../components/lists/ItemsList';
import { useT } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canEditCatalog, canOperateWarehouse } from '../utils/access';
import { InventorySharing } from '../components/items/InventorySharing';
import { isOfflineQueuedError } from '../utils/offline';

export function AssemblyDetail() {
    const { user } = useAuth();
    const canTransact = canOperateWarehouse(user);

    const t = useT();
    const { eventTypes, factionNames } = useFactionCatalog();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { assemblyId } = useParams<{ assemblyId: string }>();
    const navigate = useNavigate();
    const { data: assembly, isLoading } = useAssembly(assemblyId ?? '');
    const canEdit = assembly?.access?.privateResource ? assembly.access.canEdit : canEditCatalog(user);
    // Exactly this assembly's components, never the catalog.
    const itemsQuery = useItemsByIds([...(assembly?.itemIds ?? []), ...Object.keys(assembly?.itemQuantities ?? {})]);
    const items = itemsQuery.data;
    const updateAssembly = useUpdateAssembly();
    const checkoutAssembly = useAssemblyCheckout();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const [editOpen, setEditOpen] = useState(false);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [damageOpen, setDamageOpen] = useState(false);
    const [checkoutReason, setCheckoutReason] = useState('');
    const [checkoutNotes, setCheckoutNotes] = useState('');
    const [checkoutAmount, setCheckoutAmount] = useState(1);
    const { data: checkoutEvents = [] } = useEventReports();
    const [checkoutEventId, setCheckoutEventId] = useState('');
    const [checkoutEventType, setCheckoutEventType] = useState<EventType | ''>('');
    const [checkoutFaction, setCheckoutFaction] = useState('');

    function handleUpdate(data: AssemblyFormData) {
        if (!assembly) return;
        updateAssembly.mutate(
            { id: assembly.id, data },
            {
                onSuccess: () => {
                    setEditOpen(false);
                    showSnackbar(t('pages.assemblyDetail.assemblyUpdated'), 'success');
                },
                onError: () => showSnackbar(t('pages.assemblyDetail.couldNotUpdateAssembly'), 'error'),
            },
        );
    }

    function handleCheckout() {
        const eventType = checkoutEventType;
        if (!assembly || !eventType || !checkoutFaction || !checkoutEventId) return;
        const quantities = assembly.itemQuantities ?? {};
        // Build full quantities map including items with default qty 1, multiplied by checkoutAmount
        const fullQuantities: Record<string, number> = {};
        for (const id of assembly.itemIds ?? []) {
            fullQuantities[id] = (quantities[id] ?? 1) * checkoutAmount;
        }
        checkoutAssembly.mutate(
            {
                itemQuantities: fullQuantities,
                assemblyName: assembly.name,
                reason: checkoutReason || `Assembly checkout: ${assembly.name} (Amount: ${checkoutAmount})`,
                notes: checkoutNotes,
                eventType,
                faction: checkoutFaction,
                eventOccurrenceId: checkoutEventId,
            },
            {
                onSuccess: () => {
                    setCheckoutOpen(false);
                    setCheckoutReason('');
                    setCheckoutNotes('');
                    setCheckoutAmount(1);
                    setCheckoutEventType('');
                    setCheckoutFaction('');
                    showSnackbar(t('pages.assemblyDetail.assemblyCheckedOutSuccessfully'), 'success');
                },
                onError: (error) => {
                    if (isOfflineQueuedError(error)) return;
                    showSnackbar(t('pages.assemblyDetail.couldNotCheckOutAssembly'), 'error');
                },
            },
        );
    }

    function handleAddItem(itemId: string) {
        if (!assembly) return;
        const updatedItemIds = [...(assembly.itemIds ?? []), itemId];
        const updatedQuantities = {
            ...(assembly.itemQuantities ?? {}),
            [itemId]: 1, // Default quantity to 1
        };
        updateAssembly.mutate(
            {
                id: assembly.id,
                data: {
                    itemIds: updatedItemIds,
                    itemQuantities: updatedQuantities,
                },
            },
            {
                onSuccess: () => showSnackbar(t('pages.assemblyDetail.itemAddedToAssembly'), 'success'),
                onError: () => showSnackbar(t('pages.assemblyDetail.couldNotAddItem'), 'error'),
            }
        );
    }

    function handleRemoveItem(itemId: string) {
        if (!assembly) return;
        const updatedItemIds = (assembly.itemIds ?? []).filter((id) => id !== itemId);
        const updatedQuantities = { ...(assembly.itemQuantities ?? {}) };
        delete updatedQuantities[itemId];
        updateAssembly.mutate(
            {
                id: assembly.id,
                data: {
                    itemIds: updatedItemIds,
                    itemQuantities: updatedQuantities,
                },
            },
            {
                onSuccess: () => showSnackbar(t('pages.assemblyDetail.itemRemovedFromAssembly'), 'success'),
                onError: () => showSnackbar(t('pages.assemblyDetail.couldNotRemoveItem'), 'error'),
            }
        );
    }

    const currentItems = new Map((items ?? []).map(item => [item.id, item]));
    const assemblyItems: Item[] = [...new Set([...(assembly?.itemIds ?? []), ...Object.keys(assembly?.itemQuantities ?? {})])]
        .map(id => currentItems.get(id))
        .filter((item): item is Item => Boolean(item));
    const stockInfo = new Map(assemblyItems.map(item => [item.id, getItemStock(item).remaining]));

    if (isLoading) {
        return (
            <Box>
                <Skeleton height={60} width={300} />
                <Skeleton height={200} />
            </Box>
        );
    }

    if (!assembly) {
        return (
            <Box>
                <TooltipButton
                    tooltipText={t('pages.assemblyDetail.backToAssemblies')}
                    icon={<ArrowBackIcon />}
                    label={t('pages.assemblyDetail.backToAssemblies2')}
                    variant="text"
                    onClick={() => navigate('/assemblies')}
                />
                <Typography variant="h5" sx={{ mt: 2 }}>
                    {t('pages.assemblyDetail.assemblyNotFound')}
                </Typography>
            </Box>
        );
    }

    const totalValue = assemblyItems.reduce(
        (sum, item) => sum + (item.value ?? 0) * (assembly.itemQuantities?.[item.id] ?? 1), 0,
    );

    // Check which items have insufficient stock
    const insufficientItems = assemblyItems.filter((item) => {
        const needed = assembly.itemQuantities?.[item.id] ?? 1;
        const available = stockInfo.get(item.id) ?? 0;
        return available < needed;
    });

    const componentsReady = assemblyItems.length === new Set([...(assembly.itemIds ?? []), ...Object.keys(assembly.itemQuantities ?? {})]).size;
    const canCheckout = componentsReady && insufficientItems.length === 0 && assemblyItems.length > 0;

    const maxAssembliesPossible = (() => {
        if (assemblyItems.length === 0) return 0;
        let minPossible = Infinity;
        for (const item of assemblyItems) {
            const needed = assembly.itemQuantities?.[item.id] ?? 1;
            const available = stockInfo.get(item.id) ?? 0;
            const possible = Math.floor(available / needed);
            if (possible < minPossible) {
                minPossible = possible;
            }
        }
        return minPossible === Infinity ? 0 : minPossible;
    })();

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
                <TooltipButton
                    variant="icon"
                    tooltipText={t('pages.assemblyDetail.backToAssemblies')}
                    icon={<ArrowBackIcon />}
                    onClick={() => navigate('/assemblies')}
                />
                <Typography variant="h4" sx={{ flexGrow: 1 }}>
                    {assembly.name}
                </Typography>
                {canEdit && <TooltipButton
                    variant="icon"
                    tooltipText={t('pages.assemblyDetail.editAssemblyDetails')}
                    icon={<EditIcon />}
                    onClick={() => setEditOpen(true)}
                />}
                {canTransact && <TooltipButton
                    tooltipText={t('pages.assemblyDetail.reportDamageToThisAssembly')}
                    icon={<ReportProblemOutlinedIcon />}
                    label={t('common.reportDamage')}
                    variant="outlined"
                    color="error"
                    onClick={() => setDamageOpen(true)}
                />}
                {canTransact && <TooltipButton
                    tooltipText={t('pages.assemblyDetail.checkOutAllItemsInThisAssembly')}
                    icon={<ShoppingCartCheckoutIcon />}
                    label={t('enum.action.checkout')}
                    variant="contained"
                    onClick={() => setCheckoutOpen(true)}
                    disabled={!canCheckout}
                />}
            </Box>

            <Paper sx={{ p: { xs: 1.5, md: 2 }, mb: 3, overflow: 'hidden' }}>
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: assembly.image ? { xs: '1fr', md: 'minmax(260px, 420px) minmax(0, 1fr)' } : '1fr',
                    gap: { xs: 2, md: 2.5 },
                    alignItems: 'stretch',
                }}>
                    {assembly.image && (
                        <MediaImage
                            src={apiFileUrl(assembly.image)}
                            alt={assembly.name}
                            sx={{
                                display: 'block',
                                width: '100%',
                                height: { xs: 240, md: 320 },
                                objectFit: 'contain',
                                bgcolor: 'background.default',
                                borderRadius: 1,
                            }}
                        />
                    )}
                    <Stack spacing={2} sx={{ minWidth: 0 }}>
                        <Box>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.75 }}>
                                {t('pages.assemblyDetail.eventUse')}
                            </Typography>
                            {assembly.eventTypes?.length ? (
                                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                    {assembly.eventTypes.map((eventType) => (
                                        <Chip key={eventType} label={eventType === 'LS' ? 'LightSim' : eventType} color="primary" variant="outlined" size="small" />
                                    ))}
                                </Stack>
                            ) : (
                                <Typography variant="body2" color="text.secondary">{t('pages.assemblyDetail.notAssignedToAnEvent')}</Typography>
                            )}
                        </Box>

                        {assembly.description && <Typography variant="body1">{assembly.description}</Typography>}

                        {assembly.hint && (
                            <Alert severity="info" sx={{ py: 0.75 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{t('pages.assemblyDetail.assemblyInstruction')}</Typography>
                                <Typography variant="body2">{assembly.hint}</Typography>
                            </Alert>
                        )}

                        <InventorySharing kind="assemblies" id={assembly.id} access={assembly.access} />

                        <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' },
                            gap: 1,
                            mt: 'auto !important',
                        }}>
                            {[
                                [t('pages.assemblyDetail.components'), String(assemblyItems.length), 'text.primary'],
                                [t('pages.assemblyDetail.totalValue'), formatMoney(totalValue), 'text.primary'],
                                [t('enum.itemStatus.available'), componentsReady ? String(maxAssembliesPossible) : '…', maxAssembliesPossible > 0 ? 'success.main' : 'text.secondary'],
                                [t('pages.assemblyDetail.created'), formatDate(assembly.created), 'text.primary'],
                            ].map(([label, value, color]) => (
                                <Box key={label} sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
                                    <Typography variant="subtitle1" color={color} sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</Typography>
                                </Box>
                            ))}
                        </Box>
                    </Stack>
                </Box>
            </Paper>

            {insufficientItems.length > 0 && (
                <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 3 }}>
                    {t('pages.assemblyDetail.insufficientStockFor')}: {insufficientItems.map((i) => {
                        const needed = assembly.itemQuantities?.[i.id] ?? 1;
                        const available = stockInfo.get(i.id) ?? 0;
                        return t('pages.assemblyDetail.nameNeededNeededAvailableAvailable', { name: String(i.name), needed: needed, available: available });
                    }).join(', ')}
                </Alert>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h6">
                    {t('pages.assemblyDetail.itemsInThisAssembly')}
                </Typography>
                {canEdit && <Box sx={{ minWidth: 250, maxWidth: 350, flex: 1 }}>
                    <ItemAutocomplete size="small" label={t('pages.assemblyDetail.quicklyAddItem')} value={null}
                        filter={(item) => !(assembly.itemIds ?? []).includes(item.id)}
                        onChange={(newItem) => { if (newItem) handleAddItem(newItem.id); }} />
                </Box>}
            </Box>

            <ItemsList items={assemblyItems} isLoading={itemsQuery.isLoading && !assemblyItems.length}
                requiredQuantities={assembly.itemQuantities} onRemoveItem={canEdit ? handleRemoveItem : undefined}
                loadingMore={false} loadError={itemsQuery.isError}
                onRetry={() => { void itemsQuery.refetch(); }} />

            {/* Checkout Dialog */}
            <Dialog open={checkoutOpen} fullScreen={isMobile} onClose={() => setCheckoutOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{t('pages.assemblyDetail.checkOutAssembly')}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        {t('pages.assemblyDetail.thisChecksOutEveryItemInNameInTheSpecified', { name: String(assembly.name) })}
                    </DialogContentText>
                    <TextField select fullWidth required label={t('pages.assemblyDetail.eventOccurrence')} value={checkoutEventId} onChange={(event) => { const occurrence = checkoutEvents.find((entry) => entry.id === event.target.value); setCheckoutEventId(event.target.value); setCheckoutEventType(occurrence?.eventType ?? ''); setCheckoutFaction(''); }}>
                        {checkoutEvents.filter((event) => event.status !== 'completed').map((event) => <MenuItem key={event.id} value={event.id}>{event.name} · {formatDate(event.startDate)}</MenuItem>)}
                    </TextField>
                    <TextField
                        select
                        label={t('nav.event')}
                        value={checkoutEventType}
                        onChange={(e) => {
                            setCheckoutEventType(e.target.value as EventType); setCheckoutEventId('');
                            setCheckoutFaction('');
                        }}
                        required
                        fullWidth
                        sx={{ mb: 2 }}
                    >
                        {eventTypes.map((eventType) => (
                            <MenuItem key={eventType} value={eventType}>{eventType === 'LS' ? 'LightSim' : eventType}</MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        label={t('common.faction')}
                        value={checkoutFaction}
                        onChange={(e) => setCheckoutFaction(e.target.value)}
                        required
                        disabled={!checkoutEventType}
                        fullWidth
                        sx={{ mb: 2 }}
                    >
                        {factionNames(checkoutEventType).map((faction) => (
                            <MenuItem key={faction} value={faction}>{faction}</MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        label={t('pages.assemblyDetail.quantityToCheckOut')}
                        type="number"
                        value={checkoutAmount}
                        onChange={(e) => {
                            const val = Math.max(1, Math.min(maxAssembliesPossible, Number(e.target.value) || 1));
                            setCheckoutAmount(val);
                        }}
                        fullWidth
                        sx={{ mb: 2 }}
                        slotProps={{ htmlInput: { min: 1, max: maxAssembliesPossible } }}
                    />
                    <TextField
                        label={t('common.reason')}
                        value={checkoutReason}
                        onChange={(e) => setCheckoutReason(e.target.value)}
                        fullWidth
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        label={t('pages.assemblyDetail.notesOptional')}
                        value={checkoutNotes}
                        onChange={(e) => setCheckoutNotes(e.target.value)}
                        fullWidth
                        multiline
                        rows={2}
                    />
                </DialogContent>
                <DialogActions>

                    <Button title={t('pages.assemblyDetail.cancelCheckout')} onClick={() => setCheckoutOpen(false)}>{t('common.cancel')}</Button>

                    <Button title={t('pages.assemblyDetail.checkOutAllItemsInThisAssembly2')}
                        variant="contained"
                        onClick={handleCheckout}
                        disabled={checkoutAssembly.isPending || !checkoutEventType || !checkoutFaction || !checkoutEventId}
                    >
                        {t('pages.assemblyDetail.checkOutAllItems')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Edit Dialog */}
            <FormDialog open={editOpen} onClose={() => setEditOpen(false)}>
                <AssemblyForm
                    title={t('pages.assemblyDetail.editAssembly')}
                    onCancel={() => setEditOpen(false)}
                    initialData={assembly}
                    onSubmit={handleUpdate}
                    isLoading={updateAssembly.isPending}
                />
            </FormDialog>
            <DamageReportDialog
                key={assembly.id}
                open={damageOpen}
                onClose={() => setDamageOpen(false)}
                title={t('pages.assemblyDetail.reportDamageToName', { name: String(assembly.name) })}
                assemblies={[assembly]}
                preselectedAssemblyId={assembly.id}
            />
        </Box>
    );
}
