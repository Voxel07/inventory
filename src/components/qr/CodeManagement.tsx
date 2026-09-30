import { Button } from '../shared/ActionButtons';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Alert, Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { apiRequest } from '../../services/apiClient';
import { useOperationList } from '../../hooks/useOperations';
import { OperationForm } from '../operations/OperationForm';
import { translate, useLocalizedText } from '../../utils/naming';

interface Code { id: string; code: string; targetId: string; targetType: string; primaryCode: boolean; active: boolean; retiredAt?: string }
export function CodeManagement({ targetId, targetType }: { targetId: string; targetType: 'product' | 'asset' | 'location' }) {
  const t = useLocalizedText();
  const codes = useOperationList(`codes:${targetId}`, (page, size) => apiRequest<Code[]>('/api/inventory-codes', { query: { targetId, page, size } }));
  const [action, setAction] = useState<{ type: 'add' | 'replace' | 'retire'; code?: Code } | null>(null);
  return <Stack spacing={1} sx={{ my: 2 }}><Typography variant="h6">{t('Etiketten & Code-Aliasse', 'Labels & code aliases')}</Typography>
    {codes.error && <Alert severity="error">{codes.error.message}</Alert>}
    <Button title={translate('Einen zusätzlichen QR- oder Barcode zuordnen', 'Assign an additional QR code or barcode')} onClick={() => setAction({ type: 'add' })}>{t('Alias hinzufügen', 'Add alias')}</Button>
    {codes.data?.map(c => <Card key={c.id}><CardContent><Stack spacing={1}><Typography sx={{ overflowWrap: 'anywhere' }}>{c.code} · {c.active ? t('Aktiv', 'Active') : t('Stillgelegt', 'Retired')}{c.primaryCode ? ' · primary' : ''}</Typography>{c.active && <><CodeLabel code={c.code} /><Stack direction="row"><Button title={translate('Dieses Etikett durch einen neuen Code ersetzen', 'Replace this label with a new code')} onClick={() => setAction({ type: 'replace', code: c })}>{t('Etikett ersetzen', 'Replace label')}</Button><Button title={translate('Dieses Etikett für künftige Scans stilllegen', 'Retire this label from future scanning')} onClick={() => setAction({ type: 'retire', code: c })}>{t('Stilllegen', 'Retire')}</Button></Stack></>}{c.retiredAt && <Typography>{new Date(c.retiredAt).toLocaleString()}</Typography>}</Stack></CardContent></Card>)}
    {action && <OperationForm title={action.type === 'retire' ? t('Etikett stilllegen', 'Retire label') : t('Etikett erfassen', 'Record label')} onClose={() => setAction(null)} initial={{ primaryCode: action.code?.primaryCode ?? false }} fields={action.type === 'retire' ? [] : [{ key: 'code', label: t('Neuer eindeutiger Code', 'New unique code'), required: true }, { key: 'primaryCode', label: t('Hauptetikett', 'Primary label'), type: 'checkbox' }]} onSave={v => apiRequest(action.type === 'add' ? '/api/inventory-codes' : `/api/inventory-codes/${action.code!.id}${action.type === 'replace' ? '/replace' : ''}`, { method: action.type === 'retire' ? 'DELETE' : 'POST', body: action.type === 'retire' ? undefined : { ...v, targetId, targetType } })}>
      <Alert severity="info">{t('Stillgelegte Codes bleiben in der Historie und können nicht erneut vergeben werden.', 'Retired codes remain in history and cannot be reassigned.')}</Alert>
    </OperationForm>}
  </Stack>;
}
export function CodeLabel({ code }: { code: string }) {
  const t = useLocalizedText(); const [url, setUrl] = useState(''); const [error, setError] = useState('');
  useEffect(() => { let cancelled = false; QRCode.toDataURL(code, { width: 512, margin: 4 }).then(data => { if (!cancelled) setUrl(data); }).catch(() => { if (!cancelled) setError('QR generation failed'); }); return () => { cancelled = true; }; }, [code]);
  return <Stack sx={{ alignItems: "start" }} spacing={1}>{error && <Alert severity="error">{error}</Alert>}{url && <><Box component="img" src={url} alt={code} sx={{ width: 180, height: 180, maxWidth: '100%' }} /><Button title={translate('Das Etikett als Bilddatei herunterladen', 'Download the label as an image')} component="a" href={url} download="inventory-label.png">{t('Etikett herunterladen', 'Download label')}</Button></>}</Stack>;
}
