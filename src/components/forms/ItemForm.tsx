import { useState } from 'react';
import {
    Box,
    TextField,
    Button,
    Stack,
    Autocomplete,
    Typography,
    Divider,
} from '@mui/material';
import type { ItemFormData, Item } from '../../types';

interface Props {
    initialData?: Item;
    storageLocations?: string[];
    categories?: string[];
    positions?: string[];
    locations?: string[];
    existingNames?: string[];
    onSubmit: (data: ItemFormData) => void;
    isLoading?: boolean;
}

export function ItemForm({
    initialData,
    storageLocations = [],
    categories = [],
    positions = [],
    locations = [],
    existingNames = [],
    onSubmit,
    isLoading,
}: Props) {
    const [formData, setFormData] = useState<ItemFormData>({
        name: initialData?.name ?? '',
        amount: initialData?.amount ?? 0,
        minStock: initialData?.minStock ?? 5,
        value: initialData?.value ?? 0,
        category: initialData?.category ?? '',
        storageLocation: initialData?.storageLocation ?? '',
        position: initialData?.position ?? '',
        location: initialData?.location ?? '',
        containerSize: initialData?.containerSize ?? undefined,
        containerCount: initialData?.containerCount ?? undefined,
        containersOpened: initialData?.containersOpened ?? undefined,
        containerRemainingPercent: initialData?.containerRemainingPercent ?? undefined,
    });
    const [nameError, setNameError] = useState('');

    const isContainer = (formData.containerSize ?? 0) > 0;

    function handleChange(field: keyof ItemFormData) {
        return (e: React.ChangeEvent<HTMLInputElement>) => {
            const numFields: (keyof ItemFormData)[] = ['amount', 'value', 'minStock', 'containerSize', 'containerCount', 'containersOpened', 'containerRemainingPercent'];
            const value = numFields.includes(field) ? Number(e.target.value) : e.target.value;
            if (field === 'name') {
                const trimmed = (value as string).trim().toLowerCase();
                const isDuplicate = existingNames.some((n) => n.toLowerCase() === trimmed);
                setNameError(isDuplicate ? 'An item with this name already exists' : '');
            }
            setFormData((prev) => ({ ...prev, [field]: value }));
        };
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
                <TextField
                    label="Amount"
                    type="number"
                    value={formData.amount}
                    onChange={handleChange('amount')}
                    required
                    fullWidth
                    disabled={isContainer}
                    helperText={isContainer ? `Auto-calculated: ${(formData.containerCount ?? 0) * (formData.containerSize ?? 0)} units` : undefined}
                    slotProps={{ htmlInput: { min: 0 } }}
                />
                <TextField
                    label="Min Stock"
                    type="number"
                    value={formData.minStock}
                    onChange={handleChange('minStock')}
                    required
                    fullWidth
                    slotProps={{ htmlInput: { min: 0 } }}
                />
                <TextField
                    label="Unit Value (€)"
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
                        <TextField {...params} label="Category" fullWidth />
                    )}
                />
                <Autocomplete
                    freeSolo
                    options={storageLocations}
                    value={formData.storageLocation}
                    onInputChange={(_e, newValue) => setFormData((prev) => ({ ...prev, storageLocation: newValue }))}
                    renderInput={(params) => (
                        <TextField {...params} label="Storage Location" fullWidth />
                    )}
                />
                <Autocomplete
                    freeSolo
                    options={positions}
                    value={formData.position}
                    onInputChange={(_e, newValue) => setFormData((prev) => ({ ...prev, position: newValue }))}
                    renderInput={(params) => (
                        <TextField {...params} label="Position" fullWidth />
                    )}
                />
                <Autocomplete
                    freeSolo
                    options={locations}
                    value={formData.location}
                    onInputChange={(_e, newValue) => setFormData((prev) => ({ ...prev, location: newValue }))}
                    renderInput={(params) => (
                        <TextField {...params} label="Location" fullWidth />
                    )}
                />

                <Divider />
                <Typography variant="subtitle2" color="text.secondary">
                    Container / Bulk Packaging (optional)
                </Typography>
                <TextField
                    label="Units per Container"
                    type="number"
                    value={formData.containerSize ?? ''}
                    onChange={handleChange('containerSize')}
                    fullWidth
                    helperText="e.g. 500 screws per box"
                    slotProps={{ htmlInput: { min: 0 } }}
                />
                {isContainer && (
                    <>
                        <TextField
                            label="Number of Containers"
                            type="number"
                            value={formData.containerCount ?? ''}
                            onChange={handleChange('containerCount')}
                            fullWidth
                            slotProps={{ htmlInput: { min: 0 } }}
                        />
                        <TextField
                            label="Containers Opened"
                            type="number"
                            value={formData.containersOpened ?? ''}
                            onChange={handleChange('containersOpened')}
                            fullWidth
                            slotProps={{ htmlInput: { min: 0 } }}
                        />
                        <TextField
                            label="Open Container Remaining %"
                            type="number"
                            value={formData.containerRemainingPercent ?? ''}
                            onChange={handleChange('containerRemainingPercent')}
                            fullWidth
                            helperText="How full is the currently open container (0-100)"
                            slotProps={{ htmlInput: { min: 0, max: 100 } }}
                        />
                    </>
                )}

                <Button type="submit" variant="contained" disabled={isDisabled}>
                    {initialData ? 'Update Item' : 'Create Item'}
                </Button>
            </Stack>
        </Box>
    );
}
