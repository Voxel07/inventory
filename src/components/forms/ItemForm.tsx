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
import type { ItemFormData, Item, StorageLocation } from '../../types';

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
    const [formData, setFormData] = useState<ItemFormData>({
        name: initialData?.name ?? '',
        amount: 0,
        minStock: initialData?.minStock ?? 5,
        value: initialData?.value ?? 0,
        category: initialData?.category ?? '',
        subcategory: initialData?.subcategory ?? '',
        storageLocation: initialData?.storageLocation ?? '',
        containerSize: initialData?.containerSize ?? undefined,
        containerCount: initialData?.containerCount ?? undefined,
        containersOpened: initialData?.containersOpened ?? undefined,
        containerRemainingPercent: initialData?.containerRemainingPercent ?? undefined,
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

    const isContainer = (formData.containerSize ?? 0) > 0;

    function handleChange(field: keyof ItemFormData) {
        return (e: React.ChangeEvent<HTMLInputElement>) => {
            const numFields: (keyof ItemFormData)[] = ['amount', 'value', 'minStock', 'containerSize', 'containerCount', 'containersOpened', 'containerRemainingPercent'];
            const value = numFields.includes(field) ? Number(e.target.value) : e.target.value;
            if (field === 'name') {
                const trimmed = (value as string).trim().toLowerCase();
                const isDuplicate = existingNames.some((n) => n.toLowerCase() === trimmed);
                setNameError(isDuplicate ? 'Ein Artikel mit diesem Namen existiert bereits' : '');
            }
            setFormData((prev) => ({ ...prev, [field]: value }));
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
                showSnackbar('Lagerort erfolgreich erstellt', 'success');
            },
            onError: () => {
                showSnackbar('Fehler beim Erstellen des Lagerorts', 'error');
            }
        });
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (nameError) return;
        const submitData = { ...formData };
        if (isContainer) {
            submitData.amount = (submitData.containerCount ?? 0) * (submitData.containerSize ?? 0);
        }
        onSubmit(submitData);
    }

    const isDisabled = isLoading || !formData.name || !!nameError;

    return (
        <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
                <TextField
                    label="Name"
                    value={formData.name}
                    onChange={handleChange('name')}
                    required
                    fullWidth
                    error={!!nameError}
                    helperText={nameError}
                />
                {!initialData && (
                    <TextField
                        label="Menge"
                        type="number"
                        value={formData.amount}
                        onChange={handleChange('amount')}
                        required
                        fullWidth
                        disabled={isContainer}
                        helperText={isContainer ? `Automatisch berechnet: ${(formData.containerCount ?? 0) * (formData.containerSize ?? 0)} Einheiten` : undefined}
                        slotProps={{ htmlInput: { min: 0 } }}
                    />
                )}
                <TextField
                    label="Mindestbestand"
                    type="number"
                    value={formData.minStock}
                    onChange={handleChange('minStock')}
                    required
                    fullWidth
                    slotProps={{ htmlInput: { min: 0 } }}
                />
                <TextField
                    label="Einzelwert (€)"
                    type="number"
                    value={formData.value}
                    onChange={handleChange('value')}
                    fullWidth
                    slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                />
                <Autocomplete
                    freeSolo
                    options={categories}
                    value={formData.category}
                    onInputChange={(_e, newValue) => setFormData((prev) => ({ ...prev, category: newValue }))}
                    renderInput={(params) => (
                        <TextField {...params} label="Kategorie" fullWidth />
                    )}
                />
                <TextField
                    label="Unterkategorie (optional)"
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
                            <TextField {...params} label="Lagerort" fullWidth />
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

                <Divider />
                <Typography variant="subtitle2" color="text.secondary">
                    Behälter / Großgebinde (optional)
                </Typography>
                <TextField
                    label="Einheiten pro Behälter"
                    type="number"
                    value={formData.containerSize ?? ''}
                    onChange={handleChange('containerSize')}
                    fullWidth
                    helperText="z. B. 500 Schrauben pro Box"
                    slotProps={{ htmlInput: { min: 0 } }}
                />
                {isContainer && (
                    <>
                        <TextField
                            label="Anzahl der Behälter"
                            type="number"
                            value={formData.containerCount ?? ''}
                            onChange={handleChange('containerCount')}
                            fullWidth
                            slotProps={{ htmlInput: { min: 0 } }}
                        />
                        <TextField
                            label="Geöffnete Behälter"
                            type="number"
                            value={formData.containersOpened ?? ''}
                            onChange={handleChange('containersOpened')}
                            fullWidth
                            slotProps={{ htmlInput: { min: 0 } }}
                        />
                        <TextField
                            label="Verbleibender Inhalt im geöffneten Behälter (%)"
                            type="number"
                            value={formData.containerRemainingPercent ?? ''}
                            onChange={handleChange('containerRemainingPercent')}
                            fullWidth
                            helperText="Wie voll ist der aktuell geöffnete Behälter (0-100)"
                            slotProps={{ htmlInput: { min: 0, max: 100 } }}
                        />
                    </>
                )}

                <Tooltip title={initialData ? "Änderungen an diesem Artikel speichern" : "Neuen Artikel im Inventar erstellen"} arrow>
                    <span>
                        <Button type="submit" variant="contained" disabled={isDisabled}>
                            {initialData ? 'Artikel aktualisieren' : 'Artikel erstellen'}
                        </Button>
                    </span>
                </Tooltip>
            </Stack>

            {/* Quick Add Storage Location Dialog */}
            <Dialog open={addLocationOpen} onClose={() => setAddLocationOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Lagerort hinzufügen</DialogTitle>
                <DialogContent>
                    <Box component="form" onSubmit={handleCreateLocSubmit} noValidate sx={{ mt: 1 }}>
                        <Stack spacing={2}>
                            <TextField
                                label="Name"
                                value={newLocData.name}
                                onChange={(e) => setNewLocData((prev) => ({ ...prev, name: e.target.value }))}
                                required
                                fullWidth
                                autoFocus
                            />
                            <TextField
                                label="Bereich (optional)"
                                value={newLocData.area}
                                onChange={(e) => setNewLocData((prev) => ({ ...prev, area: e.target.value }))}
                                fullWidth
                            />
                            <TextField
                                label="Ort (optional)"
                                value={newLocData.location}
                                onChange={(e) => setNewLocData((prev) => ({ ...prev, location: e.target.value }))}
                                fullWidth
                            />
                            <TextField
                                label="Position (optional)"
                                value={newLocData.position}
                                onChange={(e) => setNewLocData((prev) => ({ ...prev, position: e.target.value }))}
                                fullWidth
                            />
                            <TextField
                                label="Beschreibung (optional)"
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
                    <Button onClick={() => setAddLocationOpen(false)}>Abbrechen</Button>
                    <Button
                        onClick={handleCreateLocSubmit}
                        variant="contained"
                        disabled={createLoc.isPending || !newLocData.name.trim()}
                    >
                        {createLoc.isPending ? 'Wird erstellt...' : 'Erstellen'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
