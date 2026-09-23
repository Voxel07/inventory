import { Dialog } from '../shared/ClosableDialog';
import { ImageAttachments, type ImageAttachmentState } from '../common/ImageAttachments';
import { useState } from 'react';
import {
    Box,
    TextField,
    Button,
    Stack,
    Autocomplete,
    Tooltip,
    DialogTitle,
    DialogContent,
    DialogActions,
    Checkbox,
    FormControlLabel,
    MenuItem,
    Typography,
} from '@mui/material';
import { useCreateStorageLocation } from '../../hooks/useStorageLocations';
import { useUIStore } from '../../store/uiStore';
import { EVENT_TYPES, type ItemFormData, type Item, type StorageLocation, type User } from '../../types';
import { useLocalizedText } from '../../utils/naming';

interface Props {
    initialData?: Item;
    storageLocations?: StorageLocation[];
    categories?: string[];
    existingNames?: string[];
    assignableUsers?: User[];
    onSubmit: (data: ItemFormData) => void;
    isLoading?: boolean;
}

export function ItemForm({
    initialData,
    storageLocations = [],
    categories = [],
    existingNames = [],
    assignableUsers = [],
    onSubmit,
    isLoading,
}: Props) {
    const t = useLocalizedText();
    const [formData, setFormData] = useState<ItemFormData>({
        name: initialData?.name ?? '',
        description: initialData?.description ?? '',
        amount: undefined,
        minStock: initialData?.minStock ?? 5,
        value: initialData?.value ?? 0,
        category: initialData?.category ?? '',
        subcategory: initialData?.subcategory ?? '',
        supplier: initialData?.supplier ?? '',
        visibilityScope: initialData?.visibilityScope ?? 'global',
        assignedUserId: initialData?.assignedUserId ?? '',
        assignedGroup: initialData?.assignedGroup ?? '',
        eventTypes: initialData ? (initialData.eventTypes ?? []) : [...EVENT_TYPES],
        storageLocation: initialData?.storageLocation ?? '',
        returnLocation: initialData?.returnLocation ?? initialData?.storageLocation ?? '',
        hint: initialData?.hint ?? '',
        isConsumable: initialData?.isConsumable ?? false,
        trackingMode: initialData?.trackingMode ?? 'bulk',
        inventoryRole: initialData?.inventoryRole ?? (initialData?.isConsumable ? 'consumable' : 'returnable'),
        imageFiles: [],
        removeImages: [],
        containerSize: initialData?.containerSize ?? undefined,
        containerCount: initialData?.containerCount ?? undefined,
        containersOpened: initialData?.containersOpened ?? undefined,
        containerRemainingPercent: initialData?.containerRemainingPercent ?? undefined,
        maintenanceIntervalDays: initialData?.maintenanceIntervalDays,
        nextMaintenanceDue: initialData?.nextMaintenanceDue ?? '',
        currentOperatingHours: initialData?.currentOperatingHours,
        maintenanceStatus: initialData?.maintenanceStatus ?? 'certified',
        fuelConsumptionLitersPer100Km: initialData?.fuelConsumptionLitersPer100Km,
        batteryReplacementDue: initialData?.batteryReplacementDue ?? '',
        bestBeforeDate: initialData?.bestBeforeDate ?? '',
    });
    const [isBulkPackage, setIsBulkPackage] = useState((initialData?.containerSize ?? 0) > 0);
    const [numericInputs, setNumericInputs] = useState({
        amount: '',
        minStock: String(initialData?.minStock ?? 5),
        value: String(initialData?.value ?? 0),
        containerSize: initialData?.containerSize == null ? '' : String(initialData.containerSize),
        containerCount: initialData?.containerCount == null ? '' : String(initialData.containerCount),
        containersOpened: initialData?.containersOpened == null ? '' : String(initialData.containersOpened),
        containerRemainingPercent: initialData?.containerRemainingPercent == null ? '' : String(initialData.containerRemainingPercent),
        maintenanceIntervalDays: initialData?.maintenanceIntervalDays == null ? '' : String(initialData.maintenanceIntervalDays),
        currentOperatingHours: initialData?.currentOperatingHours == null ? '' : String(initialData.currentOperatingHours),
        fuelConsumptionLitersPer100Km: initialData?.fuelConsumptionLitersPer100Km == null ? '' : String(initialData.fuelConsumptionLitersPer100Km),
    });
    const [nameError, setNameError] = useState('');
    const [images, setImages] = useState<ImageAttachmentState>({ files: [], removed: [], replacements: {} });
    const [addLocationOpen, setAddLocationOpen] = useState(false);
    const [newLocData, setNewLocData] = useState({
        name: '',
        area: '',
        location: '',
        position: '',
        description: '',
    });

    const createLoc = useCreateStorageLocation();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const hasStock = Boolean(initialData && ((initialData.stock?.totalOwned ?? initialData.amount ?? 0) > 0));

    function handleChange(field: keyof ItemFormData) {
        return (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
            if (field === 'name') {
                const trimmed = (value as string).trim().toLowerCase();
                const isDuplicate = existingNames.some((n) => n.toLowerCase() === trimmed);
                setNameError(isDuplicate ? t('Ein Artikel mit diesem Namen existiert bereits', 'An item with this name already exists') : '');
            }
            setFormData((prev) => ({ ...prev, [field]: value }));
        };
    }

    function handleNumberChange(field: keyof typeof numericInputs) {
        return (e: React.ChangeEvent<HTMLInputElement>) => {
            setNumericInputs((prev) => ({ ...prev, [field]: e.target.value }));
        };
    }

    function handleCreateLocSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!newLocData.name.trim()) return;
        createLoc.mutate(newLocData, {
            onSuccess: (newLoc) => {
                setFormData((prev) => ({ ...prev, storageLocation: newLoc.id }));
                setAddLocationOpen(false);
                setNewLocData({ name: '', area: '', location: '', position: '', description: '' });
                showSnackbar(t('Lagerort erfolgreich erstellt', 'Storage location created'), 'success');
            },
            onError: () => {
                showSnackbar(t('Fehler beim Erstellen des Lagerorts', 'Could not create storage location'), 'error');
            }
        });
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (nameError) return;
        const parseOptional = (value: string) => value === '' ? undefined : Number(value);
        const submitData: ItemFormData = {
            ...formData,
            imageFiles: images.files,
            removeImages: images.removed,
            imageReplacements: images.replacements,
            amount: parseOptional(numericInputs.amount),
            minStock: Number(numericInputs.minStock),
            value: Number(numericInputs.value),
            containerSize: isBulkPackage ? parseOptional(numericInputs.containerSize) : undefined,
            containerCount: isBulkPackage
                ? (initialData ? (initialData.containerCount ?? initialData.amount) : parseOptional(numericInputs.amount))
                : undefined,
            containersOpened: isBulkPackage ? parseOptional(numericInputs.containersOpened) : undefined,
            containerRemainingPercent: isBulkPackage ? parseOptional(numericInputs.containerRemainingPercent) : undefined,
            maintenanceIntervalDays: parseOptional(numericInputs.maintenanceIntervalDays),
            currentOperatingHours: parseOptional(numericInputs.currentOperatingHours),
            fuelConsumptionLitersPer100Km: parseOptional(numericInputs.fuelConsumptionLitersPer100Km),
        };
        onSubmit(submitData);
    }

    const amountValid = !!initialData || (numericInputs.amount !== '' && Number(numericInputs.amount) >= 0);
    const containerSizeValid = !isBulkPackage
        || (numericInputs.containerSize !== '' && Number(numericInputs.containerSize) > 0);
    const requiredNumbersValid = numericInputs.minStock !== '' && Number(numericInputs.minStock) >= 0
        && numericInputs.value !== '' && Number(numericInputs.value) >= 0;
    const assignmentValid = formData.visibilityScope !== 'person' || Boolean(formData.assignedUserId);
    const groupValid = formData.visibilityScope !== 'group' || Boolean(formData.assignedGroup?.trim());
    const eventScopeValid = formData.visibilityScope !== 'event' || Boolean(formData.eventTypes?.length);
    const isDisabled = isLoading || !formData.name || !!nameError || !amountValid || !containerSizeValid
        || !requiredNumbersValid || !assignmentValid || !groupValid || !eventScopeValid;
    const normalizedCategory = formData.category.trim().toLocaleLowerCase();
    const isVehicle = ['vehicle', 'vehicles', 'fahrzeug', 'fahrzeuge'].some((value) => normalizedCategory.includes(value));
    const isGenerator = ['generator', 'stromerzeuger', 'aggregat'].some((value) => normalizedCategory.includes(value));
    const isFood = ['food', 'lebensmittel', 'verpflegung'].some((value) => normalizedCategory.includes(value));

    return (
        <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
                <TextField
                    label={t('Name', 'Name')}
                    value={formData.name}
                    onChange={handleChange('name')}
                    required
                    fullWidth
                    error={!!nameError}
                    helperText={nameError}
                />
                <TextField
                    label={t('Produktdetails / zusätzliche Informationen', 'Product details / additional information')}
                    value={formData.description ?? ''}
                    onChange={handleChange('description')}
                    multiline
                    minRows={3}
                    fullWidth
                />
                <Box sx={{ display: 'flex', alignItems: 'flex-start', columnGap: 2, flexWrap: 'wrap' }}>
                    <FormControlLabel
                        control={<Checkbox checked={Boolean(formData.isConsumable)} onChange={(event) => setFormData((prev) => ({
                            ...prev,
                            isConsumable: event.target.checked,
                            inventoryRole: event.target.checked ? 'consumable'
                                : prev.inventoryRole === 'consumable' ? 'returnable' : prev.inventoryRole,
                            trackingMode: event.target.checked && prev.trackingMode === 'serialized' ? 'bulk' : prev.trackingMode,
                        }))} />}
                        label={t('Verbrauchsmaterial', 'Consumable')}
                    />
                    <FormControlLabel
                        control={(
                            <Checkbox
                                checked={isBulkPackage}
                                disabled={formData.trackingMode === 'serialized'}
                                onChange={(event) => {
                                    const checked = event.target.checked;
                                    setIsBulkPackage(checked);
                                    if (!checked) {
                                        setNumericInputs((prev) => ({
                                            ...prev,
                                            containerSize: '',
                                            containerCount: '',
                                            containersOpened: '',
                                            containerRemainingPercent: '',
                                        }));
                                    }
                                }}
                            />
                        )}
                        label={t('Box mit mehreren gleichen Artikeln', 'Box with multiple identical items')}
                    />
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                        select
                        fullWidth
                        label={t('Bestandsführung', 'Tracking mode')}
                        value={formData.trackingMode ?? 'bulk'}
                        disabled={hasStock}
                        helperText={hasStock ? t('Bestandsführung kann bei Artikeln mit Bestand nicht geändert werden.', 'Tracking mode cannot be changed for items with existing stock.') : undefined}
                        onChange={(event) => {
                            const trackingMode = event.target.value as ItemFormData['trackingMode'];
                            setFormData((prev) => ({
                                ...prev,
                                trackingMode,
                                inventoryRole: trackingMode === 'serialized' && prev.inventoryRole === 'consumable'
                                    ? 'returnable' : prev.inventoryRole,
                                isConsumable: trackingMode === 'serialized' ? false : prev.isConsumable,
                            }));
                            if (trackingMode === 'serialized') setIsBulkPackage(false);
                        }}
                    >
                        <MenuItem value="bulk">{t('Mengenbestand', 'Bulk')}</MenuItem>
                        <MenuItem value="serialized">{t('Einzelgeräte / Seriennummern', 'Serialized assets')}</MenuItem>
                        <MenuItem value="lot_tracked">{t('Chargenbestand', 'Lot tracked')}</MenuItem>
                    </TextField>
                    <TextField
                        select
                        fullWidth
                        label={t('Inventarrolle', 'Inventory role')}
                        value={formData.inventoryRole ?? 'returnable'}
                        onChange={(event) => {
                            const inventoryRole = event.target.value as ItemFormData['inventoryRole'];
                            setFormData((prev) => ({
                                ...prev,
                                inventoryRole,
                                isConsumable: inventoryRole === 'consumable',
                                trackingMode: inventoryRole === 'consumable' && prev.trackingMode === 'serialized'
                                    ? 'bulk' : prev.trackingMode,
                            }));
                        }}
                    >
                        <MenuItem value="consumable">{t('Verbrauchsmaterial', 'Consumable')}</MenuItem>
                        <MenuItem value="returnable">{t('Rückgabepflichtig', 'Returnable')}</MenuItem>
                        <MenuItem value="repairable">{t('Reparierbar', 'Repairable')}</MenuItem>
                        <MenuItem value="rental">{t('Mietgerät', 'Rental')}</MenuItem>
                    </TextField>
                </Stack>
                {!initialData && (
                    <TextField
                        label={isBulkPackage ? t('Anzahl der Boxen', 'Number of boxes') : t('Menge', 'Amount')}
                        type="number"
                        value={numericInputs.amount}
                        onChange={handleNumberChange('amount')}
                        required
                        fullWidth
                        helperText={formData.trackingMode === 'serialized'
                            ? t('Erstellt automatisch die entsprechende Anzahl an Einzelgeräten/Assets (z. B. SKU-001..).', 'Automatically creates the corresponding number of asset instances (e.g. SKU-001..).')
                            : isBulkPackage ? t('Die Menge wird als Anzahl vollständiger Boxen gespeichert', 'The amount is stored as the number of full boxes') : undefined}
                        slotProps={{ htmlInput: { min: 0 } }}
                    />
                )}
                {isBulkPackage && (
                    <TextField
                        label={t('Artikel pro Box', 'Items per box')}
                        type="number"
                        value={numericInputs.containerSize}
                        onChange={handleNumberChange('containerSize')}
                        required
                        fullWidth
                        helperText={t('z. B. 500 Schrauben pro Box', 'e.g. 500 screws per box')}
                        slotProps={{ htmlInput: { min: 1 } }}
                    />
                )}
                <TextField
                    label={t('Mindestbestand', 'Minimum stock')}
                    type="number"
                    value={numericInputs.minStock}
                    onChange={handleNumberChange('minStock')}
                    required
                    fullWidth
                    slotProps={{ htmlInput: { min: 0 } }}
                />
                <TextField
                    label={t('Einzelwert (€)', 'Unit value (€)')}
                    type="number"
                    value={numericInputs.value}
                    onChange={handleNumberChange('value')}
                    fullWidth
                    slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                />
                <Autocomplete
                    freeSolo
                    options={categories}
                    value={formData.category}
                    onInputChange={(_e, newValue) => setFormData((prev) => ({ ...prev, category: newValue }))}
                    renderInput={(params) => (
                        <TextField {...params} label={t('Kategorie', 'Category')} fullWidth />
                    )}
                />
                <TextField
                    label={t('Unterkategorie (optional)', 'Subcategory (optional)')}
                    value={formData.subcategory ?? ''}
                    onChange={handleChange('subcategory')}
                    fullWidth
                />
                {(isVehicle || isGenerator || isFood) && (
                    <Stack spacing={2} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                        <Typography variant="subtitle2">{t('Kategoriespezifische Angaben', 'Category-specific details')}</Typography>
                        {isVehicle && (
                            <>
                                <TextField
                                    label={t('Kraftstoffverbrauch (l/100 km)', 'Fuel consumption (L/100 km)')}
                                    type="number"
                                    value={numericInputs.fuelConsumptionLitersPer100Km}
                                    onChange={handleNumberChange('fuelConsumptionLitersPer100Km')}
                                    slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
                                />
                                <TextField
                                    label={t('Batteriewechsel fällig', 'Battery replacement due')}
                                    type="date"
                                    value={formData.batteryReplacementDue ?? ''}
                                    onChange={handleChange('batteryReplacementDue')}
                                    slotProps={{ inputLabel: { shrink: true } }}
                                />
                            </>
                        )}
                        {isGenerator && (
                            <>
                                <TextField
                                    label={t('Betriebsstunden', 'Running hours')}
                                    type="number"
                                    value={numericInputs.currentOperatingHours}
                                    onChange={handleNumberChange('currentOperatingHours')}
                                    slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
                                />
                                <TextField
                                    label={t('Wartungsintervall (Tage)', 'Maintenance interval (days)')}
                                    type="number"
                                    value={numericInputs.maintenanceIntervalDays}
                                    onChange={handleNumberChange('maintenanceIntervalDays')}
                                    slotProps={{ htmlInput: { min: 0 } }}
                                />
                                <TextField
                                    label={t('Nächste Wartung', 'Next maintenance')}
                                    type="date"
                                    value={formData.nextMaintenanceDue ?? ''}
                                    onChange={handleChange('nextMaintenanceDue')}
                                    slotProps={{ inputLabel: { shrink: true } }}
                                />
                            </>
                        )}
                        {isFood && (
                            <TextField
                                label={t('Mindestens haltbar bis', 'Best before date')}
                                type="date"
                                value={formData.bestBeforeDate ?? ''}
                                onChange={handleChange('bestBeforeDate')}
                                slotProps={{ inputLabel: { shrink: true } }}
                            />
                        )}
                    </Stack>
                )}
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <Autocomplete
                        options={storageLocations}
                        getOptionLabel={(option) => option.name || ''}
                        isOptionEqualToValue={(option, val) => option.id === val.id}
                        value={storageLocations.find((loc) => loc.id === formData.storageLocation) || null}
                        onChange={(_e, newValue) => setFormData((prev) => ({ ...prev, storageLocation: newValue ? newValue.id : '' }))}
                        renderInput={(params) => (
                            <TextField {...params} label={t('Lagerort', 'Storage location')} fullWidth />
                        )}
                        sx={{ flexGrow: 1 }}
                    />
                    <Button
                        variant="outlined"
                        onClick={() => setAddLocationOpen(true)}
                        sx={{ height: 56, minWidth: 56, p: 0, fontSize: '1.5rem' }}
                    >
                        +
                    </Button>
                </Box>

                <Autocomplete
                    options={storageLocations}
                    getOptionLabel={(option) => option.name || ''}
                    isOptionEqualToValue={(option, val) => option.id === val.id}
                    value={storageLocations.find((loc) => loc.id === formData.returnLocation) || null}
                    onChange={(_event, value) => setFormData((prev) => ({ ...prev, returnLocation: value?.id ?? '' }))}
                    renderInput={(params) => (
                        <TextField {...params} label={t('Vorgesehener Rückgabeort', 'Expected return location')} fullWidth />
                    )}
                />

                <TextField
                    select
                    label={t('Sichtbarkeit / Zuordnung', 'Visibility / assignment')}
                    value={formData.visibilityScope ?? 'global'}
                    onChange={(event) => setFormData((prev) => ({
                        ...prev,
                        visibilityScope: event.target.value as ItemFormData['visibilityScope'],
                    }))}
                >
                    <MenuItem value="global">{t('Allgemeiner Bestand', 'Shared inventory')}</MenuItem>
                    <MenuItem value="event">{t('Eventbezogen', 'Event driven')}</MenuItem>
                    <MenuItem value="person">{t('Nur für eine Person', 'Assigned to one person')}</MenuItem>
                    <MenuItem value="group">{t('Nur für eine Gruppe', 'Assigned to one group')}</MenuItem>
                </TextField>
                {formData.visibilityScope === 'person' && (
                    <Autocomplete
                        options={assignableUsers}
                        getOptionLabel={(user) => user.name || user.email}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        value={assignableUsers.find((user) => user.id === formData.assignedUserId) || null}
                        onChange={(_event, user) => setFormData((prev) => ({ ...prev, assignedUserId: user?.id ?? '' }))}
                        renderInput={(params) => <TextField {...params} required label={t('Zugeordnete Person', 'Assigned person')} />}
                    />
                )}
                {formData.visibilityScope === 'group' && (
                    <TextField
                        required
                        label={t('Zugeordnete Gruppe', 'Assigned group')}
                        value={formData.assignedGroup ?? ''}
                        onChange={handleChange('assignedGroup')}
                        helperText={t('Zum Beispiel eine Fraktion oder ein lokales Team', 'For example a faction or local team')}
                    />
                )}

                <Autocomplete
                    multiple
                    options={[...EVENT_TYPES]}
                    value={formData.eventTypes ?? []}
                    onChange={(_event, values) => setFormData((prev) => ({ ...prev, eventTypes: values }))}
                    renderInput={(params) => <TextField {...params} label={t('Benötigt für Events', 'Needed for events')} />}
                />
                <TextField
                    label={t('Lieferant (optional)', 'Supplier (optional)')}
                    value={formData.supplier ?? ''}
                    onChange={handleChange('supplier')}
                    fullWidth
                />
                <TextField
                    label={t('Hinweis / besondere Anweisungen', 'Hint / special instructions')}
                    value={formData.hint ?? ''}
                    onChange={handleChange('hint')}
                    multiline
                    minRows={3}
                    fullWidth
                    helperText={t('Hinweise zur Verwendung, Vorbereitung oder Montage', 'Instructions for use, preparation, or assembly')}
                />
                <ImageAttachments existing={initialData?.images} value={images} onChange={setImages} disabled={isLoading} />

                <Tooltip title={initialData ? t('Änderungen an diesem Artikel speichern', 'Save changes to this item') : t('Neuen Artikel im Inventar erstellen', 'Create a new inventory item')} arrow>
                    <span>
                        <Button type="submit" variant="contained" disabled={isDisabled}>
                            {initialData ? t('Artikel aktualisieren', 'Update item') : t('Artikel erstellen', 'Create item')}
                        </Button>
                    </span>
                </Tooltip>
            </Stack>

            {/* Quick Add Storage Location Dialog */}
            <Dialog open={addLocationOpen} onClose={() => setAddLocationOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('Lagerort hinzufügen', 'Add storage location')}</DialogTitle>
                <DialogContent>
                    <Box component="form" onSubmit={handleCreateLocSubmit} noValidate sx={{ mt: 1 }}>
                        <Stack spacing={2}>
                            <TextField
                                label={t('Name', 'Name')}
                                value={newLocData.name}
                                onChange={(e) => setNewLocData((prev) => ({ ...prev, name: e.target.value }))}
                                required
                                fullWidth
                                autoFocus
                            />
                            <TextField
                                label={t('Bereich (optional)', 'Area (optional)')}
                                value={newLocData.area}
                                onChange={(e) => setNewLocData((prev) => ({ ...prev, area: e.target.value }))}
                                fullWidth
                            />
                            <TextField
                                label={t('Ort (optional)', 'Location (optional)')}
                                value={newLocData.location}
                                onChange={(e) => setNewLocData((prev) => ({ ...prev, location: e.target.value }))}
                                fullWidth
                            />
                            <TextField
                                label={t('Position (optional)', 'Position (optional)')}
                                value={newLocData.position}
                                onChange={(e) => setNewLocData((prev) => ({ ...prev, position: e.target.value }))}
                                fullWidth
                            />
                            <TextField
                                label={t('Beschreibung (optional)', 'Description (optional)')}
                                value={newLocData.description}
                                onChange={(e) => setNewLocData((prev) => ({ ...prev, description: e.target.value }))}
                                fullWidth
                                multiline
                                rows={2}
                            />
                        </Stack>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddLocationOpen(false)}>{t('Abbrechen', 'Cancel')}</Button>
                    <Button
                        onClick={handleCreateLocSubmit}
                        variant="contained"
                        disabled={createLoc.isPending || !newLocData.name.trim()}
                    >
                        {createLoc.isPending ? t('Wird erstellt...', 'Creating...') : t('Erstellen', 'Create')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
