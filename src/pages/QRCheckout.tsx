import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, Typography, Paper } from '@mui/material';
import { TransactionForm } from '../components/forms/TransactionForm';
import { QRCodeScanner } from '../components/qr/QRCodeScanner';
import { useItem } from '../hooks/useItems';
import { useItems } from '../hooks/useItems';
import { useCreateTransaction, useTransactions } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';
import { calculateItemStock } from '../utils/stock';
import { useUIStore } from '../store/uiStore';
import type { TransactionFormData } from '../types';
import { useNames, useTranslate } from '../utils/naming';

export function QRCheckout() {
    const names = useNames();
    const t = useTranslate();
    const { itemId } = useParams<{ itemId: string }>();
    const navigate = useNavigate();
    const { data: item, isLoading: itemLoading, isError: itemError } = useItem(itemId ?? '');
    const { data: items } = useItems();
    const { data: transactions } = useTransactions();
    const { data: damageReports } = useDamageReports();
    const createTransaction = useCreateTransaction();
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    const { remaining } = item
        ? calculateItemStock(item.id, transactions, damageReports, item.amount ?? 0)
        : { remaining: 0 };

    function handleSubmit(data: TransactionFormData) {
        createTransaction.mutate(data, {
            onSuccess: () => {
                showSnackbar(t('Transaktion abgeschlossen – bereit für den nächsten Scan', 'Transaction completed — ready for the next scan'), 'success');
                if (itemId) navigate('/checkout', { replace: true });
            },
            onError: (error) => showSnackbar(error instanceof Error ? error.message : t('Transaktion fehlgeschlagen', 'Transaction failed'), 'error'),
        });
    }

    function handleScan(scannedId: string) {
        const url = new URL(scannedId, window.location.origin);
        if (url.pathname.startsWith('/assemblies/')) {
            navigate(url.pathname);
            return;
        }
        const id = url.pathname.match(/\/checkout\/([^/]+)/)?.[1] ?? scannedId;
        navigate(`/checkout/${encodeURIComponent(id)}`);
    }

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: { xs: 2, sm: 3 }, fontSize: { xs: '1.75rem', sm: '2.125rem' } }}>
                {item ? item.name : t('Scannen oder Artikel wählen', 'Scan or choose an item')}
            </Typography>

            {!itemId && (
                <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        {t('QR-Code scannen', 'Scan QR code')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('Scannen Sie den Code am Artikel. Danach wählen Sie Ausleihe oder Rückgabe.', 'Scan the code on the item, then choose checkout or return.')}
                    </Typography>
                    <QRCodeScanner onScan={handleScan} />
                </Paper>
            )}

            {itemId && !itemLoading && (itemError || !item) && (
                <Alert severity="error" sx={{ mb: 3 }} action={<Button color="inherit" onClick={() => navigate('/checkout')}>{names.action.scanAgain}</Button>}>
                    {t('Artikel nicht gefunden. Der QR-Code ist möglicherweise ungültig.', 'Item not found. The QR code may be invalid.')}
                </Alert>
            )}

            {item && (
                <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 2, borderColor: 'primary.main' }}>
                    <Typography variant="h6">{item.name}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {t('Verfügbar', 'Available')}: <strong>{remaining}</strong> · {t('Lagerort', 'Storage location')}: {item.expand?.storageLocation?.name || item.storageLocation || '—'}
                    </Typography>
                </Paper>
            )}

            {(!itemId || item) && <Paper sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    {t('Transaktion erfassen', 'Record transaction')}
                </Typography>
                <TransactionForm
                    items={items ?? []}
                    preselectedItemId={itemId}
                    onSubmit={handleSubmit}
                    isLoading={createTransaction.isPending}
                />
            </Paper>}
        </Box>
    );
}
