import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Stack, Typography, Tooltip } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { generateQRCodeDataURL } from '../../services/qrCodeService';
import { useTranslate } from '../../utils/naming';

interface Props {
    itemId: string;
    itemName: string;
}

export function QRCodeGenerator({ itemId, itemName }: Props) {
    const t = useTranslate();
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
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
                alt={t(`QR-Code für ${itemName}`, `QR code for ${itemName}`)}
                sx={{ width: 256, height: 256 }}
            />
            <Tooltip title={t('QR-Code-Bilddatei auf Ihrem Gerät speichern', 'Save the QR code image on your device')} arrow>
                <span>
                    <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownload}>
                        {t('QR-Code herunterladen', 'Download QR code')}
                    </Button>
                </span>
            </Tooltip>
        </Stack>
    );
}
