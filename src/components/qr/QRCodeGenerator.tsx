import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { generateQRCodeDataURL } from '../../services/qrCodeService';

interface Props {
    itemId: string;
    itemName: string;
}

export function QRCodeGenerator({ itemId, itemName }: Props) {
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        generateQRCodeDataURL(itemId).then((url) => {
            if (!cancelled) {
                setQrDataUrl(url);
                setLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, [itemId]);

    function handleDownload() {
        const link = document.createElement('a');
        link.download = `qr-${itemName.replace(/\s+/g, '-').toLowerCase()}.png`;
        link.href = qrDataUrl;
        link.click();
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Stack sx={{ alignItems: 'center' }} spacing={2}>
            <Typography variant="subtitle1">{itemName}</Typography>
            <Box
                component="img"
                src={qrDataUrl}
                alt={`QR code for ${itemName}`}
                sx={{ width: 256, height: 256 }}
            />
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownload}>
                Download QR Code
            </Button>
        </Stack>
    );
}
