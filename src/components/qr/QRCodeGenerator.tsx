import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Stack, Typography, Tooltip } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { generateQRCodeDataURL, type QRResourceType } from '../../utils/qrCode';
import { useTranslate } from '../../utils/naming';

interface Props {
    itemId: string;
    itemName: string;
    resourceType?: QRResourceType;
    textCode?: string;
}

export function QRCodeGenerator({ itemId, itemName, resourceType = 'item', textCode }: Props) {
    const t = useTranslate();
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        generateQRCodeDataURL(itemId, resourceType, textCode).then((url) => {
            if (!cancelled) {
                setQrDataUrl(url);
                setLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, [itemId, resourceType, textCode]);

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
            {textCode && <Typography sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{textCode}</Typography>}
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
