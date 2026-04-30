import { useState } from 'react';
import {
    Box,
    TextField,
    Button,
    Stack,
    Autocomplete,
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
        value: initialData?.value ?? 0,
        category: initialData?.category ?? '',
        storageLocation: initialData?.storageLocation ?? '',
        position: initialData?.position ?? '',
        location: initialData?.location ?? '',
    });
    const [nameError, setNameError] = useState('');

    function handleChange(field: keyof ItemFormData) {
        return (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = field === 'amount' || field === 'value' ? Number(e.target.value) : e.target.value;
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
        onSubmit(formData);
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
                <Button type="submit" variant="contained" disabled={isDisabled}>
                    {initialData ? 'Update Item' : 'Create Item'}
                </Button>
            </Stack>
        </Box>
    );
}
