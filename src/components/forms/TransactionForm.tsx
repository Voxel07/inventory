import { useState } from 'react';
import {
    Box,
    TextField,
    Button,
    Stack,
    MenuItem,
    Tooltip,
} from '@mui/material';
import type { TransactionFormData, Item, TransactionType } from '../../types';
import { useTransactions } from '../../hooks/useTransactions';
import { useDamageReports } from '../../hooks/useDamageReports';
import { calculateItemStock } from '../../utils/stock';
import { nameFor, useNames, useTranslate } from '../../utils/naming';

interface Props {
    items: Item[];
    preselectedItemId?: string;
    onSubmit: (data: TransactionFormData) => void;
    isLoading?: boolean;
    initialData?: TransactionFormData;
}

export function TransactionForm({ items, preselectedItemId, onSubmit, isLoading, initialData }: Props) {
    const names = useNames();
    const t = useTranslate();
    const transactionReasons = Object.values(names.reason);
    const { data: transactions } = useTransactions();
    const { data: damageReports } = useDamageReports();
    const [formData, setFormData] = useState<TransactionFormData>({
        itemId: initialData?.itemId ?? preselectedItemId ?? '',
        transactionType: initialData?.transactionType ?? 'checkout',
        quantityChanged: initialData?.quantityChanged ?? 1,
        reason: initialData?.reason ?? '',
        notes: initialData?.notes ?? '',
    });
    const [quantityInput, setQuantityInput] = useState(String(initialData?.quantityChanged ?? 1));

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (quantityInput === '' || Number(quantityInput) < 1) return;
        onSubmit({ ...formData, quantityChanged: Number(quantityInput) });
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
                    {items.map((item) => {
                        const { remaining } = calculateItemStock(item.id, transactions, damageReports, item.amount ?? 0);
                        return (
                            <MenuItem key={item.id} value={item.id}>
                                {item.name} ({t('Verfügbar', 'Available')}: {remaining})
                            </MenuItem>
                        );
                    })}
                </TextField>
                <TextField
                    select
                    label={t('Transaktionstyp', 'Transaction type')}
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
                    {(['checkout', 'checkin', 'added'] as TransactionType[]).map((type) => (
                        <MenuItem key={type} value={type}>{nameFor('transactionType', type)}</MenuItem>
                    ))}
                </TextField>
                <TextField
                    label={t('Menge', 'Quantity')}
                    type="number"
                    value={quantityInput}
                    onChange={(e) => setQuantityInput(e.target.value)}
                    required
                    fullWidth
                    slotProps={{ htmlInput: { min: 1 } }}
                />
                <TextField
                    select
                    label={t('Grund', 'Reason')}
                    value={formData.reason}
                    onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
                    required
                    fullWidth
                >
                    {transactionReasons.map((reason) => (
                        <MenuItem key={reason} value={reason}>
                            {reason}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    label={t('Anmerkungen', 'Notes')}
                    value={formData.notes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    multiline
                    rows={2}
                    fullWidth
                />
                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 1 }}>
                    <Button
                        variant="outlined"
                        color="inherit"
                        onClick={() => {
                            setFormData({
                                itemId: initialData?.itemId ?? preselectedItemId ?? '',
                                transactionType: initialData?.transactionType ?? 'checkout',
                                quantityChanged: initialData?.quantityChanged ?? 1,
                                reason: initialData?.reason ?? '',
                                notes: initialData?.notes ?? '',
                            });
                            setQuantityInput(String(initialData?.quantityChanged ?? 1));
                        }}
                        disabled={isLoading}
                    >
                        {t('Felder zurücksetzen', 'Reset fields')}
                    </Button>
                    <Tooltip title={t('Diese Transaktion buchen', 'Post this transaction')} arrow>
                        <span>
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={isLoading || !formData.itemId || !formData.reason || quantityInput === '' || Number(quantityInput) < 1}
                            >
                                {t('Transaktion buchen', 'Post transaction')}
                            </Button>
                        </span>
                    </Tooltip>
                </Box>
            </Stack>
        </Box>
    );
}
