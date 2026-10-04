import { useAuth } from '../../hooks/useAuth';
import { canEditCatalog } from '../../utils/access';
import { AccordionSummary, Button } from '../shared/ActionButtons';
import { DialogForm, FormDialog, FormSection } from '../shared/FormDialog';
import { ImageAttachments, type ImageAttachmentState } from '../common/ImageAttachments';
import { useState } from 'react';
import {
    Accordion,
    AccordionDetails,
    Box,
    TextField,
    Stack,
    Autocomplete,
    Checkbox,
    FormControlLabel,
    FormHelperText,
    MenuItem,
    Switch,
    Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined';
import { useCreateStorageLocation } from '../../hooks/useStorageLocations';
import { useUIStore } from '../../store/uiStore';
import { EVENT_TYPES, type ItemFormData, type Item, type StorageLocation, type User } from '../../types';
import { useLocalizedText } from '../../utils/naming';

interface Props {
    title: string;
    onCancel: () => void;
    initialData?: Item;
    storageLocations?: StorageLocation[];
    categories?: string[];
    existingNames?: string[];
    assignableUsers?: User[];
    onSubmit: (data: ItemFormData) => void;
    isLoading?: boolean;
}

export function ItemForm({
    title,
    onCancel,
    initialData,
    storageLocations = [],
    categories = [],
    existingNames = [],
    assignableUsers = [],
    onSubmit,
    isLoading,
}: Props) {
    const t = useLocalizedText();
    const { user } = useAuth();
    const canCreatePublic = canEditCatalog(user);
    const [formData, setFormData] = useState<ItemFormData>({
        privateResource: initialData ? Boolean(initialData.access?.privateResource) : true,
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
        privateResource: true,
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

    function handleCreateLocSubmit() {
        if (!newLocData.name.trim()) return;
        createLoc.mutate(newLocData, {
            onSuccess: (newLoc) => {
                setFormData((prev) => ({ ...prev, privateResource: initialData ? prev.privateResource : prev.privateResource || Boolean(newLoc.access?.privateResource), storageLocation: newLoc.id }));
                setAddLocationOpen(false);
                setNewLocData({ name: '', area: '', location: '', position: '', description: '', privateResource: true });
                showSnackbar(t('Lagerort erfolgreich erstellt', 'Storage location created'), 'success');
            },
            onError: () => {
                showSnackbar(t('Fehler beim Erstellen des Lagerorts', 'Could not create storage location'), 'error');
            }
        });
    }

    function handleSubmit() {
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
    const categorySpecific = isVehicle || isGenerator || isFood;
    const hasAdditionalDetails = Boolean(initialData && (initialData.supplier || initialData.hint || initialData.images?.length));

    return (
        <>
            <DialogForm title={title} onSubmit={handleSubmit} onCancel={onCancel} noValidate pending={isLoading} submitDisabled={isDisabled}
                submitLabel={initialData ? t('Artikel speichern', 'Save item') : t('Artikel erstellen', 'Create item')}>
                <FormSection title={t('Grunddaten', 'Basic details')}>
                    <TextField
                        label={t('Name', 'Name')}
                        value={formData.name}
                        onChange={handleChange('name')}
                        required
                        fullWidth
                        error={!!nameError}
                        helperText={nameError}
                    />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <Autocomplete
                            freeSolo
                            fullWidth
                            options={categories}
                            value={formData.category}
                            onInputChange={(_e, newValue) => setFormData((prev) => ({ ...prev, category: newValue }))}
                            renderInput={(params) => <TextField {...params} label={t('Kategorie', 'Category')} fullWidth />}
                        />
                        <TextField
                            label={t('Unterkategorie', 'Subcategory')}
                            value={formData.subcategory ?? ''}
                            onChange={handleChange('subcategory')}
                            helperText={t('Optional', 'Optional')}
                            fullWidth
                        />
                    </Stack>
                    <TextField
                        label={t('Beschreibung', 'Description')}
                        value={formData.description ?? ''}
                        onChange={handleChange('description')}
                        multiline
                        minRows={2}
                        fullWidth
                        helperText={t('Produktdetails und weitere nützliche Informationen', 'Product details and other useful information')}
                    />
                </FormSection>

                <FormSection title={t('Sichtbarkeit', 'Visibility')}>
                    <Box>
                        <FormControlLabel
                            control={<Switch checked={Boolean(formData.privateResource)} disabled={Boolean(initialData) || !canCreatePublic}
                                onChange={(_, checked) => setFormData(prev => ({ ...prev, privateResource: checked }))} />}
                            label={formData.privateResource ? t('Privater Artikel', 'Private item') : t('Im gemeinsamen Katalog', 'In the shared catalog')} />
                        <FormHelperText sx={{ mt: 0 }}>
                            {formData.privateResource
                                ? t('Nur du, HQ-Admins und Personen, für die du ihn freigibst, sehen diesen Artikel.', 'Only you, HQ admins and people you share it with can see this item.')
                                : t('Alle mit Katalogzugriff sehen diesen Artikel.', 'Everyone with catalog access can see this item.')}
                            {initialData ? ` ${t('Die Sichtbarkeit kann nach dem Anlegen nicht geändert werden.', 'Visibility cannot be changed after creation.')}` : ''}
                        </FormHelperText>
                    </Box>
                    {!formData.privateResource && <>
                        <TextField
                            select
                            label={t('Zuordnung', 'Assignment')}
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
                    </>}
                </FormSection>

                <FormSection title={t('Bestand & Nachverfolgung', 'Stock & tracking')}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                            select
                            fullWidth
                            label={t('Bestandsführung', 'Tracking mode')}
                            value={formData.trackingMode ?? 'bulk'}
                            disabled={hasStock}
                            helperText={hasStock ? t('Nicht änderbar, solange Bestand vorhanden ist.', 'Cannot change while stock exists.') : undefined}
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
                    {formData.trackingMode !== 'serialized' && <Box>
                        <FormControlLabel
                            control={(
                                <Checkbox
                                    checked={isBulkPackage}
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
                            label={t('In Boxen gelagert', 'Stored in boxes')}
                        />
                        <FormHelperText sx={{ mt: 0 }}>{t('Mehrere gleiche Artikel pro Box, z. B. 500 Schrauben.', 'Several identical items per box, e.g. 500 screws.')}</FormHelperText>
                    </Box>}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                        {!initialData && (
                            <TextField
                                label={isBulkPackage ? t('Anzahl Boxen', 'Number of boxes') : t('Menge', 'Quantity')}
                                type="number"
                                value={numericInputs.amount}
                                onChange={handleNumberChange('amount')}
                                required
                                fullWidth
                                helperText={formData.trackingMode === 'serialized'
                                    ? t('Legt je Einheit ein Einzelgerät an (z. B. SKU-001).', 'Creates one asset per unit (e.g. SKU-001).')
                                    : isBulkPackage ? t('Anzahl vollständiger Boxen', 'Number of full boxes') : undefined}
                                slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }}
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
                                slotProps={{ htmlInput: { min: 1, inputMode: 'numeric' } }}
                            />
                        )}
                        <TextField
                            label={t('Mindestbestand', 'Minimum stock')}
                            type="number"
                            value={numericInputs.minStock}
                            onChange={handleNumberChange('minStock')}
                            required
                            fullWidth
                            slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }}
                        />
                        <TextField
                            label={t('Einzelwert (€)', 'Unit value (€)')}
                            type="number"
                            value={numericInputs.value}
                            onChange={handleNumberChange('value')}
                            fullWidth
                            slotProps={{ htmlInput: { min: 0, step: 0.01, inputMode: 'decimal' } }}
                        />
                    </Box>
                </FormSection>

                <FormSection title={t('Lagerort', 'Location')}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                        <Autocomplete
                            options={storageLocations}
                            getOptionLabel={(option) => option.name || ''}
                            isOptionEqualToValue={(option, val) => option.id === val.id}
                            value={storageLocations.find((loc) => loc.id === formData.storageLocation) || null}
                            onChange={(_e, newValue) => setFormData((prev) => ({ ...prev, privateResource: initialData ? prev.privateResource : prev.privateResource || Boolean(newValue?.access?.privateResource), storageLocation: newValue ? newValue.id : '' }))}
                            renderInput={(params) => <TextField {...params} label={t('Lagerort', 'Storage location')} fullWidth />}
                            sx={{ flexGrow: 1, minWidth: 0 }}
                        />
                        <Button variant="outlined" startIcon={<AddLocationAltOutlinedIcon />} onClick={() => setAddLocationOpen(true)}
                            aria-label={t('Neuen Lagerort anlegen', 'Create a new storage location')} sx={{ height: 56, flexShrink: 0 }}>
                            {t('Neu', 'New')}
                        </Button>
                    </Box>
                    <Autocomplete
                        options={storageLocations}
                        getOptionLabel={(option) => option.name || ''}
                        isOptionEqualToValue={(option, val) => option.id === val.id}
                        value={storageLocations.find((loc) => loc.id === formData.returnLocation) || null}
                        onChange={(_event, value) => setFormData((prev) => ({ ...prev, returnLocation: value?.id ?? '' }))}
                        renderInput={(params) => (
                            <TextField {...params} label={t('Rückgabeort', 'Return location')} helperText={t('Wohin der Artikel nach Gebrauch zurückkommt', 'Where the item goes back after use')} fullWidth />
                        )}
                    />
                </FormSection>

                <Accordion defaultExpanded={hasAdditionalDetails || categorySpecific}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box>
                            <Typography variant="subtitle2">{t('Weitere Angaben', 'Additional details')}</Typography>
                            <Typography variant="body2" color="text.secondary">{t('Events, Lieferant, Anweisungen und Bilder', 'Events, supplier, instructions and images')}</Typography>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Stack spacing={2}>
                            <Autocomplete
                                multiple
                                options={[...EVENT_TYPES]}
                                value={formData.eventTypes ?? []}
                                onChange={(_event, values) => setFormData((prev) => ({ ...prev, eventTypes: values }))}
                                renderInput={(params) => <TextField {...params} label={t('Benötigt für Events', 'Needed for events')} />}
                            />
                            <TextField
                                label={t('Lieferant', 'Supplier')}
                                value={formData.supplier ?? ''}
                                onChange={handleChange('supplier')}
                                fullWidth
                            />
                            <TextField
                                label={t('Besondere Anweisungen', 'Special instructions')}
                                value={formData.hint ?? ''}
                                onChange={handleChange('hint')}
                                multiline
                                minRows={2}
                                fullWidth
                                helperText={t('Hinweise zur Verwendung, Vorbereitung oder Montage', 'Instructions for use, preparation, or assembly')}
                            />
                            {categorySpecific && (
                                <Stack spacing={2}>
                                    <Typography variant="subtitle2">{t('Kategoriespezifische Angaben', 'Category-specific details')}</Typography>
                                    {isVehicle && (
                                        <>
                                            <TextField
                                                label={t('Kraftstoffverbrauch (l/100 km)', 'Fuel consumption (L/100 km)')}
                                                type="number"
                                                value={numericInputs.fuelConsumptionLitersPer100Km}
                                                onChange={handleNumberChange('fuelConsumptionLitersPer100Km')}
                                                slotProps={{ htmlInput: { min: 0, step: 0.1, inputMode: 'decimal' } }}
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
                                                slotProps={{ htmlInput: { min: 0, step: 0.1, inputMode: 'decimal' } }}
                                            />
                                            <TextField
                                                label={t('Wartungsintervall (Tage)', 'Maintenance interval (days)')}
                                                type="number"
                                                value={numericInputs.maintenanceIntervalDays}
                                                onChange={handleNumberChange('maintenanceIntervalDays')}
                                                slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }}
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
                            <ImageAttachments existing={initialData?.images} value={images} onChange={setImages} disabled={isLoading} />
                        </Stack>
                    </AccordionDetails>
                </Accordion>
            </DialogForm>

            <FormDialog open={addLocationOpen} onClose={() => setAddLocationOpen(false)} maxWidth="xs">
                <DialogForm title={t('Lagerort hinzufügen', 'Add storage location')} onSubmit={handleCreateLocSubmit} onCancel={() => setAddLocationOpen(false)}
                    noValidate pending={createLoc.isPending} submitDisabled={!newLocData.name.trim()} submitLabel={t('Erstellen', 'Create')}>
                    <TextField
                        label={t('Name', 'Name')}
                        value={newLocData.name}
                        onChange={(e) => setNewLocData((prev) => ({ ...prev, name: e.target.value }))}
                        required
                        fullWidth
                        autoFocus
                    />
                    <TextField
                        label={t('Bereich', 'Area')}
                        helperText={t('Optional', 'Optional')}
                        value={newLocData.area}
                        onChange={(e) => setNewLocData((prev) => ({ ...prev, area: e.target.value }))}
                        fullWidth
                    />
                    <TextField
                        label={t('Ort', 'Location')}
                        helperText={t('Optional', 'Optional')}
                        value={newLocData.location}
                        onChange={(e) => setNewLocData((prev) => ({ ...prev, location: e.target.value }))}
                        fullWidth
                    />
                    <TextField
                        label={t('Position', 'Position')}
                        helperText={t('Optional', 'Optional')}
                        value={newLocData.position}
                        onChange={(e) => setNewLocData((prev) => ({ ...prev, position: e.target.value }))}
                        fullWidth
                    />
                    <TextField
                        label={t('Beschreibung', 'Description')}
                        helperText={t('Optional', 'Optional')}
                        value={newLocData.description}
                        onChange={(e) => setNewLocData((prev) => ({ ...prev, description: e.target.value }))}
                        fullWidth
                        multiline
                        minRows={2}
                    />
                </DialogForm>
            </FormDialog>
        </>
    );
}
