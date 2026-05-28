import { useState } from 'react';
import {
    Box,
    TextField,
    Button,
    Stack,
    MenuItem,
    Tooltip,
} from '@mui/material';
import type { DamageReportFormData, Item, DamageSeverity } from '../../types';

interface Props {
    items: Item[];
    preselectedItemId?: string;
    onSubmit: (data: DamageReportFormData) => void;
    isLoading?: boolean;
}

const SEVERITIES: { value: DamageSeverity; label: string }[] = [
    { value: 'low', label: 'Niedrig' },
    { value: 'medium', label: 'Mittel' },
    { value: 'high', label: 'Hoch' },
    { value: 'critical', label: 'Kritisch' },
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
                    label="Artikel"
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
                    label="Schweregrad"
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
                    label="Menge"
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
                    label="Beschreibung"
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    multiline
                    rows={4}
                    required
                    fullWidth
                />
                <Tooltip title="Neuen Schadensbericht einreichen" arrow>
                    <span>
                        <Button
                            type="submit"
                            variant="contained"
                            color="error"
                            disabled={isLoading || !formData.itemId || !formData.description || formData.amount < 1}
                        >
                            Schadensbericht einreichen
                        </Button>
                    </span>
                </Tooltip>
            </Stack>
        </Box>
    );
}
