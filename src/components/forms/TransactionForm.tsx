import { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    TextField,
    Button,
    Stack,
    MenuItem,
    Tooltip,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import AddBoxIcon from '@mui/icons-material/AddBox';
import { EVENT_TYPES, FACTIONS_BY_EVENT } from '../../types';
import type { EventType, FactionOrder, TransactionFormData, Item, TransactionType } from '../../types';
import { useItemAssets } from '../../hooks/useItems';
import { getItemStock } from '../../utils/stock';
import { useNames, useLocalizedText } from '../../utils/naming';

interface Props {
    items: Item[];
    preselectedItemId?: string;
    onSubmit: (data: TransactionFormData) => void;
    isLoading?: boolean;
    initialData?: TransactionFormData;
    orders?: FactionOrder[];
}

function outstandingForItem(order: FactionOrder, itemId: string) {
    const handedOver = order.handedOverQuantities?.[itemId] ?? 0;
    const reconciled = (order.returnedQuantities?.[itemId] ?? 0)
        + (order.consumedQuantities?.[itemId] ?? 0)
        + (order.missingQuantities?.[itemId] ?? 0)
        + (order.damagedQuantities?.[itemId] ?? 0)
        + (order.writtenOffQuantities?.[itemId] ?? 0);
    return Math.max(0, handedOver - reconciled);
}

export function TransactionForm({ items, preselectedItemId, onSubmit, isLoading, initialData, orders = [] }: Props) {
    const names = useNames();
    const t = useLocalizedText();
    const transactionReasons = Object.values(names.reason);
    const [formData, setFormData] = useState<TransactionFormData>({
        itemId: initialData?.itemId ?? preselectedItemId ?? '',
        transactionType: initialData?.transactionType ?? 'checkout',
        quantityChanged: initialData?.quantityChanged ?? 1,
        assetInstanceId: initialData?.assetInstanceId,
        reason: initialData?.reason ?? '',
        notes: initialData?.notes ?? '',
        eventType: initialData?.eventType,
        faction: initialData?.faction ?? '',
        factionOrderId: initialData?.factionOrderId,
    });
    const [quantityInput, setQuantityInput] = useState(String(initialData?.quantityChanged ?? 1));
    const selectedItem = items.find((item) => item.id === formData.itemId);
    const isSerialized = selectedItem?.trackingMode === 'serialized';
    const { data: itemAssets = [], isLoading: assetsLoading } = useItemAssets(isSerialized ? selectedItem.id : undefined);
    const selectedStock = getItemStock(selectedItem);
    const eligibleOrders = useMemo(
        () => orders.filter((order) => (
            order.status === 'picked_up' || order.status === 'partially_returned'
        ) && outstandingForItem(order, formData.itemId) > 0),
        [orders, formData.itemId],
    );
    const selectedOrder = eligibleOrders.find((order) => order.id === formData.factionOrderId);
    const returnLimit = selectedOrder
        ? outstandingForItem(selectedOrder, formData.itemId)
        : selectedStock.checkedOut;
    const quantity = Number(quantityInput);
    const quantityLimit = formData.transactionType === 'checkout'
        ? selectedStock.remaining
        : formData.transactionType === 'checkin'
            ? returnLimit
            : undefined;
    const quantityInvalid = quantityInput === '' || quantity < 1
        || (quantityLimit !== undefined && quantity > quantityLimit);
    const checkoutContextMissing = formData.transactionType === 'checkout'
        && (!formData.eventType || !formData.faction);
    const selectableAssets = itemAssets.filter((asset) => {
        if (!asset.active) return false;
        if (formData.transactionType === 'checkout') {
            return asset.availabilityStatus === 'available'
                && !['damaged', 'unsafe', 'lost'].includes(asset.conditionStatus)
                && !['overdue', 'in_service'].includes(asset.serviceStatus ?? 'certified');
        }
        if (formData.transactionType === 'checkin') {
            return ['in_field', 'in_custody'].includes(asset.availabilityStatus);
        }
        return false;
    });
    const assetSelectionRequired = Boolean(isSerialized
        && ['checkout', 'checkin'].includes(formData.transactionType));
    const assetSelectionMissing = assetSelectionRequired && !formData.assetInstanceId;
    const factionOptions = formData.eventType ? FACTIONS_BY_EVENT[formData.eventType] : [];

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if ((!isSerialized && quantityInvalid) || checkoutContextMissing || assetSelectionMissing) return;
        onSubmit({ ...formData, quantityChanged: isSerialized ? 1 : Number(quantityInput) });
    }

    return (
        <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
                {!preselectedItemId && <TextField
                    select
                    label={t('Artikel', 'Item')}
                    value={formData.itemId}
                    onChange={(e) => setFormData((prev) => ({ ...prev, itemId: e.target.value, assetInstanceId: undefined }))}
                    required
                    fullWidth
                >
                    {items.map((item) => {
                        const { remaining } = getItemStock(item);
                        return (
                            <MenuItem key={item.id} value={item.id}>
                                {item.name} ({t('Verfügbar', 'Available')}: {remaining})
                            </MenuItem>
                        );
                    })}
                </TextField>}
                <Box>
                    <Typography component="label" variant="body2" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                        {t('Was möchten Sie tun?', 'What would you like to do?')}
                    </Typography>
                    <ToggleButtonGroup
                        exclusive
                        fullWidth
                        value={formData.transactionType}
                        onChange={(_, value: TransactionType | null) => value && setFormData((prev) => ({
                            ...prev,
                            transactionType: value,
                            assetInstanceId: undefined,
                            factionOrderId: value === 'checkin' ? prev.factionOrderId : undefined,
                            eventType: value === 'checkout' ? prev.eventType : undefined,
                            faction: value === 'checkout' ? prev.faction : '',
                        }))}
                        aria-label={t('Transaktionstyp', 'Transaction type')}
                        sx={{ '& .MuiToggleButton-root': { minHeight: 52, gap: 0.75, textTransform: 'none', fontWeight: 700 } }}
                    >
                        <ToggleButton value="checkout" disabled={selectedStock.remaining < 1}><LogoutIcon />{names.action.checkout}</ToggleButton>
                        <ToggleButton value="checkin" disabled={selectedStock.checkedOut < 1}>
                            <AssignmentReturnIcon />{names.action.checkin} ({selectedStock.checkedOut} {t('draußen', 'out')})
                        </ToggleButton>
                        <ToggleButton value="added" disabled={isSerialized}><AddBoxIcon />{t('Bestand', 'Add stock')}</ToggleButton>
                    </ToggleButtonGroup>
                </Box>
                {formData.transactionType === 'checkout' && (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                        <TextField
                            select
                            label={t('Event', 'Event')}
                            value={formData.eventType ?? ''}
                            onChange={(e) => setFormData((prev) => ({
                                ...prev,
                                eventType: e.target.value as EventType,
                                faction: '',
                            }))}
                            required
                        >
                            {EVENT_TYPES.map((eventType) => (
                                <MenuItem key={eventType} value={eventType}>{eventType === 'LS' ? 'LightSim' : eventType}</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            label={t('Fraktion', 'Faction')}
                            value={formData.faction ?? ''}
                            onChange={(e) => setFormData((prev) => ({ ...prev, faction: e.target.value }))}
                            required
                            disabled={!formData.eventType}
                        >
                            {factionOptions.map((faction) => <MenuItem key={faction} value={faction}>{faction}</MenuItem>)}
                        </TextField>
                    </Box>
                )}
                {formData.transactionType === 'checkin' && (
                    <>
                        <Alert severity="info">
                            {t(
                                `${selectedStock.checkedOut} Einheiten sind derzeit ausgeliehen.`,
                                `${selectedStock.checkedOut} units are currently checked out.`,
                            )}
                        </Alert>
                        <TextField
                            select
                            label={t('Zugehörige Fraktionsbestellung (optional)', 'Related faction order (optional)')}
                            value={formData.factionOrderId ?? ''}
                            onChange={(e) => {
                                const order = eligibleOrders.find((candidate) => candidate.id === e.target.value);
                                setFormData((prev) => ({
                                    ...prev,
                                    factionOrderId: order?.id,
                                    eventType: order?.eventType,
                                    faction: order?.faction ?? '',
                                }));
                                if (order) {
                                    setQuantityInput(String(Math.min(Number(quantityInput) || 1, outstandingForItem(order, formData.itemId))));
                                }
                            }}
                            helperText={eligibleOrders.length
                                ? t('Nur Bestellungen mit noch ausstehenden Einheiten werden angezeigt.', 'Only orders with outstanding units are shown.')
                                : t('Für diesen Artikel gibt es keine offene Rückgabe aus einer Bestellung.', 'No order has an outstanding return for this item.')}
                            fullWidth
                        >
                            <MenuItem value="">{t('Keine Bestellung / manuelle Rückgabe', 'No order / manual return')}</MenuItem>
                            {eligibleOrders.map((order) => (
                                <MenuItem key={order.id} value={order.id}>
                                    {order.orderCode} · {order.eventType} / {order.faction} · {outstandingForItem(order, formData.itemId)} {t('ausstehend', 'outstanding')}
                                </MenuItem>
                            ))}
                        </TextField>
                    </>
                )}
                {assetSelectionRequired && (
                    <TextField
                        select
                        label={formData.transactionType === 'checkout'
                            ? t('Seriengerät auswählen', 'Select serialized asset')
                            : t('Seriengerät zurücknehmen', 'Select returned asset')}
                        value={formData.assetInstanceId ?? ''}
                        onChange={(event) => setFormData((prev) => ({ ...prev, assetInstanceId: event.target.value }))}
                        required
                        disabled={assetsLoading}
                        error={!assetsLoading && assetSelectionMissing}
                        helperText={assetsLoading
                            ? t('Seriengeräte werden geladen …', 'Loading serialized assets…')
                            : selectableAssets.length === 0
                                ? t('Keine passenden Seriengeräte verfügbar.', 'No eligible serialized assets are available.')
                                : t('Die Auswahl wird dauerhaft in der Nutzungshistorie gespeichert.', 'This selection is retained in the usage history.')}
                        fullWidth
                    >
                        {selectableAssets.map((asset) => (
                            <MenuItem key={asset.id} value={asset.id}>
                                {[asset.assetCode, asset.serialNumber && `SN ${asset.serialNumber}`,
                                    [asset.manufacturer, asset.model].filter(Boolean).join(' '),
                                    asset.currentLocationName || asset.availabilityStatus]
                                    .filter(Boolean).join(' · ')}
                            </MenuItem>
                        ))}
                    </TextField>
                )}
                {!isSerialized && <TextField
                    label={t('Menge', 'Quantity')}
                    type="number"
                    value={quantityInput}
                    onChange={(e) => setQuantityInput(e.target.value)}
                    required
                    fullWidth
                    helperText={quantityLimit !== undefined
                        ? t(`Maximal ${quantityLimit}`, `Maximum ${quantityLimit}`)
                        : undefined}
                    error={quantityInvalid && quantityInput !== ''}
                    slotProps={{ htmlInput: { min: 1, ...(quantityLimit !== undefined ? { max: quantityLimit } : {}) } }}
                />}
                {isSerialized && (
                    <Alert severity="info">
                        {t('Seriengeräte werden einzeln mit Menge 1 gebucht.', 'Serialized assets are recorded individually with quantity 1.')}
                    </Alert>
                )}
                <TextField
                    select
                    label={t('Grund', 'Reason')}
                    value={formData.reason}
                    onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
                    required
                    fullWidth
                >
                    {transactionReasons.map((reason) => (
                        <MenuItem key={reason} value={reason}>
                            {reason}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    label={t('Anmerkungen', 'Notes')}
                    value={formData.notes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    multiline
                    rows={2}
                    fullWidth
                />
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column-reverse', sm: 'row' }, gap: 1.5, justifyContent: 'flex-end', mt: 1 }}>
                    <Button
                        variant="outlined"
                        color="inherit"
                        onClick={() => {
                            setFormData({
                                itemId: initialData?.itemId ?? preselectedItemId ?? '',
                                transactionType: initialData?.transactionType ?? 'checkout',
                                quantityChanged: initialData?.quantityChanged ?? 1,
                                assetInstanceId: initialData?.assetInstanceId,
                                reason: initialData?.reason ?? '',
                                notes: initialData?.notes ?? '',
                                eventType: initialData?.eventType,
                                faction: initialData?.faction ?? '',
                                factionOrderId: initialData?.factionOrderId,
                            });
                            setQuantityInput(String(initialData?.quantityChanged ?? 1));
                        }}
                        disabled={isLoading}
                        sx={{ minHeight: 48 }}
                    >
                        {t('Felder zurücksetzen', 'Reset fields')}
                    </Button>
                    <Tooltip title={t('Diese Transaktion buchen', 'Post this transaction')} arrow>
                        <span>
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={isLoading || !formData.itemId || !formData.reason
                                    || (!isSerialized && quantityInvalid) || checkoutContextMissing || assetSelectionMissing}
                                sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}
                            >
                                {t('Transaktion buchen', 'Post transaction')}
                            </Button>
                        </span>
                    </Tooltip>
                </Box>
            </Stack>
        </Box>
    );
}
