import { useParams } from 'react-router-dom';
import { Box, Typography, Paper } from '@mui/material';
import { TransactionForm } from '../components/forms/TransactionForm';
import { QRCodeScanner } from '../components/qr/QRCodeScanner';
import { useItem } from '../hooks/useItems';
import { useItems } from '../hooks/useItems';
import { useCreateTransaction } from '../hooks/useTransactions';
import { useUIStore } from '../store/uiStore';
import type { TransactionFormData } from '../types';

export function QRCheckout() {
    const { itemId } = useParams<{ itemId: string }>();
    const { data: item } = useItem(itemId ?? '');
    const { data: items } = useItems();
    const createTransaction = useCreateTransaction();
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    function handleSubmit(data: TransactionFormData) {
        createTransaction.mutate(data, {
            onSuccess: () => showSnackbar('Transaction completed', 'success'),
            onError: () => showSnackbar('Transaction failed', 'error'),
        });
    }

    function handleScan(scannedId: string) {
        window.location.href = `/checkout/${scannedId}`;
    }

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                {item ? `Checkout: ${item.name}` : 'QR Checkout'}
            </Typography>

            {!itemId && (
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Scan QR Code
                    </Typography>
                    <QRCodeScanner onScan={handleScan} />
                </Paper>
            )}

            {item && (
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="subtitle1" color="text.secondary">
                        Item: {item.name} | Available: {item.amount} | Location: {item.storageLocation}
                    </Typography>
                </Paper>
            )}

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Log Transaction
                </Typography>
                <TransactionForm
                    items={items ?? []}
                    preselectedItemId={itemId}
                    onSubmit={handleSubmit}
                    isLoading={createTransaction.isPending}
                />
            </Paper>
        </Box>
    );
}
