import { OperationListEntry } from './OperationListEntry';
import { Button } from '../shared/ActionButtons';
import { useEquipmentProfile } from '../../hooks/useEquipment';
import { useState } from 'react';
import { Alert, LinearProgress, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { loanApi } from '../../services/loanService';
import { useLoans } from '../../hooks/useLoans';
import type { Loan } from '../../types/loan';
import { inputChoice, inputText } from '../../utils/inputValues';
import { operationsApi } from '../../services/operationsService';
import { useOperationList } from '../../hooks/useOperations';
import { useStockLookups } from '../../hooks/useStockLookups';
import { translate, useLocalizedText } from '../../utils/naming';
import { Fields, OperationForm } from './OperationForm';

export function LoansPanel() {
  const t = useLocalizedText(); const lookup = useStockLookups();
  const loans = useLoans();
  const transfers = useOperationList('transfers', operationsApi.transfers);
  const [itemId, setItemId] = useState(''); const [create, setCreate] = useState(false);
  const profile = useEquipmentProfile(itemId);
  const [action, setAction] = useState<{ loan: Loan; type: 'collect' | 'return' | 'extend' } | null>(null);
  return <Stack spacing={2}>
    <Typography variant="h6">{t('Leih- & Mietvereinbarungen', 'Borrowing & rental arrangements')}</Typography>
    <Alert severity="info">{t('Externes oder privates Material als eigenen Artikel mit Eigentümer und Zusage führen. Vereinbarung vor dem Transport anlegen. Abholung und Rückgabe durch vollständig empfangene Umlagerungen zum/vom Anbieter belegen. Nur abgeholte, noch nicht zurückgegebene Mengen sind ausgabefähig.', 'Record external or private equipment as a separate item with an owner and commitment. Create the arrangement before transport. Record collection and return using fully received transfers from/to the provider. Only collected quantities still on loan are available for checkout.')}</Alert>
    <Fields fields={[{ key: 'itemId', label: t('Artikel', 'Item'), options: lookup.items.map(i => ({ value: i.id, label: i.name })) }]} values={{ itemId }} onChange={v => setItemId(String(v.itemId))} />
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button title={translate('Eine neue Leihvereinbarung erfassen', 'Create a new loan arrangement')} disabled={!itemId || !profile.data} onClick={() => setCreate(true)}>{t('Vereinbarung anlegen', 'New arrangement')}</Button>{itemId && <Button title={translate('Eigentumsdaten und Verfügbarkeitszusagen öffnen', 'Open ownership details and availability commitments')} component={Link} to={`/items/${itemId}`}>{t('Eigentum / Zusage bearbeiten', 'Edit ownership / commitment')}</Button>}<Button title={translate('Die Transport- und Umlagerungsübersicht öffnen', 'Open the transport and transfer overview')} component={Link} to="/operations?tab=transfers">{t('Transport erfassen', 'Record transport')}</Button></Stack>
    {(loans.isLoading || profile.isLoading) && <LinearProgress />}{(loans.error || profile.error || transfers.error || lookup.error) && <Alert severity="error">{(loans.error || profile.error || transfers.error || lookup.error)?.message}</Alert>}
    {loans.data?.map(l => <OperationListEntry key={l.id} actions={<>       {!['returned', 'cancelled'].includes(l.status) && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        {l.collected < l.quantity && <Button title={translate('Abholung und Übergabe der Leihgabe dokumentieren', 'Record collection and handover of the loan')} onClick={() => setAction({ loan: l, type: 'collect' })}>{t('Abholung belegen', 'Record collection')}</Button>}
        {l.returned < l.collected && <Button title={translate('Die Rückgabe an den Anbieter dokumentieren', 'Record return to the provider')} onClick={() => setAction({ loan: l, type: 'return' })}>{t('Anbieter-Rückgabe belegen', 'Record provider return')}</Button>}
        <Button title={translate('Die Leihfrist verlängern', 'Extend the loan period')} onClick={() => setAction({ loan: l, type: 'extend' })}>{t('Verlängern', 'Extend')}</Button>
        {l.collected === l.returned && <Button title={translate('Den Artikel öffnen, um die Zusage zu stornieren', 'Open the item to cancel its commitment')} component={Link} to={`/items/${l.itemId}`}>{t('Zusage stornieren', 'Cancel commitment')}</Button>}
      </Stack>}
 </>} status={l.status} title={<>{l.item} · {l.provider} · {l.kind === 'rental' ? t('Miete', 'Rental') : t('Leihe', 'Borrowing')}</>}><Typography color="text.secondary">{l.contact}</Typography><Typography>{l.terms}</Typography>
      <Typography>{t('Zugesagt / abgeholt / zurückgegeben', 'Committed / collected / returned')}: {l.quantity} / {l.collected} / {l.returned}</Typography>
      <Typography>{t('Abholung / verfügbar bis / Rückgabe fällig', 'Collection / available through / return due')}: {l.collectionDate} / {l.availableUntil} / {l.returnDue}</Typography>
      {!!l.assetCodes.length && <Typography sx={{ overflowWrap: 'anywhere' }}>{t('Geräte', 'Assets')}: {l.assetCodes.join(', ')}</Typography>}
      {l.history.map((h, index) => <Typography key={index} variant="body2" sx={{ overflowWrap: 'anywhere' }}>{new Date(h.at).toLocaleString()} · {h.actor} · {h.action} · {h.notes}</Typography>)}
    </OperationListEntry>)}
    {create && <OperationForm title={t('Neue Vereinbarung', 'New arrangement')} onClose={() => setCreate(false)} initial={{ kind: 'borrow', provider: profile.data?.ownerName ?? '' }} fields={[
      { key: 'commitmentId', label: t('Zusage', 'Commitment'), required: true, options: (profile.data?.commitments ?? []).filter(c => ['active', 'scheduled'].includes(c.status)).map(c => ({ value: c.id, label: `${c.eventName ?? ''} · ${c.quantity} · ${c.availableFrom} – ${c.returnDue}` })) },
      { key: 'kind', label: t('Art', 'Kind'), required: true, options: [{ value: 'borrow', label: t('Leihe', 'Borrowing') }, { value: 'rental', label: t('Miete', 'Rental') }] },
      { key: 'provider', label: t('Anbieter', 'Provider'), required: true }, { key: 'contact', label: t('Kontakt', 'Contact'), required: true },
      { key: 'providerLocationId', label: t('Lagerort beim Anbieter', 'Provider location'), required: true, options: lookup.locationOptions },
      { key: 'terms', label: t('Vereinbarung / Kosten / Nachweis', 'Agreement / costs / evidence'), required: true, multiline: true },
    ]} onSave={v => loanApi.create({ commitmentId: inputText(v.commitmentId), providerLocationId: inputText(v.providerLocationId), kind: inputChoice(v.kind, ['borrow', 'rental']), provider: inputText(v.provider), contact: inputText(v.contact), terms: inputText(v.terms) })} />}
    {action && <OperationForm title={t('Vereinbarung aktualisieren', 'Update arrangement')} onClose={() => setAction(null)} initial={{ availableUntil: action.loan.availableUntil, returnDue: action.loan.returnDue }} fields={action.type === 'extend' ? [
      { key: 'availableUntil', label: t('Verfügbar bis', 'Available through'), type: 'date', required: true }, { key: 'returnDue', label: t('Rückgabe fällig', 'Return due'), type: 'date', required: true }, { key: 'reason', label: t('Zustimmung des Anbieters / Grund', 'Provider agreement / reason'), required: true },
    ] : [
      { key: 'transferId', label: t('Vollständig empfangene Umlagerung', 'Fully received transfer'), required: true, options: (transfers.data ?? []).filter(tr => tr.status === 'received' && (action.type === 'collect' ? tr.sourceLocationId : tr.destinationLocationId) === action.loan.providerLocationId && tr.lines.every(line => line.itemId === action.loan.itemId)).map(tr => ({ value: tr.id, label: tr.transferNumber })) },
      { key: 'notes', label: t('Übergabe- / Empfangsnachweis', 'Handover / receipt evidence'), required: true },
    ]} onSave={v => action.type === 'extend' ? loanApi.extend(action.loan.id, { availableUntil: inputText(v.availableUntil), returnDue: inputText(v.returnDue), reason: inputText(v.reason), revision: action.loan.revision }) : loanApi.move(action.loan.id, action.type, { transferId: inputText(v.transferId), notes: inputText(v.notes), revision: action.loan.revision })} />}
  </Stack>;
}
