import { useParams } from 'react-router-dom';
import { Box, Typography, Paper } from '@mui/material';
import { TransactionForm } from '../components/forms/TransactionForm';
import { QRCodeScanner } from '../components/qr/QRCodeScanner';
import { useItem } from '../hooks/useItems';
import { useItems } from '../hooks/useItems';
import { useCreateTransaction, useTransactions } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';
import { calculateItemStock } from '../utils/stock';
import { useUIStore } from '../store/uiStore';
import type { TransactionFormData } from '../types';

export function QRCheckout() {
    const { itemId } = useParams<{ itemId: string }>();
    const { data: item } = useItem(itemId ?? '');
    const { data: items } = useItems();
    const { data: transactions } = useTransactions();
    const { data: damageReports } = useDamageReports();
    const createTransaction = useCreateTransaction();
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    const { remaining } = item
        ? calculateItemStock(item.id, transactions, damageReports)
        : { remaining: 0 };

    function handleSubmit(data: TransactionFormData) {
        createTransaction.mutate(data, {
            onSuccess: () => showSnackbar('Transaktion abgeschlossen', 'success'),
            onError: () => showSnackbar('Transaktion fehlgeschlagen', 'error'),
        });
    }

    function handleScan(scannedId: string) {
        window.location.href = `/checkout/${scannedId}`;
    }

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                {item ? `Ausleihe: ${item.name}` : 'QR-Ausleihe / Rückgabe'}
            </Typography>

            {!itemId && (
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        QR-Code scannen
                    </Typography>
                    <QRCodeScanner onScan={handleScan} />
                </Paper>
            )}

            {item && (
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="subtitle1" color="text.secondary">
                        Artikel: {item.name} | Verfügbar: {remaining} | Lagerort: {item.expand?.storageLocation?.name || item.storageLocation}
                    </Typography>
                </Paper>
            )}

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Transaktion erfassen
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
