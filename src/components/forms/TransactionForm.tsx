import { useState } from 'react';
import {
    Box,
    TextField,
    Button,
    Stack,
    MenuItem,
    Tooltip,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import AddBoxIcon from '@mui/icons-material/AddBox';
import type { TransactionFormData, Item, TransactionType } from '../../types';
import { useTransactions } from '../../hooks/useTransactions';
import { useDamageReports } from '../../hooks/useDamageReports';
import { calculateItemStock } from '../../utils/stock';
import { useNames, useTranslate } from '../../utils/naming';

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
                {!preselectedItemId && <TextField
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
                </TextField>}
                <Box>
                    <Typography component="label" variant="body2" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                        {t('Was möchten Sie tun?', 'What would you like to do?')}
                    </Typography>
                    <ToggleButtonGroup
                        exclusive
                        fullWidth
                        value={formData.transactionType}
                        onChange={(_, value: TransactionType | null) => value && setFormData((prev) => ({ ...prev, transactionType: value }))}
                        aria-label={t('Transaktionstyp', 'Transaction type')}
                        sx={{ '& .MuiToggleButton-root': { minHeight: 52, gap: 0.75, textTransform: 'none', fontWeight: 700 } }}
                    >
                        <ToggleButton value="checkout"><LogoutIcon />{names.action.checkout}</ToggleButton>
                        <ToggleButton value="checkin"><AssignmentReturnIcon />{names.action.checkin}</ToggleButton>
                        <ToggleButton value="added"><AddBoxIcon />{t('Bestand', 'Add stock')}</ToggleButton>
                    </ToggleButtonGroup>
                </Box>
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
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column-reverse', sm: 'row' }, gap: 1.5, justifyContent: 'flex-end', mt: 1 }}>
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
                        sx={{ minHeight: 48 }}
                    >
                        {t('Felder zurücksetzen', 'Reset fields')}
                    </Button>
                    <Tooltip title={t('Diese Transaktion buchen', 'Post this transaction')} arrow>
                        <span>
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={isLoading || !formData.itemId || !formData.reason || quantityInput === '' || Number(quantityInput) < 1}
                                sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}
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
