import { Button } from '../shared/ActionButtons';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Alert, Box, Stack } from '@mui/material';
import { translate, useT } from '../../utils/naming';

/** QR code for `code`; `compact` is the print-sheet variant without the download button. */
export function CodeLabel({ code, compact = false }: { code: string; compact?: boolean }) {
  const t = useT(); const [url, setUrl] = useState(''); const [error, setError] = useState('');
  useEffect(() => { let cancelled = false; QRCode.toDataURL(code, { width: 512, margin: 4 }).then(data => { if (!cancelled) setUrl(data); }).catch(() => { if (!cancelled) setError(translate('qr.codeLabel.qRGenerationFailed')); }); return () => { cancelled = true; }; }, [code]);
  return <Stack sx={{ alignItems: "start" }} spacing={1}>{error && <Alert severity="error">{error}</Alert>}{url && <><Box component="img" src={url} alt={code} sx={{ width: compact ? 120 : 180, height: compact ? 120 : 180, maxWidth: '100%' }} />{!compact && <Button title={translate('qr.codeLabel.downloadTheLabelAsAnImage')} component="a" href={url} download="inventory-label.png">{t('qr.codeLabel.downloadLabel')}</Button>}</>}</Stack>;
}
