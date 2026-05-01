import { useState } from 'react';
import {
    Box,
    TextField,
    Button,
    Stack,
    MenuItem,
} from '@mui/material';
import type { DamageReportFormData, Item, DamageSeverity } from '../../types';

interface Props {
    items: Item[];
    preselectedItemId?: string;
    onSubmit: (data: DamageReportFormData) => void;
    isLoading?: boolean;
}

const SEVERITIES: { value: DamageSeverity; label: string }[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' },
];

export function DamageReportForm({ items, preselectedItemId, onSubmit, isLoading }: Props) {
    const [formData, setFormData] = useState<DamageReportFormData>({
        itemId: preselectedItemId ?? '',
        amount: 1,
        description: '',
        severity: 'medium',
    });

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        onSubmit(formData);
    }

    return (
        <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
                <TextField
                    select
                    label="Item"
                    value={formData.itemId}
                    onChange={(e) => setFormData((prev) => ({ ...prev, itemId: e.target.value }))}
                    required
                    fullWidth
                >
                    {items.map((item) => (
                        <MenuItem key={item.id} value={item.id}>
                            {item.name}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    select
                    label="Severity"
                    value={formData.severity}
                    onChange={(e) =>
                        setFormData((prev) => ({ ...prev, severity: e.target.value as DamageSeverity }))
                    }
                    required
                    fullWidth
                >
                    {SEVERITIES.map((s) => (
                        <MenuItem key={s.value} value={s.value}>
                            {s.label}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    label="Amount"
                    type="number"
                    value={formData.amount}
                    onChange={(e) =>
                        setFormData((prev) => ({
                            ...prev,
                            amount: Math.max(1, Number(e.target.value) || 1),
                        }))
                    }
                    slotProps={{ htmlInput: { min: 1, step: 1 } }}
                    required
                    fullWidth
                />
                <TextField
                    label="Description"
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    multiline
                    rows={4}
                    required
                    fullWidth
                />
                <Button
                    type="submit"
                    variant="contained"
                    color="error"
                    disabled={isLoading || !formData.itemId || !formData.description || formData.amount < 1}
                >
                    Submit Damage Report
                </Button>
            </Stack>
        </Box>
    );
}
