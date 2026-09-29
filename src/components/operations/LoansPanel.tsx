import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, CardContent, LinearProgress, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../services/apiClient';
import { equipmentApi } from '../../services/equipmentService';
import { operationsApi } from '../../services/operationsService';
import { useOperationList } from '../../hooks/useOperations';
import { useStockLookups } from '../../hooks/useStockLookups';
import { useLocalizedText } from '../../utils/naming';
import { Fields, OperationForm } from './OperationForm';

interface Loan { id: string; itemId: string; item: string; providerLocationId: string; provider: string; contact: string; terms: string; kind: string; quantity: number; collected: number; returned: number; assetCodes: string[]; collectionDate: string; availableUntil: string; returnDue: string; status: string; revision: number; history: { action: string; at: string; actor: string; notes: string }[] }
export function LoansPanel() {
  const t = useLocalizedText(); const lookup = useStockLookups();
  const loans = useQuery({ queryKey: ['loans'], queryFn: () => apiRequest<Loan[]>('/api/loans') });
  const transfers = useOperationList('transfers', operationsApi.transfers);
  const [itemId, setItemId] = useState(''); const [create, setCreate] = useState(false);
  const profile = useQuery({ queryKey: ['items', itemId, 'equipment'], queryFn: () => equipmentApi.get(itemId), enabled: Boolean(itemId) });
  const [action, setAction] = useState<{ loan: Loan; type: 'collect' | 'return' | 'extend' } | null>(null);
  return <Stack spacing={2}>
    <Typography variant="h6">{t('Leih- & Mietvereinbarungen', 'Borrowing & rental arrangements')}</Typography>
    <Alert severity="info">{t('Externes oder privates Material als eigenen Artikel mit Eigentümer und Zusage führen. Vereinbarung vor dem Transport anlegen. Abholung und Rückgabe durch vollständig empfangene Umlagerungen zum/vom Anbieter belegen. Nur abgeholte, noch nicht zurückgegebene Mengen sind ausgabefähig.', 'Record external or private equipment as a separate item with an owner and commitment. Create the arrangement before transport. Record collection and return using fully received transfers from/to the provider. Only collected quantities still on loan are available for checkout.')}</Alert>
    <Fields fields={[{ key: 'itemId', label: t('Artikel', 'Item'), options: lookup.items.map(i => ({ value: i.id, label: i.name })) }]} values={{ itemId }} onChange={v => setItemId(String(v.itemId))} />
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button disabled={!itemId || !profile.data} onClick={() => setCreate(true)}>{t('Vereinbarung anlegen', 'New arrangement')}</Button>{itemId && <Button component={Link} to={`/items/${itemId}`}>{t('Eigentum / Zusage bearbeiten', 'Edit ownership / commitment')}</Button>}<Button component={Link} to="/operations?tab=transfers">{t('Transport erfassen', 'Record transport')}</Button></Stack>
    {(loans.isLoading || profile.isLoading) && <LinearProgress />}{(loans.error || profile.error || transfers.error || lookup.error) && <Alert severity="error">{(loans.error || profile.error || transfers.error || lookup.error)?.message}</Alert>}
    {loans.data?.map(l => <Card key={l.id}><CardContent><Stack spacing={1}>
      <Typography variant="h6">{l.item} · {l.provider} · {l.kind === 'rental' ? t('Miete', 'Rental') : t('Leihe', 'Borrowing')}</Typography><Typography>{l.status} · {l.contact}</Typography><Typography>{l.terms}</Typography>
      <Typography>{t('Zugesagt / abgeholt / zurückgegeben', 'Committed / collected / returned')}: {l.quantity} / {l.collected} / {l.returned}</Typography>
      <Typography>{t('Abholung / verfügbar bis / Rückgabe fällig', 'Collection / available through / return due')}: {l.collectionDate} / {l.availableUntil} / {l.returnDue}</Typography>
      {!!l.assetCodes.length && <Typography sx={{ overflowWrap: 'anywhere' }}>{t('Geräte', 'Assets')}: {l.assetCodes.join(', ')}</Typography>}
      {!['returned', 'cancelled'].includes(l.status) && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        {l.collected < l.quantity && <Button onClick={() => setAction({ loan: l, type: 'collect' })}>{t('Abholung belegen', 'Record collection')}</Button>}
        {l.returned < l.collected && <Button onClick={() => setAction({ loan: l, type: 'return' })}>{t('Anbieter-Rückgabe belegen', 'Record provider return')}</Button>}
        <Button onClick={() => setAction({ loan: l, type: 'extend' })}>{t('Verlängern', 'Extend')}</Button>
        {l.collected === l.returned && <Button component={Link} to={`/items/${l.itemId}`}>{t('Zusage stornieren', 'Cancel commitment')}</Button>}
      </Stack>}
      {l.history.map((h, index) => <Typography key={index} variant="body2" sx={{ overflowWrap: 'anywhere' }}>{new Date(h.at).toLocaleString()} · {h.actor} · {h.action} · {h.notes}</Typography>)}
    </Stack></CardContent></Card>)}
    {create && <OperationForm title={t('Neue Vereinbarung', 'New arrangement')} onClose={() => setCreate(false)} initial={{ kind: 'borrow', provider: profile.data?.ownerName ?? '' }} fields={[
      { key: 'commitmentId', label: t('Zusage', 'Commitment'), required: true, options: (profile.data?.commitments ?? []).filter(c => ['active', 'scheduled'].includes(c.status)).map(c => ({ value: c.id, label: `${c.eventName ?? ''} · ${c.quantity} · ${c.availableFrom} – ${c.returnDue}` })) },
      { key: 'kind', label: t('Art', 'Kind'), required: true, options: [{ value: 'borrow', label: t('Leihe', 'Borrowing') }, { value: 'rental', label: t('Miete', 'Rental') }] },
      { key: 'provider', label: t('Anbieter', 'Provider'), required: true }, { key: 'contact', label: t('Kontakt', 'Contact'), required: true },
      { key: 'providerLocationId', label: t('Lagerort beim Anbieter', 'Provider location'), required: true, options: lookup.locationOptions },
      { key: 'terms', label: t('Vereinbarung / Kosten / Nachweis', 'Agreement / costs / evidence'), required: true, multiline: true },
    ]} onSave={v => apiRequest('/api/loans', { method: 'POST', body: v })} />}
    {action && <OperationForm title={t('Vereinbarung aktualisieren', 'Update arrangement')} onClose={() => setAction(null)} initial={{ availableUntil: action.loan.availableUntil, returnDue: action.loan.returnDue }} fields={action.type === 'extend' ? [
      { key: 'availableUntil', label: t('Verfügbar bis', 'Available through'), type: 'date', required: true }, { key: 'returnDue', label: t('Rückgabe fällig', 'Return due'), type: 'date', required: true }, { key: 'reason', label: t('Zustimmung des Anbieters / Grund', 'Provider agreement / reason'), required: true },
    ] : [
      { key: 'transferId', label: t('Vollständig empfangene Umlagerung', 'Fully received transfer'), required: true, options: (transfers.data ?? []).filter(tr => tr.status === 'received' && (action.type === 'collect' ? tr.sourceLocationId : tr.destinationLocationId) === action.loan.providerLocationId && tr.lines.every(line => line.itemId === action.loan.itemId)).map(tr => ({ value: tr.id, label: tr.transferNumber })) },
      { key: 'notes', label: t('Übergabe- / Empfangsnachweis', 'Handover / receipt evidence'), required: true },
    ]} onSave={v => apiRequest(`/api/loans/${action.loan.id}/${action.type}`, { method: 'POST', body: { ...v, revision: action.loan.revision } })} />}
  </Stack>;
}
