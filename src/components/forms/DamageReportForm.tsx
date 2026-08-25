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
import { nameFor, useAppLanguage, useTranslate } from '../../utils/naming';
import { SEVERITY_LEVELS } from '../../utils/constants';

interface Props {
    items: Item[];
    preselectedItemId?: string;
    onSubmit: (data: DamageReportFormData) => void;
    isLoading?: boolean;
}

export function DamageReportForm({ items, preselectedItemId, onSubmit, isLoading }: Props) {
    useAppLanguage();
    const t = useTranslate();
    const severities: { value: DamageSeverity; label: string }[] = SEVERITY_LEVELS.map((value) => ({ value, label: nameFor('severity', value) }));
    const [formData, setFormData] = useState<DamageReportFormData>({
        itemId: preselectedItemId ?? '',
        amount: 1,
        description: '',
        severity: 'medium',
    });
    const [amountInput, setAmountInput] = useState('1');

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (amountInput === '' || Number(amountInput) < 1) return;
        onSubmit({ ...formData, amount: Number(amountInput) });
    }

    return (
        <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
                <TextField
                    select
                    label={t('Artikel', 'Item')}
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
                    label={t('Schweregrad', 'Severity')}
                    value={formData.severity}
                    onChange={(e) =>
                        setFormData((prev) => ({ ...prev, severity: e.target.value as DamageSeverity }))
                    }
                    required
                    fullWidth
                >
                    {severities.map((s) => (
                        <MenuItem key={s.value} value={s.value}>
                            {s.label}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    label={t('Menge', 'Quantity')}
                    type="number"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    slotProps={{ htmlInput: { min: 1, step: 1 } }}
                    required
                    fullWidth
                />
                <TextField
                    label={t('Beschreibung', 'Description')}
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    multiline
                    rows={4}
                    required
                    fullWidth
                />
                <Tooltip title={t('Neuen Schadensbericht einreichen', 'Submit a new damage report')} arrow>
                    <span>
                        <Button
                            type="submit"
                            variant="contained"
                            color="error"
                            disabled={isLoading || !formData.itemId || !formData.description || amountInput === '' || Number(amountInput) < 1}
                        >
                            {t('Schadensbericht einreichen', 'Submit damage report')}
                        </Button>
                    </span>
                </Tooltip>
            </Stack>
        </Box>
    );
}
