import { useAuth } from '../../hooks/useAuth';
import { useFactionCatalog } from '../../hooks/useFactionCatalog';
import { canCreateInventory, canEditCatalog } from '../../utils/access';
import { AccordionSummary, Button } from '../shared/ActionButtons';
import { DialogForm, FormDialog, FormSection } from '../shared/FormDialog';
import { ImageAttachments, type ImageAttachmentState } from '../common/ImageAttachments';
import { useState } from 'react';
import {
    Accordion,
    AccordionDetails,
    Box,
    Stack,
    Autocomplete,
    Checkbox,
    FormControlLabel,
    FormHelperText,
    MenuItem,
    Switch,
    Tooltip,
    Typography,
} from '@mui/material';
import { TextField } from '../shared/DateTextField';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined';
import { useCreateStorageLocation } from '../../hooks/useStorageLocations';
import { useUIStore } from '../../store/uiStore';
import { type ItemFormData, type Item, type StorageLocation } from '../../types';
import { useT } from '../../utils/naming';
import { LocationPicker } from '../shared/LocationPicker';

interface Props {
    title: string;
    onCancel: () => void;
    initialData?: Item;
    storageLocations?: StorageLocation[];
    categories?: string[];
    existingNames?: string[];
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
    onSubmit,
    isLoading,
}: Props) {
    const t = useT();
    const { eventTypes } = useFactionCatalog();
    const { user } = useAuth();
    const canCreatePublic = canEditCatalog(user);
    const canCreateLocation = canCreateInventory(user);
    const [formData, setFormData] = useState<ItemFormData>({
        // Staff add to the shared catalog by default; members can only create private items.
        privateResource: initialData ? Boolean(initialData.access?.privateResource) : !canCreatePublic,
        name: initialData?.name ?? '',
        description: initialData?.description ?? '',
        amount: undefined,
        minStock: initialData?.minStock ?? 5,
        value: initialData?.value ?? 0,
        category: initialData?.category ?? '',
        subcategory: initialData?.subcategory ?? '',
        supplier: initialData?.supplier ?? '',
        eventTypes: initialData ? (initialData.eventTypes ?? []) : [...eventTypes],
        storageLocation: initialData?.storageLocation ?? '',
        positionDetails: initialData?.positionDetails ?? '',
        returnLocation: initialData?.returnLocation ?? initialData?.storageLocation ?? '',
        hint: initialData?.hint ?? '',
        trackingMode: initialData?.trackingMode ?? 'bulk',
        inventoryRole: initialData?.inventoryRole ?? 'returnable',
        imageFiles: [],
        removeImages: [],
        containerSize: initialData?.containerSize ?? undefined,
        containerCount: initialData?.containerCount ?? undefined,
        containersOpened: initialData?.containersOpened ?? undefined,
        containerRemainingPercent: initialData?.containerRemainingPercent ?? undefined,
        maintenanceIntervalDays: initialData?.maintenanceIntervalDays,
        nextMaintenanceDue: initialData?.nextMaintenanceDue ?? '',
        currentOperatingHours: initialData?.currentOperatingHours,
        tracksRuntime: initialData?.tracksRuntime ?? false,
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
        assetStartNumber: '1',
    });
    const [assetCodePrefix, setAssetCodePrefix] = useState('');
    const [nameError, setNameError] = useState('');
    const [images, setImages] = useState<ImageAttachmentState>({ files: [], removed: [], replacements: {} });
    const [addLocationOpen, setAddLocationOpen] = useState(false);
    const emptyLocation = { name: '', code: '', parentLocationId: null as string | null, warehouseId: null as string | null, description: '', privateResource: !canCreatePublic };
    const [newLocData, setNewLocData] = useState(emptyLocation);

    const createLoc = useCreateStorageLocation();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const hasStock = Boolean(initialData && ((initialData.stock?.totalOwned ?? 0) > 0));

    function handleChange(field: keyof ItemFormData) {
        return (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
            if (field === 'name') {
                const trimmed = (value as string).trim().toLowerCase();
                const isDuplicate = existingNames.some((n) => n.toLowerCase() === trimmed);
                setNameError(isDuplicate ? t('forms.itemForm.anItemWithThisNameAlreadyExists') : '');
            }
            setFormData((prev) => ({ ...prev, [field]: value }));
        };
    }

    function handleNumberChange(field: keyof typeof numericInputs) {
        return (e: React.ChangeEvent<HTMLInputElement>) => {
            setNumericInputs((prev) => ({ ...prev, [field]: e.target.value }));
        };
    }

    /** The return location follows the storage location until it is set to a different place. */
    function storageLocationChange(prev: ItemFormData, storageLocation: string) {
        const followsStorage = !prev.returnLocation || prev.returnLocation === prev.storageLocation;
        return { storageLocation, returnLocation: followsStorage ? storageLocation : prev.returnLocation };
    }

    function handleCreateLocSubmit() {
        if (!newLocData.name.trim()) return;
        createLoc.mutate(newLocData, {
            onSuccess: (newLoc) => {
                setFormData((prev) => ({ ...prev, privateResource: initialData ? prev.privateResource : prev.privateResource || Boolean(newLoc.access?.privateResource), ...storageLocationChange(prev, newLoc.id) }));
                setAddLocationOpen(false);
                setNewLocData(emptyLocation);
                showSnackbar(t('forms.itemForm.storageLocationCreated'), 'success');
            },
            onError: () => {
                showSnackbar(t('forms.itemForm.couldNotCreateStorageLocation'), 'error');
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
                ? (initialData ? initialData.containerCount : parseOptional(numericInputs.amount))
                : undefined,
            containersOpened: isBulkPackage ? parseOptional(numericInputs.containersOpened) : undefined,
            containerRemainingPercent: isBulkPackage ? parseOptional(numericInputs.containerRemainingPercent) : undefined,
            maintenanceIntervalDays: parseOptional(numericInputs.maintenanceIntervalDays),
            currentOperatingHours: parseOptional(numericInputs.currentOperatingHours),
            fuelConsumptionLitersPer100Km: parseOptional(numericInputs.fuelConsumptionLitersPer100Km),
            ...(generatesAssetCodes ? {
                assetCodePrefix: assetCodePrefix.trim() || undefined,
                assetStartNumber: parseOptional(numericInputs.assetStartNumber),
            } : {}),
        };
        onSubmit(submitData);
    }

    const amountValid = !!initialData || (numericInputs.amount !== '' && Number(numericInputs.amount) >= 0);
    const generatesAssetCodes = !initialData && formData.trackingMode === 'serialized';
    const startNumber = Number(numericInputs.assetStartNumber);
    const assetStartValid = !generatesAssetCodes || (numericInputs.assetStartNumber !== '' && Number.isInteger(startNumber) && startNumber >= 1);
    /** Mirrors the server: uppercase prefix (SKU- when empty) and a number padded to three digits. */
    const assetCodePreview = (() => {
        const count = Math.max(0, Math.floor(Number(numericInputs.amount) || 0));
        if (!assetStartValid || count === 0) return '';
        const prefix = assetCodePrefix.trim().toLocaleUpperCase() || 'SKU-';
        const code = (n: number) => `${prefix}${String(n).padStart(3, '0')}`;
        return count === 1 ? code(startNumber) : `${code(startNumber)} … ${code(startNumber + count - 1)}`;
    })();
    const containerSizeValid = !isBulkPackage
        || (numericInputs.containerSize !== '' && Number(numericInputs.containerSize) > 0);
    const requiredNumbersValid = numericInputs.minStock !== '' && Number(numericInputs.minStock) >= 0
        && numericInputs.value !== '' && Number(numericInputs.value) >= 0;
    const isDisabled = isLoading || !formData.name || !!nameError || !amountValid || !containerSizeValid
        || !requiredNumbersValid || !assetStartValid;
    const normalizedCategory = formData.category.trim().toLocaleLowerCase();
    const isVehicle = ['vehicle', 'vehicles', 'fahrzeug', 'fahrzeuge'].some((value) => normalizedCategory.includes(value));
    const isGenerator = ['generator', 'stromerzeuger', 'aggregat'].some((value) => normalizedCategory.includes(value));
    const isFood = ['food', 'lebensmittel', 'verpflegung'].some((value) => normalizedCategory.includes(value));
    const categorySpecific = isVehicle || isGenerator || isFood;
    const hasAdditionalDetails = Boolean(initialData && (initialData.supplier || initialData.hint || initialData.images?.length));
    const trackingModes: { value: NonNullable<ItemFormData['trackingMode']>; label: string; help: string }[] = [
        { value: 'bulk', label: t('forms.itemForm.bulk'), help: t('forms.itemForm.onlyTheQuantityCountsEGCableTiesOrTent') },
        { value: 'serialized', label: t('forms.itemForm.serializedAssets'), help: t('forms.itemForm.everyUnitIsTrackedIndividuallyWithAssetCodeConditionOperating') },
        { value: 'lot_tracked', label: t('forms.itemForm.lotTracked'), help: t('forms.itemForm.quantityPerLotWithLotNumberAndExpiryDateE') },
    ];

    return (
        <>
            <DialogForm title={title} onSubmit={handleSubmit} onCancel={onCancel} noValidate pending={isLoading} submitDisabled={isDisabled}
                submitLabel={initialData ? t('forms.itemForm.saveItem') : t('forms.itemForm.createItem')}>
                <FormSection title={t('forms.itemForm.basicDetails')}>
                    <TextField
                        label={t('profile.name')}
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
                            renderInput={(params) => <TextField {...params} label={t('common.category')} fullWidth />}
                        />
                        <TextField
                            label={t('forms.itemForm.subcategory')}
                            value={formData.subcategory ?? ''}
                            onChange={handleChange('subcategory')}
                            helperText={t('forms.itemForm.optional')}
                            fullWidth
                        />
                    </Stack>
                    <TextField
                        label={t('common.description')}
                        value={formData.description ?? ''}
                        onChange={handleChange('description')}
                        multiline
                        minRows={2}
                        fullWidth
                        helperText={t('forms.itemForm.productDetailsAndOtherUsefulInformation')}
                    />
                </FormSection>

                <FormSection title={t('common.visibility')}>
                    <Box>
                        <FormControlLabel
                            control={<Switch checked={Boolean(formData.privateResource)} disabled={Boolean(initialData) || !canCreatePublic}
                                onChange={(_, checked) => setFormData(prev => ({ ...prev, privateResource: checked }))} />}
                            label={formData.privateResource ? t('forms.itemForm.privateItem') : t('forms.itemForm.inTheSharedCatalog')} />
                        <FormHelperText sx={{ mt: 0 }}>
                            {formData.privateResource
                                ? t('forms.itemForm.onlyYouInventoryAdminsAndPeopleYouShareItWith')
                                : t('forms.itemForm.everyoneWithCatalogAccessCanSeeThisItem')}
                            {initialData ? ` ${t('forms.itemForm.visibilityCannotBeChangedAfterCreation')}` : ''}
                        </FormHelperText>
                    </Box>
                </FormSection>

                <FormSection title={t('forms.itemForm.stockTracking')}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                            select
                            fullWidth
                            label={t('forms.itemForm.trackingMode')}
                            value={formData.trackingMode ?? 'bulk'}
                            disabled={hasStock}
                            helperText={hasStock
                                ? t('forms.itemForm.cannotChangeWhileStockExists')
                                : trackingModes.find((mode) => mode.value === (formData.trackingMode ?? 'bulk'))?.help}
                            onChange={(event) => {
                                const trackingMode = event.target.value as ItemFormData['trackingMode'];
                                setFormData((prev) => ({
                                    ...prev,
                                    trackingMode,
                                    inventoryRole: trackingMode === 'serialized' && prev.inventoryRole === 'consumable'
                                        ? 'returnable' : prev.inventoryRole,
                                }));
                                if (trackingMode === 'serialized') setIsBulkPackage(false);
                            }}
                        >
                            {trackingModes.map((mode) => (
                                <MenuItem key={mode.value} value={mode.value}>
                                    <Tooltip title={mode.help} placement="right" arrow enterDelay={300}>
                                        <Box component="span" sx={{ width: '100%' }}>{mode.label}</Box>
                                    </Tooltip>
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            fullWidth
                            label={t('forms.itemForm.inventoryRole')}
                            value={formData.inventoryRole ?? 'returnable'}
                            onChange={(event) => {
                                const inventoryRole = event.target.value as ItemFormData['inventoryRole'];
                                setFormData((prev) => ({
                                    ...prev,
                                    inventoryRole,
                                    trackingMode: inventoryRole === 'consumable' && prev.trackingMode === 'serialized'
                                        ? 'bulk' : prev.trackingMode,
                                }));
                            }}
                        >
                            <MenuItem value="consumable">{t('enum.value.consumable')}</MenuItem>
                            <MenuItem value="returnable">{t('enum.value.returnable')}</MenuItem>
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
                            label={t('forms.itemForm.storedInBoxes')}
                        />
                        <FormHelperText sx={{ mt: 0 }}>{t('forms.itemForm.severalIdenticalItemsPerBoxEG500Screws')}</FormHelperText>
                    </Box>}
                    {formData.inventoryRole !== 'consumable' && <Box>
                        <FormControlLabel
                            control={<Checkbox checked={Boolean(formData.tracksRuntime)} onChange={(event) => setFormData((prev) => ({ ...prev, tracksRuntime: event.target.checked }))} />}
                            label={t('forms.itemForm.recordOperatingHoursOnReturn')}
                        />
                        <FormHelperText sx={{ mt: 0 }}>{t('forms.itemForm.recordOperatingHoursOnReturnHelp')}</FormHelperText>
                    </Box>}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                        {!initialData && (
                            <TextField
                                label={isBulkPackage ? t('forms.itemForm.numberOfBoxes') : t('common.quantity')}
                                type="number"
                                value={numericInputs.amount}
                                onChange={handleNumberChange('amount')}
                                required
                                fullWidth
                                helperText={formData.trackingMode === 'serialized'
                                    ? t('forms.itemForm.createsOneAssetPerUnitEGSKU001')
                                    : formData.trackingMode === 'lot_tracked' ? t('forms.itemForm.openingStockBecomesTheFirstLot')
                                    : isBulkPackage ? t('forms.itemForm.numberOfFullBoxes') : undefined}
                                slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }}
                            />
                        )}
                        {generatesAssetCodes && (<>
                            <TextField
                                label={t('forms.itemForm.assetCodePrefix')}
                                value={assetCodePrefix}
                                onChange={(event) => setAssetCodePrefix(event.target.value)}
                                placeholder="SKU-"
                                fullWidth
                                helperText={t('forms.itemForm.assetCodePrefixHelp')}
                                slotProps={{ htmlInput: { maxLength: 200 } }}
                            />
                            <TextField
                                label={t('forms.itemForm.assetStartNumber')}
                                type="number"
                                value={numericInputs.assetStartNumber}
                                onChange={handleNumberChange('assetStartNumber')}
                                required
                                fullWidth
                                error={!assetStartValid}
                                helperText={assetCodePreview
                                    ? t('forms.itemForm.assetCodePreview', { codes: assetCodePreview })
                                    : t('forms.itemForm.assetStartNumberHelp')}
                                slotProps={{ htmlInput: { min: 1, step: 1, inputMode: 'numeric' } }}
                            />
                        </>)}
                        {isBulkPackage && (
                            <TextField
                                label={t('forms.itemForm.itemsPerBox')}
                                type="number"
                                value={numericInputs.containerSize}
                                onChange={handleNumberChange('containerSize')}
                                required
                                fullWidth
                                slotProps={{ htmlInput: { min: 1, inputMode: 'numeric' } }}
                            />
                        )}
                        <TextField
                            label={t('forms.itemForm.minimumStock')}
                            type="number"
                            value={numericInputs.minStock}
                            onChange={handleNumberChange('minStock')}
                            required
                            fullWidth
                            slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }}
                        />
                        <TextField
                            label={t('forms.itemForm.unitValue')}
                            type="number"
                            value={numericInputs.value}
                            onChange={handleNumberChange('value')}
                            fullWidth
                            slotProps={{ htmlInput: { min: 0, step: 0.01, inputMode: 'decimal' } }}
                        />
                    </Box>
                </FormSection>

                <FormSection title={t('enum.value.location')}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                        <LocationPicker locations={storageLocations} value={formData.storageLocation} label={t('common.storageLocation')}
                            helperText={t('forms.itemForm.searchByCodeOrPath')}
                            onChange={(newValue) => setFormData((prev) => ({ ...prev, privateResource: initialData ? prev.privateResource : prev.privateResource || Boolean(newValue?.access?.privateResource), ...storageLocationChange(prev, newValue?.id ?? '') }))} />
                        {canCreateLocation && <Button variant="outlined" startIcon={<AddLocationAltOutlinedIcon />} onClick={() => setAddLocationOpen(true)}
                            aria-label={t('forms.itemForm.createANewStorageLocation')} sx={{ height: 56, flexShrink: 0 }}>
                            {t('forms.itemForm.new')}
                        </Button>}
                    </Box>
                    <TextField
                        label={t('forms.itemForm.positionInLocation')}
                        value={formData.positionDetails ?? ''}
                        onChange={handleChange('positionDetails')}
                        helperText={t('forms.itemForm.positionInLocationHelp')}
                        fullWidth
                    />
                    <LocationPicker locations={storageLocations} value={formData.returnLocation} label={t('common.returnLocation')}
                        helperText={t('forms.itemForm.whereTheItemGoesBackAfterUse')}
                        onChange={(value) => setFormData((prev) => ({ ...prev, returnLocation: value?.id ?? '' }))} />
                </FormSection>

                <Accordion defaultExpanded={hasAdditionalDetails || categorySpecific}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box>
                            <Typography variant="subtitle2">{t('forms.itemForm.additionalDetails')}</Typography>
                            <Typography variant="body2" color="text.secondary">{t('forms.itemForm.eventsSupplierInstructionsAndImages')}</Typography>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Stack spacing={2}>
                            <Autocomplete
                                multiple
                                options={eventTypes}
                                value={formData.eventTypes ?? []}
                                onChange={(_event, values) => setFormData((prev) => ({ ...prev, eventTypes: values }))}
                                renderInput={(params) => <TextField {...params} label={t('forms.itemForm.neededForEvents')} />}
                            />
                            <TextField
                                label={t('common.supplier')}
                                value={formData.supplier ?? ''}
                                onChange={handleChange('supplier')}
                                fullWidth
                            />
                            <TextField
                                label={t('forms.itemForm.specialInstructions')}
                                value={formData.hint ?? ''}
                                onChange={handleChange('hint')}
                                multiline
                                minRows={2}
                                fullWidth
                                helperText={t('forms.itemForm.instructionsForUsePreparationOrAssembly')}
                            />
                            {categorySpecific && (
                                <Stack spacing={2}>
                                    <Typography variant="subtitle2">{t('forms.itemForm.categorySpecificDetails')}</Typography>
                                    {isVehicle && (
                                        <>
                                            <TextField
                                                label={t('forms.itemForm.fuelConsumptionL100Km')}
                                                type="number"
                                                value={numericInputs.fuelConsumptionLitersPer100Km}
                                                onChange={handleNumberChange('fuelConsumptionLitersPer100Km')}
                                                slotProps={{ htmlInput: { min: 0, step: 0.1, inputMode: 'decimal' } }}
                                            />
                                            <TextField
                                                label={t('forms.itemForm.batteryReplacementDue')}
                                                type="date"
                                                value={formData.batteryReplacementDue ?? ''}
                                                onChange={handleChange('batteryReplacementDue')}
                                                slotProps={{ inputLabel: { shrink: true } }}
                                            />
                                        </>
                                    )}
                                    {isGenerator && (
                                        <>
                                            {formData.trackingMode !== 'serialized' && <TextField
                                                label={t('forms.itemForm.runningHours')}
                                                type="number"
                                                value={numericInputs.currentOperatingHours}
                                                onChange={handleNumberChange('currentOperatingHours')}
                                                slotProps={{ htmlInput: { min: 0, step: 0.1, inputMode: 'decimal' } }}
                                            />}
                                            <TextField
                                                label={t('forms.itemForm.maintenanceIntervalDays')}
                                                type="number"
                                                value={numericInputs.maintenanceIntervalDays}
                                                onChange={handleNumberChange('maintenanceIntervalDays')}
                                                slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }}
                                            />
                                            <TextField
                                                label={t('forms.itemForm.nextMaintenance')}
                                                type="date"
                                                value={formData.nextMaintenanceDue ?? ''}
                                                onChange={handleChange('nextMaintenanceDue')}
                                                slotProps={{ inputLabel: { shrink: true } }}
                                            />
                                        </>
                                    )}
                                    {isFood && (
                                        <TextField
                                            label={t('forms.itemForm.bestBeforeDate')}
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
                <DialogForm title={t('forms.itemForm.addStorageLocation')} onSubmit={handleCreateLocSubmit} onCancel={() => setAddLocationOpen(false)}
                    noValidate pending={createLoc.isPending} submitDisabled={!newLocData.name.trim()} submitLabel={t('forms.itemForm.create')}>
                    <LocationPicker locations={storageLocations} value={newLocData.parentLocationId} label={t('forms.itemForm.insideLocation')}
                        helperText={t('forms.itemForm.insideLocationHelp')}
                        onChange={(parent) => setNewLocData((prev) => ({ ...prev, parentLocationId: parent?.id ?? null, warehouseId: parent?.warehouseId ?? null,
                            privateResource: prev.privateResource || Boolean(parent?.access?.privateResource) }))} />
                    <TextField
                        label={t('profile.name')}
                        value={newLocData.name}
                        onChange={(e) => setNewLocData((prev) => ({ ...prev, name: e.target.value }))}
                        required
                        fullWidth
                        autoFocus
                    />
                    <TextField
                        label={t('forms.itemForm.locationCode')}
                        helperText={t('forms.itemForm.locationCodeHelp')}
                        value={newLocData.code}
                        onChange={(e) => setNewLocData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                        fullWidth
                        slotProps={{ htmlInput: { maxLength: 32 } }}
                    />
                    <TextField
                        label={t('common.description')}
                        helperText={t('forms.itemForm.optional')}
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
