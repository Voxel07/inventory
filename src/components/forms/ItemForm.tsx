import { useAuth } from '../../hooks/useAuth';
import { useFactionCatalog } from '../../hooks/useFactionCatalog';
import { canCreateInventory, canEditCatalog } from '../../utils/access';
import { AccordionSummary, Button } from '../shared/ActionButtons';
import { DialogForm, FormSection } from '../shared/FormDialog';
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
import { itemNameKey, useTakenItemNames } from '../../hooks/useItems';
import { type ItemFormData, type Item, type StorageLocation } from '../../types';
import { useT } from '../../utils/naming';
import { LocationPicker } from '../shared/LocationPicker';
import { StorageStructureDialog } from '../storage/StorageStructureDialog';
import { buildLocationTree, holdsStock, type LocationTreeNode } from '../../utils/locationHierarchy';
import { formatQuantity, fromSteps, toSteps } from '../../utils/stock';
import { MaintenanceScheduleDialog } from './MaintenanceScheduleDialog';
import { describeScheduleDraft, toScheduleInput, type ScheduleDraft } from './maintenanceScheduleDrafts';

interface Props {
    title: string;
    onCancel: () => void;
    initialData?: Item;
    storageLocations?: StorageLocation[];
    categories?: string[];
    onSubmit: (data: ItemFormData) => void;
    isLoading?: boolean;
}

export function ItemForm({
    title,
    onCancel,
    initialData,
    storageLocations = [],
    categories = [],
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
        publicUse: Boolean(initialData?.access?.publicUse),
        name: initialData?.name ?? '',
        description: initialData?.description ?? '',
        amount: undefined,
        minStock: initialData?.minStock ?? 0,
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
        unit: initialData?.unit ?? '',
        quantityDecimals: initialData?.quantityDecimals ?? 0,
        unitCapacity: initialData?.unitCapacity,
        imageFiles: [],
        removeImages: [],
        containerSize: initialData?.containerSize ?? undefined,
        currentOperatingHours: initialData?.currentOperatingHours,
        tracksRuntime: initialData?.tracksRuntime ?? false,
        fuelConsumptionLitersPer100Km: initialData?.fuelConsumptionLitersPer100Km,
        batteryReplacementDue: initialData?.batteryReplacementDue,
        bestBeforeDate: initialData?.bestBeforeDate,
    });
    const [isBulkPackage, setIsBulkPackage] = useState((initialData?.containerSize ?? 0) > 0);
    const [hasOpenedContainer, setHasOpenedContainer] = useState(false);
    const [numericInputs, setNumericInputs] = useState({
        amount: '',
        minStock: String(fromSteps(initialData, initialData?.minStock ?? 0)),
        value: String(initialData?.value ?? 0),
        containerSize: initialData?.containerSize == null ? '' : String(initialData.containerSize),
        unitCapacity: initialData?.unitCapacity == null ? '' : String(initialData.unitCapacity),
        containerRemainingCount: '',
        currentOperatingHours: initialData?.currentOperatingHours == null ? '' : String(initialData.currentOperatingHours),
        fuelConsumptionLitersPer100Km: initialData?.fuelConsumptionLitersPer100Km == null ? '' : String(initialData.fuelConsumptionLitersPer100Km),
        assetStartNumber: '1',
    });
    const [assetCodePrefix, setAssetCodePrefix] = useState('');
    const [images, setImages] = useState<ImageAttachmentState>({ files: [], removed: [], replacements: {} });
    const [addLocationOpen, setAddLocationOpen] = useState(false);
    const [schedules, setSchedules] = useState<ScheduleDraft[]>([]);
    const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
    // Locations saved here show at once, before the location list refetches.
    const [createdLocations, setCreatedLocations] = useState<StorageLocation[]>([]);
    const pickerLocations = [...storageLocations, ...createdLocations.filter((created) => !storageLocations.some((known) => known.id === created.id))];
    const hasStock = Boolean(initialData && ((initialData.stock?.totalOwned ?? 0) > 0));
    // Checked on every keystroke against the visible item names at the chosen location; keeping name and location is never a conflict.
    const { data: takenNames } = useTakenItemNames(formData.storageLocation || undefined);
    const nameKey = itemNameKey(formData.name);
    const unchanged = Boolean(initialData) && nameKey === itemNameKey(initialData?.name ?? '')
        && (formData.storageLocation || '') === (initialData?.storageLocation || '');
    const nameError = nameKey && !unchanged && takenNames?.has(nameKey)
        ? t('forms.itemForm.anItemWithThisNameAlreadyExists') : '';

    function handleChange(field: keyof ItemFormData) {
        return (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = ['batteryReplacementDue', 'bestBeforeDate'].includes(field) ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value;
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

    /** Selects the first new section or storage place (deepest first, in tree order); stock never lies in a top-level location. */
    function handleStructureSaved(saved: StorageLocation[]) {
        setCreatedLocations(saved);
        const known = new Set(pickerLocations.map((location) => location.id));
        const firstNew = (nodes: LocationTreeNode[]): StorageLocation | undefined => {
            for (const node of nodes) {
                const deeper = firstNew(node.children);
                if (deeper) return deeper;
                if (!known.has(node.location.id) && holdsStock(node.location)) return node.location;
            }
            return undefined;
        };
        const created = firstNew(buildLocationTree(saved));
        if (!created) return;
        setFormData((prev) => ({ ...prev, privateResource: initialData ? prev.privateResource : prev.privateResource || Boolean(created.access?.privateResource), ...storageLocationChange(prev, created.id) }));
    }

    function handleSubmit() {
        if (isDisabled) return;
        const parseOptional = (value: string) => value === '' ? undefined : Number(value);
        const submitData: ItemFormData = {
            ...formData,
            publicUse: formData.privateResource && (!initialData || initialData.access?.canManage) ? formData.publicUse : undefined,
            imageFiles: images.files,
            removeImages: images.removed,
            imageReplacements: images.replacements,
            amount: initialData ? undefined : openingUnits,
            minStock: minStockSteps,
            value: Number(numericInputs.value),
            containerSize: isBulkPackage ? parseOptional(numericInputs.containerSize) : undefined,
            unitCapacity: measured ? Number(numericInputs.unitCapacity) : null,
            currentOperatingHours: parseOptional(numericInputs.currentOperatingHours),
            fuelConsumptionLitersPer100Km: parseOptional(numericInputs.fuelConsumptionLitersPer100Km),
            ...(offersSchedules && schedules.length ? { maintenanceSchedules: schedules.map(toScheduleInput) } : {}),
            ...(generatesAssetCodes ? {
                assetCodePrefix: assetCodePrefix.trim() || undefined,
                assetStartNumber: parseOptional(numericInputs.assetStartNumber),
            } : {}),
        };
        onSubmit(submitData);
    }

    const boxSize = Number(numericInputs.containerSize);
    const openedUnits = isBulkPackage && hasOpenedContainer ? Number(numericInputs.containerRemainingCount) : 0;
    // One full canister/bag is 100 percentage steps; opening stock is entered in whole units.
    const capacity = Number(numericInputs.unitCapacity);
    const measure = { unit: formData.unit, quantityDecimals: formData.quantityDecimals ?? 0, unitCapacity: capacity };
    const measured = (formData.quantityDecimals ?? 0) > 0;
    const openedPercent = measured && hasOpenedContainer ? Number(numericInputs.containerRemainingCount) : 0;
    const openingUnits = isBulkPackage ? Number(numericInputs.amount) * boxSize + openedUnits : toSteps(measure, numericInputs.amount) + openedPercent;
    const amountValid = !!initialData || (numericInputs.amount !== '' && Number.isInteger(Number(numericInputs.amount))
        && Number(numericInputs.amount) >= 0 && Number.isSafeInteger(openingUnits) && openingUnits <= 2147483647);
    const minStockSteps = toSteps(measure, numericInputs.minStock);
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
        || (numericInputs.containerSize !== '' && Number.isInteger(boxSize) && boxSize > 0 && boxSize <= 999999999);
    const openedContainerValid = !!initialData || !isBulkPackage || !hasOpenedContainer
        || (numericInputs.containerRemainingCount !== '' && Number.isInteger(openedUnits) && openedUnits > 0 && openedUnits < boxSize);
    const openedPercentValid = !!initialData || !measured || !hasOpenedContainer
        || (numericInputs.containerRemainingCount !== '' && Number.isInteger(openedPercent) && openedPercent > 0 && openedPercent < 100);
    const requiredNumbersValid = numericInputs.minStock !== '' && minStockSteps >= 0
        && Number.isSafeInteger(minStockSteps) && numericInputs.value !== '' && Number.isFinite(Number(numericInputs.value)) && Number(numericInputs.value) >= 0;
    const capacityValid = !measured || (Boolean(formData.unit?.trim()) && numericInputs.unitCapacity !== ''
        && Number.isFinite(capacity) && capacity >= 0.001 && capacity <= 999999999.999
        && Math.abs(capacity * 1000 - Math.round(capacity * 1000)) < 1e-6);
    const isDisabled = isLoading || !nameKey || !!nameError || !formData.category.trim() || !amountValid || !containerSizeValid
        || !openedContainerValid || !openedPercentValid || !requiredNumbersValid || !assetStartValid || !capacityValid;
    const normalizedCategory = formData.category.trim().toLocaleLowerCase();
    const isVehicle = ['vehicle', 'vehicles', 'fahrzeug', 'fahrzeuge'].some((value) => normalizedCategory.includes(value));
    const isGenerator = ['generator', 'stromerzeuger', 'aggregat'].some((value) => normalizedCategory.includes(value));
    const isFood = ['food', 'lebensmittel', 'verpflegung'].some((value) => normalizedCategory.includes(value));
    const categorySpecific = isVehicle || isGenerator || isFood;
    // Plans of existing items are managed on the item page; schedules need warehouse access.
    const offersSchedules = !initialData && canCreatePublic && formData.inventoryRole !== 'consumable';
    const countsHoursForSchedule = offersSchedules && schedules.some((schedule) => schedule.intervalType === 'operating_hours');
    const openingHours = formData.trackingMode === 'serialized' ? 0 : Number(numericInputs.currentOperatingHours) || 0;
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
                            renderInput={(params) => <TextField {...params} label={t('common.category')} required fullWidth />}
                        />
                        <TextField
                            label={t('forms.itemForm.subcategory')}
                            value={formData.subcategory ?? ''}
                            onChange={handleChange('subcategory')}
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
                                onChange={(_, checked) => setFormData(prev => ({ ...prev, privateResource: checked, publicUse: checked && prev.publicUse }))} />}
                            label={formData.privateResource ? t('forms.itemForm.privateItem') : t('forms.itemForm.inTheSharedCatalog')} />
                        <FormHelperText sx={{ mt: 0 }}>
                            {formData.privateResource
                                ? t('forms.itemForm.onlyYouInventoryAdminsAndPeopleYouShareItWith')
                                : t('forms.itemForm.everyoneWithCatalogAccessCanSeeThisItem')}
                            {initialData ? ` ${t('forms.itemForm.visibilityCannotBeChangedAfterCreation')}` : ''}
                        </FormHelperText>
                    </Box>
                    {formData.privateResource && <FormControlLabel
                        control={<Switch checked={Boolean(formData.publicUse)} disabled={Boolean(initialData && !initialData.access?.canManage)}
                            onChange={(_, checked) => setFormData(prev => ({ ...prev, publicUse: checked }))} />}
                        label={t('items.inventorySharing.publicAvailabilityHelp')} />}
                </FormSection>

                <FormSection title={t('forms.itemForm.stockTracking')}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                            select
                            fullWidth
                            label={t('forms.itemForm.trackingMode')}
                            required
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
                                if (trackingMode === 'serialized') {
                                    setIsBulkPackage(false);
                                    setFormData((prev) => ({ ...prev, quantityDecimals: 0 }));
                                }
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
                            required
                            value={formData.inventoryRole ?? 'returnable'}
                            onChange={(event) => {
                                const inventoryRole = event.target.value as ItemFormData['inventoryRole'];
                                setFormData((prev) => ({
                                    ...prev,
                                    inventoryRole,
                                    quantityDecimals: inventoryRole === 'consumable' ? prev.quantityDecimals : 0,
                                    trackingMode: inventoryRole === 'consumable' && prev.trackingMode === 'serialized'
                                        ? 'bulk' : prev.trackingMode,
                                }));
                            }}
                        >
                            <MenuItem value="consumable">{t('enum.value.consumable')}</MenuItem>
                            <MenuItem value="returnable" disabled={hasStock && measured}>{t('enum.value.returnable')}</MenuItem>
                        </TextField>
                    </Stack>
                    {formData.trackingMode !== 'serialized' && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                            fullWidth
                            label={t('forms.itemForm.unit')}
                            value={formData.unit ?? ''}
                            onChange={handleChange('unit')}
                            placeholder={measured ? t('forms.itemForm.fullUnitPlaceholder') : t('forms.itemForm.unitPlaceholder')}
                            helperText={measured ? t('forms.itemForm.fullUnitHelp') : t('forms.itemForm.unitHelp')}
                            slotProps={{ htmlInput: { maxLength: 32 } }}
                        />
                        <TextField
                            select
                            fullWidth
                            label={t('forms.itemForm.decimalPlaces')}
                            value={formData.quantityDecimals ?? 0}
                            disabled={hasStock || isBulkPackage}
                            helperText={hasStock ? t('forms.itemForm.cannotChangeWhileStockExists') : t('forms.itemForm.decimalPlacesHelp')}
                            onChange={(event) => {
                                const quantityDecimals = Number(event.target.value) === 2 ? 2 : 0;
                                setFormData((prev) => ({ ...prev, quantityDecimals,
                                    inventoryRole: quantityDecimals === 2 ? 'consumable' : prev.inventoryRole }));
                                setHasOpenedContainer(false);
                            }}
                        >
                            <MenuItem value={0}>{t('forms.itemForm.wholeUnits')}</MenuItem>
                            <MenuItem value={2}>{t('forms.itemForm.percentageUsage')}</MenuItem>
                        </TextField>
                    </Stack>}
                    {measured && <TextField type="number" required fullWidth
                        label={formData.unit ? `${t('forms.itemForm.fullUnitContents')} (${formData.unit})` : t('forms.itemForm.fullUnitContents')}
                        value={numericInputs.unitCapacity} onChange={handleNumberChange('unitCapacity')}
                        disabled={hasStock}
                        helperText={hasStock ? t('forms.itemForm.cannotChangeWhileStockExists') : t('forms.itemForm.fullUnitContentsHelp')}
                        error={numericInputs.unitCapacity !== '' && !capacityValid}
                        slotProps={{ htmlInput: { min: 0.001, max: 999999999.999, step: 0.001, inputMode: 'decimal' } }} />}
                    {formData.trackingMode !== 'serialized' && !measured && <Box>
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
                                                containerRemainingCount: '',
                                            }));
                                        }
                                    }}
                                />
                            )}
                            label={t('forms.itemForm.storedInBoxes')}
                        />
                        <FormHelperText sx={{ mt: 0 }}>{t('forms.itemForm.severalIdenticalItemsPerBoxEG500Screws')}</FormHelperText>
                    </Box>}
                    {formData.inventoryRole !== 'consumable' && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: offersSchedules ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }, gap: 2 }}>
                        <Box>
                            <FormControlLabel
                                control={<Checkbox checked={Boolean(formData.tracksRuntime)} disabled={countsHoursForSchedule}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, tracksRuntime: event.target.checked }))} />}
                                label={t('forms.itemForm.recordOperatingHoursOnReturn')}
                            />
                            <FormHelperText sx={{ mt: 0 }}>
                                {countsHoursForSchedule ? t('forms.itemForm.operatingHoursRequiredBySchedule') : t('forms.itemForm.recordOperatingHoursOnReturnHelp')}
                            </FormHelperText>
                        </Box>
                        {offersSchedules && <Box>
                            <FormControlLabel
                                control={<Checkbox checked={schedules.length > 0}
                                    onChange={(event) => event.target.checked ? setScheduleDialogOpen(true) : setSchedules([])} />}
                                label={t('forms.itemForm.hasMaintenanceSchedule')}
                            />
                            {schedules.length > 0 ? <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                <FormHelperText component="div" sx={{ mt: 0, flex: '1 1 auto', minWidth: 0 }}>
                                    {schedules.map((schedule) => <Box key={schedule.type}>{describeScheduleDraft(schedule, t)}</Box>)}
                                </FormHelperText>
                                <Button size="small" onClick={() => setScheduleDialogOpen(true)}>{t('common.edit')}</Button>
                            </Box> : <FormHelperText sx={{ mt: 0 }}>{t('forms.itemForm.hasMaintenanceScheduleHelp')}</FormHelperText>}
                        </Box>}
                    </Box>}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                        {!initialData && (
                            <TextField
                                label={isBulkPackage ? t('forms.itemForm.numberOfFullBoxes') : measured ? t('forms.itemForm.numberOfFullUnits') : formData.unit ? `${t('common.quantity')} (${formData.unit})` : t('common.quantity')}
                                type="number"
                                value={numericInputs.amount}
                                onChange={handleNumberChange('amount')}
                                required
                                fullWidth
                                helperText={measured ? t('forms.itemForm.openingPhysicalQuantity', { quantity: capacityValid && amountValid ? formatQuantity(measure, openingUnits) : '—' }) : formData.trackingMode === 'serialized'
                                    ? t('forms.itemForm.createsOneAssetPerUnitEGSKU001')
                                    : formData.trackingMode === 'lot_tracked' ? t('forms.itemForm.openingStockBecomesTheFirstLot')
                                    : undefined}
                                slotProps={{ htmlInput: { min: 0, step: 1, inputMode: 'numeric' } }}
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
                                slotProps={{ htmlInput: { min: 1, step: 1, inputMode: 'numeric' } }}
                            />
                        )}
                        <TextField
                            label={measured ? `${t('forms.itemForm.minimumStock')} (${t('forms.itemForm.wholeUnits')})` : formData.unit ? `${t('forms.itemForm.minimumStock')} (${formData.unit})` : t('forms.itemForm.minimumStock')}
                            type="number"
                            value={numericInputs.minStock}
                            onChange={handleNumberChange('minStock')}
                            required
                            fullWidth
                            helperText={measured && capacityValid ? formatQuantity(measure, minStockSteps) : undefined}
                            slotProps={{ htmlInput: { min: 0, step: 1, inputMode: 'numeric' } }}
                        />
                        <TextField
                            label={measured ? t('forms.itemForm.fullUnitValue') : t('forms.itemForm.unitValue')}
                            type="number"
                            value={numericInputs.value}
                            onChange={handleNumberChange('value')}
                            required
                            fullWidth
                            slotProps={{ htmlInput: { min: 0, step: 0.01, inputMode: 'decimal' } }}
                        />
                    </Box>
                    {measured && !initialData && <>
                        <FormControlLabel control={<Checkbox checked={hasOpenedContainer} onChange={(_, checked) => setHasOpenedContainer(checked)} />}
                            label={t('forms.itemForm.addPartlyUsedUnit')} />
                        {hasOpenedContainer && <TextField type="number" required fullWidth
                            label={t('forms.itemForm.remainingPercentage')} value={numericInputs.containerRemainingCount}
                            onChange={handleNumberChange('containerRemainingCount')}
                            error={!openedPercentValid && numericInputs.containerRemainingCount !== ''}
                            helperText={t('forms.itemForm.percentageHelp')}
                            slotProps={{ htmlInput: { min: 1, max: 99, step: 1, inputMode: 'numeric' } }} />}
                    </>}
                    {isBulkPackage && !initialData && <>
                        <FormControlLabel
                            control={<Checkbox checked={hasOpenedContainer} onChange={(_, checked) => setHasOpenedContainer(checked)} />}
                            label={t('forms.itemForm.addOpenedBox')}
                        />
                        {hasOpenedContainer && <TextField
                            label={t('forms.itemForm.itemsRemainingInOpenedBox')}
                            type="number"
                            value={numericInputs.containerRemainingCount}
                            onChange={handleNumberChange('containerRemainingCount')}
                            required
                            fullWidth
                            error={!openedContainerValid && numericInputs.containerRemainingCount !== ''}
                            slotProps={{ htmlInput: { min: 1, max: boxSize > 0 ? boxSize - 1 : undefined, step: 1, inputMode: 'numeric' } }}
                        />}
                        <Typography variant="body2" color="text.secondary">
                            {t('forms.itemForm.totalIndividualItems', { count: Number.isFinite(openingUnits) ? openingUnits : 0 })}
                        </Typography>
                    </>}
                </FormSection>

                <FormSection title={t('enum.value.location')}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                        <LocationPicker locations={pickerLocations} value={formData.storageLocation} label={t('common.storageLocation')}
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
                    <LocationPicker locations={pickerLocations} value={formData.returnLocation} label={t('common.returnLocation')}
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

            <MaintenanceScheduleDialog open={scheduleDialogOpen} initial={schedules} openingHours={openingHours}
                onClose={() => setScheduleDialogOpen(false)}
                onSave={(drafts) => {
                    setSchedules(drafts);
                    // Operating-hour intervals only advance when hours are recorded on return.
                    if (drafts.some((draft) => draft.intervalType === 'operating_hours')) setFormData((prev) => ({ ...prev, tracksRuntime: true }));
                    setScheduleDialogOpen(false);
                }} />

            {addLocationOpen && <StorageStructureDialog locations={pickerLocations} canCreatePublic={canCreatePublic}
                onClose={() => setAddLocationOpen(false)} onSaved={(_rootId, saved) => handleStructureSaved(saved)} />}
        </>
    );
}
