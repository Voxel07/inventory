import { useState } from 'react';
import {
    Box,
    TextField,
    Button,
    Stack,
    MenuItem,
} from '@mui/material';
import type { TransactionFormData, Item, TransactionType } from '../../types';

interface Props {
    items: Item[];
    preselectedItemId?: string;
    onSubmit: (data: TransactionFormData) => void;
    isLoading?: boolean;
}

const REASONS = [
    'Project use',
    'Maintenance',
    'Testing',
    'Return after use',
    'Inventory correction',
    'Other',
];

export function TransactionForm({ items, preselectedItemId, onSubmit, isLoading }: Props) {
    const [formData, setFormData] = useState<TransactionFormData>({
        itemId: preselectedItemId ?? '',
        transactionType: 'checkout',
        quantityChanged: 1,
        reason: '',
        notes: '',
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
                            {item.name} (Available: {item.amount})
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    select
                    label="Transaction Type"
                    value={formData.transactionType}
                    onChange={(e) =>
                        setFormData((prev) => ({
                            ...prev,
                            transactionType: e.target.value as TransactionType,
                        }))
                    }
                    required
                    fullWidth
                >
                    <MenuItem value="checkout">Check Out</MenuItem>
                    <MenuItem value="checkin">Check In</MenuItem>
                </TextField>
                <TextField
                    label="Quantity"
                    type="number"
                    value={formData.quantityChanged}
                    onChange={(e) =>
                        setFormData((prev) => ({ ...prev, quantityChanged: Number(e.target.value) }))
                    }
                    required
                    fullWidth
                    slotProps={{ htmlInput: { min: 1 } }}
                />
                <TextField
                    select
                    label="Reason"
                    value={formData.reason}
                    onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
                    required
                    fullWidth
                >
                    {REASONS.map((reason) => (
                        <MenuItem key={reason} value={reason}>
                            {reason}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    label="Notes"
                    value={formData.notes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    multiline
                    rows={2}
                    fullWidth
                />
                <Button
                    type="submit"
                    variant="contained"
                    disabled={isLoading || !formData.itemId || !formData.reason}
                >
                    Submit Transaction
                </Button>
            </Stack>
        </Box>
    );
}
