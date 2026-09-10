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
import { useTransactions } from '../../hooks/useTransactions';
import { useDamageReports } from '../../hooks/useDamageReports';
import { calculateItemStock } from '../../utils/stock';
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
    const { data: transactions } = useTransactions();
    const { data: damageReports } = useDamageReports();
    const [formData, setFormData] = useState<TransactionFormData>({
        itemId: initialData?.itemId ?? preselectedItemId ?? '',
        transactionType: initialData?.transactionType ?? 'checkout',
        quantityChanged: initialData?.quantityChanged ?? 1,
        reason: initialData?.reason ?? '',
        notes: initialData?.notes ?? '',
        eventType: initialData?.eventType,
        faction: initialData?.faction ?? '',
        factionOrderId: initialData?.factionOrderId,
    });
    const [quantityInput, setQuantityInput] = useState(String(initialData?.quantityChanged ?? 1));
    const selectedItem = items.find((item) => item.id === formData.itemId);
    const selectedStock = calculateItemStock(
        formData.itemId,
        transactions,
        damageReports,
        selectedItem?.amount ?? 0,
        selectedItem,
    );
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
    const factionOptions = formData.eventType ? FACTIONS_BY_EVENT[formData.eventType] : [];

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (quantityInvalid || checkoutContextMissing) return;
        onSubmit({ ...formData, quantityChanged: Number(quantityInput) });
    }

    return (
        <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
                {!preselectedItemId && <TextField
                    select
                    label={t('Artikel', 'Item')}
                    value={formData.itemId}
                    onChange={(e) => setFormData((prev) => ({ ...prev, itemId: e.target.value }))}
                    required
                    fullWidth
                >
                    {items.map((item) => {
                        const { remaining } = calculateItemStock(item.id, transactions, damageReports, item.amount ?? 0, item);
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
                        <ToggleButton value="added"><AddBoxIcon />{t('Bestand', 'Add stock')}</ToggleButton>
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
                <TextField
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
                />
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
                                disabled={isLoading || !formData.itemId || !formData.reason || quantityInvalid || checkoutContextMissing}
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
