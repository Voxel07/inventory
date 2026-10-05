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

    Autocomplete,
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
import { useItems } from '../hooks/useItems';
import { useAssemblyCheckout } from '../hooks/useTransactions';
import { AssemblyForm } from '../components/forms/AssemblyForm';
import { FormDialog } from '../components/shared/FormDialog';
import { DamageReportDialog } from '../components/forms/DamageReportDialog';
import { useUIStore } from '../store/uiStore';
import type { AssemblyFormData, EventType, Item } from '../types';
import { getItemStock } from '../utils/stock';
import { ItemsList } from '../components/lists/ItemsList';
import { useLocalizedText } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canEditCatalog, canOperateWarehouse } from '../utils/access';
import { InventorySharing } from '../components/items/InventorySharing';
import { isOfflineQueuedError } from '../utils/offline';

export function AssemblyDetail() {
    const { user } = useAuth();
    const canTransact = canOperateWarehouse(user);

    const t = useLocalizedText();
    const { eventTypes, factionNames } = useFactionCatalog();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { assemblyId } = useParams<{ assemblyId: string }>();
    const navigate = useNavigate();
    const { data: assembly, isLoading } = useAssembly(assemblyId ?? '');
    const canEdit = assembly?.access?.privateResource ? assembly.access.canEdit : canEditCatalog(user);
    const itemsQuery = useItems();
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
                    showSnackbar(t('Baugruppe aktualisiert', 'Assembly updated'), 'success');
                },
                onError: () => showSnackbar(t('Fehler beim Aktualisieren der Baugruppe', 'Could not update assembly'), 'error'),
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
                    showSnackbar(t('Baugruppe erfolgreich ausgeliehen', 'Assembly checked out successfully'), 'success');
                },
                onError: (error) => {
                    if (isOfflineQueuedError(error)) return;
                    showSnackbar(t('Fehler beim Ausleihen der Baugruppe', 'Could not check out assembly'), 'error');
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
                onSuccess: () => showSnackbar(t('Artikel zur Baugruppe hinzugefügt', 'Item added to assembly'), 'success'),
                onError: () => showSnackbar(t('Fehler beim Hinzufügen des Artikels', 'Could not add item'), 'error'),
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
                onSuccess: () => showSnackbar(t('Artikel aus der Baugruppe entfernt', 'Item removed from assembly'), 'success'),
                onError: () => showSnackbar(t('Fehler beim Entfernen des Artikels', 'Could not remove item'), 'error'),
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
                    tooltipText={t('Zurück zur Baugruppenübersicht', 'Back to assemblies')}
                    icon={<ArrowBackIcon />}
                    label={t('Zurück zu den Baugruppen', 'Back to assemblies')}
                    variant="text"
                    onClick={() => navigate('/assemblies')}
                />
                <Typography variant="h5" sx={{ mt: 2 }}>
                    {t('Baugruppe nicht gefunden', 'Assembly not found')}
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

    const availableItemsToAdd = (() => {
        if (!items || !assembly) return [];
        return items.filter((item) => !(assembly.itemIds ?? []).includes(item.id));
    })();

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
                <TooltipButton
                    variant="icon"
                    tooltipText={t('Zurück zur Baugruppenübersicht', 'Back to assemblies')}
                    icon={<ArrowBackIcon />}
                    onClick={() => navigate('/assemblies')}
                />
                <Typography variant="h4" sx={{ flexGrow: 1 }}>
                    {assembly.name}
                </Typography>
                {canEdit && <TooltipButton
                    variant="icon"
                    tooltipText={t('Baugruppendetails bearbeiten', 'Edit assembly details')}
                    icon={<EditIcon />}
                    onClick={() => setEditOpen(true)}
                />}
                {canTransact && <TooltipButton
                    tooltipText={t('Schaden an dieser Baugruppe melden', 'Report damage to this assembly')}
                    icon={<ReportProblemOutlinedIcon />}
                    label={t('Schaden melden', 'Report damage')}
                    variant="outlined"
                    color="error"
                    onClick={() => setDamageOpen(true)}
                />}
                {canTransact && <TooltipButton
                    tooltipText={t('Alle Artikel dieser Baugruppe ausleihen', 'Check out all items in this assembly')}
                    icon={<ShoppingCartCheckoutIcon />}
                    label={t('Ausleihen', 'Check out')}
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
                                {t('Event-Nutzung', 'Event use')}
                            </Typography>
                            {assembly.eventTypes?.length ? (
                                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                    {assembly.eventTypes.map((eventType) => (
                                        <Chip key={eventType} label={eventType === 'LS' ? 'LightSim' : eventType} color="primary" variant="outlined" size="small" />
                                    ))}
                                </Stack>
                            ) : (
                                <Typography variant="body2" color="text.secondary">{t('Keinem Event zugeordnet', 'Not assigned to an event')}</Typography>
                            )}
                        </Box>

                        {assembly.description && <Typography variant="body1">{assembly.description}</Typography>}

                        {assembly.hint && (
                            <Alert severity="info" sx={{ py: 0.75 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{t('Montagehinweis', 'Assembly instruction')}</Typography>
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
                                [t('Komponenten', 'Components'), String(assemblyItems.length), 'text.primary'],
                                [t('Gesamtwert', 'Total value'), formatMoney(totalValue), 'text.primary'],
                                [t('Verfügbar', 'Available'), componentsReady ? String(maxAssembliesPossible) : '…', maxAssembliesPossible > 0 ? 'success.main' : 'text.secondary'],
                                [t('Erstellt', 'Created'), formatDate(assembly.created), 'text.primary'],
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
                    {t('Unzureichender Bestand für', 'Insufficient stock for')}: {insufficientItems.map((i) => {
                        const needed = assembly.itemQuantities?.[i.id] ?? 1;
                        const available = stockInfo.get(i.id) ?? 0;
                        return t(`${i.name} (benötigt: ${needed}, vorhanden: ${available})`, `${i.name} (needed: ${needed}, available: ${available})`);
                    }).join(', ')}
                </Alert>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h6">
                    {t('Komponenten in dieser Baugruppe', 'Items in this assembly')}
                </Typography>
                {canEdit && <Autocomplete
                    options={availableItemsToAdd}
                    getOptionLabel={(option) => option.name}
                    onChange={(_e, newItem) => {
                        if (newItem) handleAddItem(newItem.id);
                    }}
                    renderInput={(params) => (
                        <TextField {...params} label={t('Artikel schnell hinzufügen', 'Quickly add item')} size="small" />
                    )}
                    sx={{ minWidth: 250, maxWidth: 350 }}
                    value={null}
                />}
            </Box>

            <ItemsList items={assemblyItems} isLoading={itemsQuery.isLoading && !assemblyItems.length}
                requiredQuantities={assembly.itemQuantities} onRemoveItem={canEdit ? handleRemoveItem : undefined}
                loadingMore={itemsQuery.hasNextPage || itemsQuery.isFetchingNextPage} loadError={itemsQuery.isError}
                onRetry={() => { void itemsQuery.refetch(); }} />

            {/* Checkout Dialog */}
            <Dialog open={checkoutOpen} fullScreen={isMobile} onClose={() => setCheckoutOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{t('Baugruppe ausleihen', 'Check out assembly')}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        {t(`Dies leiht alle Artikel in „${assembly.name}“ mit den angegebenen Mengen aus.`, `This checks out every item in “${assembly.name}” in the specified quantities.`)}
                    </DialogContentText>
                    <TextField select fullWidth required label={t('Eventtermin', 'Event occurrence')} value={checkoutEventId} onChange={(event) => { const occurrence = checkoutEvents.find((entry) => entry.id === event.target.value); setCheckoutEventId(event.target.value); setCheckoutEventType(occurrence?.eventType ?? ''); setCheckoutFaction(''); }}>
                        {checkoutEvents.map((event) => <MenuItem key={event.id} value={event.id}>{event.name} · {formatDate(event.startDate)}</MenuItem>)}
                    </TextField>
                    <TextField
                        select
                        label={t('Event', 'Event')}
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
                        label={t('Fraktion', 'Faction')}
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
                        label={t('Auszuleihende Menge', 'Quantity to check out')}
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
                        label={t('Grund', 'Reason')}
                        value={checkoutReason}
                        onChange={(e) => setCheckoutReason(e.target.value)}
                        fullWidth
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        label={t('Anmerkungen (optional)', 'Notes (optional)')}
                        value={checkoutNotes}
                        onChange={(e) => setCheckoutNotes(e.target.value)}
                        fullWidth
                        multiline
                        rows={2}
                    />
                </DialogContent>
                <DialogActions>

                    <Button title={t('Ausleihvorgang abbrechen', 'Cancel checkout')} onClick={() => setCheckoutOpen(false)}>{t('Abbrechen', 'Cancel')}</Button>

                    <Button title={t('Alle Artikel in dieser Baugruppe dauerhaft ausleihen', 'Check out all items in this assembly')}
                        variant="contained"
                        onClick={handleCheckout}
                        disabled={checkoutAssembly.isPending || !checkoutEventType || !checkoutFaction || !checkoutEventId}
                    >
                        {t('Alle Artikel ausleihen', 'Check out all items')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Edit Dialog */}
            <FormDialog open={editOpen} onClose={() => setEditOpen(false)}>
                <AssemblyForm
                    title={t('Baugruppe bearbeiten', 'Edit assembly')}
                    onCancel={() => setEditOpen(false)}
                    initialData={assembly}
                    items={items ?? []}
                    onSubmit={handleUpdate}
                    isLoading={updateAssembly.isPending}
                />
            </FormDialog>
            <DamageReportDialog
                key={assembly.id}
                open={damageOpen}
                onClose={() => setDamageOpen(false)}
                title={t(`Schaden an ${assembly.name} melden`, `Report damage to ${assembly.name}`)}
                items={items ?? []}
                assemblies={[assembly]}
                preselectedAssemblyId={assembly.id}
            />
        </Box>
    );
}
