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
    onSubmit: (data: ItemFormData) => void;
    isLoading?: boolean;
}

export function ItemForm({ initialData, storageLocations = [], categories = [], onSubmit, isLoading }: Props) {
    const [formData, setFormData] = useState<ItemFormData>({
        name: initialData?.name ?? '',
        amount: initialData?.amount ?? 0,
        value: initialData?.value ?? 0,
        category: initialData?.category ?? '',
        storageLocation: initialData?.storageLocation ?? '',
        position: initialData?.position ?? '',
        location: initialData?.location ?? '',
    });

    function handleChange(field: keyof ItemFormData) {
        return (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = field === 'amount' || field === 'value' ? Number(e.target.value) : e.target.value;
            setFormData((prev) => ({ ...prev, [field]: value }));
        };
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        onSubmit(formData);
    }

    return (
        <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
                <TextField
                    label="Name"
                    value={formData.name}
                    onChange={handleChange('name')}
                    required
                    fullWidth
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
                <TextField
                    label="Position"
                    value={formData.position}
                    onChange={handleChange('position')}
                    fullWidth
                />
                <TextField
                    label="Location"
                    value={formData.location}
                    onChange={handleChange('location')}
                    fullWidth
                />
                <Button type="submit" variant="contained" disabled={isLoading || !formData.name}>
                    {initialData ? 'Update Item' : 'Create Item'}
                </Button>
            </Stack>
        </Box>
    );
}
