import { formatDate } from '../../utils/dateFormat';
import { useFactionCatalog } from '../../hooks/useFactionCatalog';
import { ToggleButton, Button } from '../shared/ActionButtons';
import { useStockLookups } from '../../hooks/useStockLookups';
import { useEquipmentAvailability } from '../../hooks/useEquipment';
import { useOperationList } from '../../hooks/useOperations';
import { operationsApi } from '../../services/operationsService';
import { useState } from 'react';
import {
    Alert,
    Box,
    TextField,
    Stack,
    MenuItem,

    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import AddBoxIcon from '@mui/icons-material/AddBox';
import EventIcon from '@mui/icons-material/Event';
import HandymanOutlinedIcon from '@mui/icons-material/HandymanOutlined';
import type { TransactionFormData, Item, TransactionType } from '../../types';
import type { CheckedOutRow } from '../../types/custody';
import { useCustodyBalances } from '../../hooks/useCustodyBalances';
import { useItemAssets } from '../../hooks/useItems';
import { useEventReports } from '../../hooks/useEvents';
import { getItemStock } from '../../utils/stock';
import { translate, useNames, useLocalizedText } from '../../utils/naming';
import { formatStatus } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';
import { canOperateWarehouse, canTakeOut } from '../../utils/access';

interface Props {
    items: Item[];
    preselectedItemId?: string;
    onSubmit: (data: TransactionFormData) => void;
    isLoading?: boolean;
    initialData?: TransactionFormData;
}

/** Event use books the checkout to a dated event and faction; general use is out-of-game (workshop, setup, transport). */
type Usage = 'event' | 'general';

/** Units of a custody row that are not already awaiting a return acknowledgement. */
function returnable(row: CheckedOutRow) {
    return Math.max(0, row.checkedOut - (row.pendingQuantity ?? 0));
}

export function TransactionForm({ items, preselectedItemId, onSubmit, isLoading, initialData }: Props) {
    const { user } = useAuth();
    const names = useNames();
    const lookup = useStockLookups();
    const t = useLocalizedText();
    const { factionNames } = useFactionCatalog();
    const { data: events = [] } = useEventReports();
    const transactionReasons = Object.values(names.reason);
    const initialUsage: Usage = initialData && initialData.transactionType === 'checkout' && !initialData.eventOccurrenceId && !initialData.eventType
        ? 'general' : 'event';
    const initialForm = (): TransactionFormData => {
        const transactionType = initialData?.transactionType ?? (canTakeOut(user) ? 'checkout' : 'added');
        return {
            itemId: initialData?.itemId ?? preselectedItemId ?? '',
            transactionType,
            quantityChanged: initialData?.quantityChanged ?? 1,
            assetInstanceId: initialData?.assetInstanceId,
            reason: initialData?.reason ?? (transactionType === 'checkout' && initialUsage === 'event' ? names.reason.eventUse : ''),
            notes: initialData?.notes ?? '',
            eventType: initialData?.eventType,
            eventOccurrenceId: initialData?.eventOccurrenceId,
            faction: initialData?.faction ?? '',
            factionOrderId: initialData?.factionOrderId,
        };
    };
    const [formData, setFormData] = useState<TransactionFormData>(initialForm);
    const [usage, setUsage] = useState<Usage>(initialUsage);
    const [quantityInput, setQuantityInput] = useState(String(initialData?.quantityChanged ?? 1));
    const selectedItem = items.find((item) => item.id === formData.itemId);
    const canEditStock = selectedItem?.access?.privateResource ? selectedItem.access.canEdit : canOperateWarehouse(user);
    const canCheckout = canTakeOut(user) && (!selectedItem?.access?.privateResource || selectedItem.access.canEdit || selectedItem.access.publicUse);
    const lots = useOperationList(`transaction-lots:${formData.itemId}`, operationsApi.lots({ itemId: formData.itemId }), Boolean(formData.itemId));
    const isSerialized = selectedItem?.trackingMode === 'serialized';
    const { data: itemAssets = [], isLoading: assetsLoading } = useItemAssets(isSerialized ? selectedItem.id : undefined);
    const selectedStock = getItemStock(selectedItem);
    const isCheckout = formData.transactionType === 'checkout';
    const eventUse = isCheckout && usage === 'event';
    const equipment = useEquipmentAvailability(formData.eventOccurrenceId);
    const commitment = equipment.data?.[formData.itemId];
    const checkoutAvailable = commitment ? (commitment.pickupAllowed ? commitment.available : 0) : selectedStock.remaining;
    const isCheckin = formData.transactionType === 'checkin';
    // A return settles one exact custody: custodian, event and order. General orders return through their order screen.
    const custody = useCustodyBalances(false, isCheckin);
    const custodySources = (custody.data ?? []).filter((row) => row.itemId === formData.itemId
        && !row.generalOrderId && returnable(row) > 0);
    const [custodyKey, setCustodyKey] = useState('');
    const custodySource = custodySources.find((row) => row.key === custodyKey);
    const returnLimit = custodySource ? returnable(custodySource) : 0;
    const quantity = Number(quantityInput);
    const quantityLimit = isCheckout
        ? checkoutAvailable
        : formData.transactionType === 'checkin'
            ? returnLimit
            : undefined;
    const quantityInvalid = quantityInput === '' || quantity < 1
        || (quantityLimit !== undefined && quantity > quantityLimit);
    const checkoutContextMissing = eventUse && (!formData.eventOccurrenceId || !formData.faction);
    const selectableAssets = itemAssets.filter((asset) => {
        if (!asset.active) return false;
        if (isCheckout) {
            return asset.availabilityStatus === 'available'
                && (!commitment || (commitment.pickupAllowed && commitment.assetIds.includes(asset.id)))
                && !['damaged', 'unsafe', 'lost'].includes(asset.conditionStatus)
                && !['overdue', 'in_service'].includes(asset.serviceStatus ?? 'certified');
        }
        if (isCheckin) {
            return ['in_field', 'in_custody'].includes(asset.availabilityStatus)
                && (!custodySource?.assetInstanceId || custodySource.assetInstanceId === asset.id);
        }
        return false;
    });
    const assetSelectionRequired = Boolean(isSerialized
        && ['checkout', 'checkin'].includes(formData.transactionType));
    const assetSelectionMissing = assetSelectionRequired && !selectableAssets.some(asset => asset.id === formData.assetInstanceId);
    const factionOptions = factionNames(formData.eventType);
    const custodySourceMissing = isCheckin && !custodySource;

    function selectCustodySource(key: string) {
        const row = custodySources.find((candidate) => candidate.key === key);
        setCustodyKey(key);
        setFormData((previous) => ({
            ...previous,
            userId: row?.personId,
            eventOccurrenceId: row?.eventOccurrenceId || undefined,
            eventType: undefined,
            factionOrderId: row?.factionOrderId,
            assetInstanceId: row?.assetInstanceId,
        }));
        if (row) setQuantityInput(String(Math.min(Number(quantityInput) || 1, returnable(row))));
    }

    function selectOccurrence(occurrenceId: string) {
        const occurrence = events.find((value) => value.id === occurrenceId);
        setFormData((previous) => ({
            ...previous,
            eventOccurrenceId: occurrence?.id,
            eventType: occurrence?.eventType,
            faction: previous.eventType === occurrence?.eventType ? previous.faction : '',
        }));
    }

    function changeUsage(next: Usage) {
        setUsage(next);
        setFormData((previous) => ({
            ...previous,
            eventOccurrenceId: next === 'event' ? previous.eventOccurrenceId : undefined,
            eventType: next === 'event' ? previous.eventType : undefined,
            faction: next === 'event' ? previous.faction : '',
            reason: next === 'general' && previous.reason === names.reason.eventUse ? ''
                : next === 'event' && !previous.reason ? names.reason.eventUse : previous.reason,
        }));
    }

    function changeType(value: TransactionType) {
        setCustodyKey('');
        setFormData((prev) => ({
            ...prev,
            transactionType: value,
            assetInstanceId: undefined,
            userId: undefined,
            factionOrderId: undefined,
            eventOccurrenceId: value === 'checkout' ? prev.eventOccurrenceId : undefined,
            eventType: value === 'checkout' ? prev.eventType : undefined,
            faction: value === 'checkout' ? prev.faction : '',
            reason: value === 'checkout' && usage === 'event' && !prev.reason ? names.reason.eventUse
                : value !== 'checkout' && prev.reason === names.reason.eventUse ? '' : prev.reason,
        }));
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if ((isCheckout ? !canCheckout : !canEditStock)
            || (!isSerialized && quantityInvalid) || checkoutContextMissing || custodySourceMissing || assetSelectionMissing) return;
        const general = isCheckout && usage === 'general';
        onSubmit({
            ...formData,
            quantityChanged: isSerialized ? 1 : Number(quantityInput),
            ...(general ? { eventOccurrenceId: undefined, eventType: undefined, faction: undefined } : {}),
        });
    }

    return (
        <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
                {commitment && eventUse && <Alert severity={checkoutAvailable > 0 ? 'info' : 'warning'}>{t('Gemäß Zusage für das gewählte Event heute ausleihbar', 'Available for pickup today under the selected event commitment')}: {checkoutAvailable}</Alert>}
                {equipment.error && <Alert severity="warning">{t('Zusagen konnten nicht aktualisiert werden. Die Verfügbarkeit wird beim Buchen erneut geprüft.', 'Commitments could not be refreshed. Availability will be checked again when posting.')}</Alert>}
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
                        onChange={(_, value: TransactionType | null) => value && changeType(value)}
                        aria-label={t('Transaktionstyp', 'Transaction type')}
                        sx={{ '& .MuiToggleButton-root': { minHeight: 52, gap: 0.75, textTransform: 'none', fontWeight: 700 } }}
                    >
                        <ToggleButton title={translate('Eine Ausleihe erfassen', 'Record a checkout')} value="checkout" disabled={!canCheckout}><LogoutIcon />{names.action.checkout}</ToggleButton>
                        <ToggleButton title={translate('Eine Rückgabe erfassen', 'Record a check-in')} value="checkin" disabled={!canEditStock || selectedStock.checkedOut < 1}>
                            <AssignmentReturnIcon />{names.action.checkin} ({selectedStock.checkedOut} {t('draußen', 'out')})
                        </ToggleButton>
                        <ToggleButton title={translate('Eine Bestandszugabe erfassen', 'Record added stock')} value="added" disabled={!canEditStock || isSerialized}><AddBoxIcon />{t('Bestand', 'Add stock')}</ToggleButton>
                    </ToggleButtonGroup>
                    {isSerialized && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            {t('Seriengeräte werden einzeln mit einem Asset-Code angelegt. Nutzen Sie „Seriengeräte“ in den Artikeldetails, um Bestand hinzuzufügen.', 'Serialized assets are added individually with an asset code. Use “Serialized assets” on the item detail page to add stock.')}
                            {(checkoutAvailable < 1 || (isCheckout && !assetsLoading && selectableAssets.length === 0))
                                && ` ${t('Die Ausleihe ist gesperrt, bis ein verfügbares Seriengerät vorhanden ist.', 'Checkout is disabled until an available serialized asset exists.')}`}
                        </Typography>
                    )}
                </Box>
                {isCheckout && (
                    <Box>
                        <Typography component="label" variant="body2" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                            {t('Wofür wird es genutzt?', 'What is it used for?')}
                        </Typography>
                        <ToggleButtonGroup
                            exclusive
                            fullWidth
                            size="small"
                            value={usage}
                            onChange={(_, value: Usage | null) => value && changeUsage(value)}
                            aria-label={t('Nutzung', 'Usage')}
                            sx={{ '& .MuiToggleButton-root': { minHeight: 44, gap: 0.75, textTransform: 'none', fontWeight: 600 } }}
                        >
                            <ToggleButton title={translate('Ausleihe für ein Event und eine Fraktion', 'Checkout for an event and a faction')} value="event"><EventIcon fontSize="small" />{t('Event / Spiel', 'Event / in game')}</ToggleButton>
                            <ToggleButton title={translate('Ausleihe außerhalb des Spiels, z. B. Werkstatt, Aufbau oder Transport', 'Checkout outside the game, e.g. workshop, setup or transport')} value="general"><HandymanOutlinedIcon fontSize="small" />{t('Allgemein (nicht im Spiel)', 'General (not in game)')}</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                )}
                {eventUse && (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '3fr 2fr' }, gap: 2 }}>
                        <TextField
                            select
                            label={t('Event', 'Event')}
                            value={formData.eventOccurrenceId ?? ''}
                            required
                            onChange={(event) => selectOccurrence(event.target.value)}
                        >
                            {events.map((event) => <MenuItem key={event.id} value={event.id}>{event.name} · {formatDate(event.startDate)}</MenuItem>)}
                        </TextField>
                        <TextField
                            select
                            label={t('Fraktion', 'Faction')}
                            value={formData.faction ?? ''}
                            onChange={(e) => setFormData((prev) => ({ ...prev, faction: e.target.value }))}
                            required
                            disabled={!formData.eventOccurrenceId}
                            helperText={formData.eventOccurrenceId ? undefined : t('Zuerst ein Event wählen', 'Choose an event first')}
                        >
                            {factionOptions.map((faction) => <MenuItem key={faction} value={faction}>{faction}</MenuItem>)}
                        </TextField>
                    </Box>
                )}
                {!isSerialized && <TextField select label={isCheckout ? t('Quelllager', 'Source location') : t('Ziellager', 'Destination location')} value={formData.locationId ?? ''} onChange={(event) => setFormData((previous) => ({ ...previous, locationId: event.target.value || undefined }))}>
                    <MenuItem value="">{formData.transactionType === 'checkin' ? t('Rückgabeort des Artikels', 'Item return location') : t('Standardlager des Artikels', 'Item default location')}</MenuItem>
                    {lookup.locationOptions.map((location) => <MenuItem key={location.value} value={location.value}>{location.label}</MenuItem>)}
                </TextField>}
                {selectedItem?.trackingMode === 'lot_tracked' && <TextField select label={t('Charge', 'Lot')} value={formData.lotId ?? ''} required={!isCheckout} onChange={(event) => setFormData((previous) => ({ ...previous, lotId: event.target.value || undefined }))}>
                    <MenuItem value="">{t('Automatisch: frühestes Ablaufdatum', 'Automatic: earliest expiry first')}</MenuItem>
                    {(lots.data ?? []).map((lot) => <MenuItem key={lot.id} value={lot.id}>{lot.lotNumber} · {lot.expiryDate ?? lot.bestBeforeDate ?? ''} · {lot.status ? formatStatus(lot.status) : ''}</MenuItem>)}
                </TextField>}
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
                            required
                            label={t('Ausleihe', 'Custody')}
                            value={custodySource ? custodyKey : ''}
                            onChange={(e) => selectCustodySource(e.target.value)}
                            disabled={custody.isLoading}
                            error={!custody.isLoading && custodySources.length === 0}
                            helperText={custody.isLoading
                                ? t('Ausleihen werden geladen …', 'Loading custody…')
                                : custodySources.length
                                    ? t('Die Rückgabe wird genau dieser Person, diesem Event und dieser Bestellung zugeordnet.', 'The return settles exactly this person, event and order.')
                                    : t('Keine offene Ausleihe für diesen Artikel. Allgemeine Bestellungen werden über die Bestellung zurückgegeben.', 'No outstanding custody for this item. General orders are returned through the order.')}
                            fullWidth
                        >
                            {custodySources.map((row) => (
                                <MenuItem key={row.key} value={row.key}>
                                    {[row.person, row.event || t('Ohne Event', 'No event'),
                                        row.factionOrderId && t('Fraktionsbestellung', 'Faction order'),
                                        `${returnable(row)} ${t('ausstehend', 'outstanding')}`].filter(Boolean).join(' · ')}
                                </MenuItem>
                            ))}
                        </TextField>
                    </>
                )}
                {assetSelectionRequired && (
                    <TextField
                        select
                        label={isCheckout
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
                    <Button title={translate('Die Formularfelder auf ihre Ausgangswerte zurücksetzen', 'Reset the form fields to their initial values')}
                        variant="outlined"
                        color="inherit"
                        onClick={() => {
                            setCustodyKey('');
                            setFormData(initialForm());
                            setUsage(initialUsage);
                            setQuantityInput(String(initialData?.quantityChanged ?? 1));
                        }}
                        disabled={isLoading}
                        sx={{ minHeight: 48 }}
                    >
                        {t('Felder zurücksetzen', 'Reset fields')}
                    </Button>

                    <Button title={translate('Die eingegebene Bestandsbewegung buchen', 'Post the entered stock transaction')}
                        type="submit"
                        variant="contained"
                        disabled={isLoading || !formData.itemId || !formData.reason
                            || (!isSerialized && quantityInvalid) || checkoutContextMissing || custodySourceMissing || assetSelectionMissing}
                        sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}
                    >
                        {t('Transaktion buchen', 'Post transaction')}
                    </Button>
                </Box>
            </Stack>
        </Box>
    );
}
