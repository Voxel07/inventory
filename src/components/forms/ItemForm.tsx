import { useState } from 'react';
import {
    Box,
    TextField,
    Button,
    Stack,
    Autocomplete,
    Typography,
    Divider,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from '@mui/material';
import { useCreateStorageLocation } from '../../hooks/useStorageLocations';
import { useUIStore } from '../../store/uiStore';
import { EVENT_TYPES, type ItemFormData, type Item, type StorageLocation } from '../../types';
import { useTranslate } from '../../utils/naming';

interface Props {
    initialData?: Item;
    storageLocations?: StorageLocation[];
    categories?: string[];
    existingNames?: string[];
    onSubmit: (data: ItemFormData) => void;
    isLoading?: boolean;
}

export function ItemForm({
    initialData,
    storageLocations = [],
    categories = [],
    existingNames = [],
    onSubmit,
    isLoading,
}: Props) {
    const t = useTranslate();
    const [formData, setFormData] = useState<ItemFormData>({
        name: initialData?.name ?? '',
        amount: undefined,
        minStock: initialData?.minStock ?? 5,
        value: initialData?.value ?? 0,
        category: initialData?.category ?? '',
        subcategory: initialData?.subcategory ?? '',
        eventTypes: initialData?.eventTypes ?? [],
        storageLocation: initialData?.storageLocation ?? '',
        containerSize: initialData?.containerSize ?? undefined,
        containerCount: initialData?.containerCount ?? undefined,
        containersOpened: initialData?.containersOpened ?? undefined,
        containerRemainingPercent: initialData?.containerRemainingPercent ?? undefined,
    });
    const [numericInputs, setNumericInputs] = useState({
        amount: '',
        minStock: String(initialData?.minStock ?? 5),
        value: String(initialData?.value ?? 0),
        containerSize: initialData?.containerSize == null ? '' : String(initialData.containerSize),
        containerCount: initialData?.containerCount == null ? '' : String(initialData.containerCount),
        containersOpened: initialData?.containersOpened == null ? '' : String(initialData.containersOpened),
        containerRemainingPercent: initialData?.containerRemainingPercent == null ? '' : String(initialData.containerRemainingPercent),
    });
    const [nameError, setNameError] = useState('');
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

    const isContainer = Number(numericInputs.containerSize) > 0;

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
            amount: parseOptional(numericInputs.amount),
            minStock: Number(numericInputs.minStock),
            value: Number(numericInputs.value),
            containerSize: parseOptional(numericInputs.containerSize),
            containerCount: parseOptional(numericInputs.containerCount),
            containersOpened: parseOptional(numericInputs.containersOpened),
            containerRemainingPercent: parseOptional(numericInputs.containerRemainingPercent),
        };
        if (isContainer) {
            submitData.amount = (submitData.containerCount ?? 0) * (submitData.containerSize ?? 0);
        }
        onSubmit(submitData);
    }

    const amountValid = !!initialData || isContainer || (numericInputs.amount !== '' && Number(numericInputs.amount) >= 0);
    const requiredNumbersValid = numericInputs.minStock !== '' && Number(numericInputs.minStock) >= 0
        && numericInputs.value !== '' && Number(numericInputs.value) >= 0;
    const isDisabled = isLoading || !formData.name || !!nameError || !amountValid || !requiredNumbersValid;

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
                {!initialData && (
                    <TextField
                        label={t('Menge', 'Amount')}
                        type="number"
                        value={numericInputs.amount}
                        onChange={handleNumberChange('amount')}
                        required
                        fullWidth
                        disabled={isContainer}
                        helperText={isContainer ? t(`Automatisch berechnet: ${Number(numericInputs.containerCount || 0) * Number(numericInputs.containerSize || 0)} Einheiten`, `Calculated automatically: ${Number(numericInputs.containerCount || 0) * Number(numericInputs.containerSize || 0)} units`) : undefined}
                        slotProps={{ htmlInput: { min: 0 } }}
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
                    multiple
                    options={[...EVENT_TYPES]}
                    value={formData.eventTypes ?? []}
                    onChange={(_event, values) => setFormData((prev) => ({ ...prev, eventTypes: values }))}
                    renderInput={(params) => <TextField {...params} label={t('Benötigt für Events', 'Needed for events')} />}
                />

                <Divider />
                <Typography variant="subtitle2" color="text.secondary">
                    {t('Behälter / Großgebinde (optional)', 'Containers / bulk packaging (optional)')}
                </Typography>
                <TextField
                    label={t('Einheiten pro Behälter', 'Units per container')}
                    type="number"
                    value={numericInputs.containerSize}
                    onChange={handleNumberChange('containerSize')}
                    fullWidth
                    helperText={t('z. B. 500 Schrauben pro Box', 'e.g. 500 screws per box')}
                    slotProps={{ htmlInput: { min: 0 } }}
                />
                {isContainer && (
                    <>
                        <TextField
                            label={t('Anzahl der Behälter', 'Number of containers')}
                            type="number"
                            value={numericInputs.containerCount}
                            onChange={handleNumberChange('containerCount')}
                            fullWidth
                            slotProps={{ htmlInput: { min: 0 } }}
                        />
                        <TextField
                            label={t('Geöffnete Behälter', 'Opened containers')}
                            type="number"
                            value={numericInputs.containersOpened}
                            onChange={handleNumberChange('containersOpened')}
                            fullWidth
                            slotProps={{ htmlInput: { min: 0 } }}
                        />
                        <TextField
                            label={t('Verbleibender Inhalt im geöffneten Behälter (%)', 'Remaining contents in opened container (%)')}
                            type="number"
                            value={numericInputs.containerRemainingPercent}
                            onChange={handleNumberChange('containerRemainingPercent')}
                            fullWidth
                            helperText={t('Wie voll ist der aktuell geöffnete Behälter (0-100)', 'How full the currently opened container is (0-100)')}
                            slotProps={{ htmlInput: { min: 0, max: 100 } }}
                        />
                    </>
                )}

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
