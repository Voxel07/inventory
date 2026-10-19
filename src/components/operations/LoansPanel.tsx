import { formatDateTime, formatDate } from '../../utils/dateFormat';
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
import { translate, useT } from '../../utils/naming';
import { Fields, OperationForm } from './OperationForm';

export function LoansPanel() {
  const t = useT(); const lookup = useStockLookups();
  const loans = useLoans();
  const transfers = useOperationList('transfers', operationsApi.transfers);
  const [itemId, setItemId] = useState(''); const [create, setCreate] = useState(false);
  const profile = useEquipmentProfile(itemId);
  const [action, setAction] = useState<{ loan: Loan; type: 'collect' | 'return' | 'extend' } | null>(null);
  return <Stack spacing={2}>
    <Typography variant="h6">{t('operations.loansPanel.borrowingRentalArrangements')}</Typography>
    <Alert severity="info">{t('operations.loansPanel.recordExternalOrPrivateEquipmentAsASeparateItemWith')}</Alert>
    <Fields fields={[{ key: 'itemId', label: t('common.item'), options: lookup.items.map(i => ({ value: i.id, label: i.name })) }]} values={{ itemId }} onChange={v => setItemId(String(v.itemId))} />
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button title={translate('operations.loansPanel.createANewLoanArrangement')} disabled={!itemId || !profile.data} onClick={() => setCreate(true)}>{t('operations.loansPanel.newArrangement')}</Button>{itemId && <Button title={translate('operations.loansPanel.openOwnershipDetailsAndAvailabilityCommitments')} component={Link} to={`/items/${itemId}`}>{t('operations.loansPanel.editOwnershipCommitment')}</Button>}<Button title={translate('operations.loansPanel.openTheTransportAndTransferOverview')} component={Link} to="/operations?tab=transfers">{t('operations.loansPanel.recordTransport')}</Button></Stack>
    {(loans.isLoading || profile.isLoading) && <LinearProgress />}{(loans.error || profile.error || transfers.error || lookup.error) && <Alert severity="error">{(loans.error || profile.error || transfers.error || lookup.error)?.message}</Alert>}
    {loans.data?.map(l => <OperationListEntry key={l.id} actions={['returned', 'cancelled'].includes(l.status) ? undefined : [
        l.collected < l.quantity && { key: 'collect', label: t('operations.loansPanel.recordCollection'), title: translate('operations.loansPanel.recordCollectionAndHandoverOfTheLoan'),
          pinned: true, onClick: () => setAction({ loan: l, type: 'collect' }) },
        l.returned < l.collected && { key: 'return', label: t('operations.loansPanel.recordProviderReturn'), title: translate('operations.loansPanel.recordReturnToTheProvider'),
          pinned: l.collected >= l.quantity, onClick: () => setAction({ loan: l, type: 'return' }) },
        { key: 'extend', label: t('operations.loansPanel.extend'), title: translate('operations.loansPanel.extendTheLoanPeriod'), onClick: () => setAction({ loan: l, type: 'extend' }) },
        l.collected === l.returned && { key: 'cancel', label: t('operations.loansPanel.cancelCommitment'), title: translate('operations.loansPanel.openTheItemToCancelItsCommitment'), to: `/items/${l.itemId}` },
      ]} status={l.status} title={<>{l.item} · {l.provider} · {l.kind === 'rental' ? t('enum.value.rental') : t('operations.loansPanel.borrowing')}</>}><Typography color="text.secondary">{l.contact}</Typography><Typography>{l.terms}</Typography>
      <Typography>{t('operations.loansPanel.committedCollectedReturned')}: {l.quantity} / {l.collected} / {l.returned}</Typography>
      <Typography>{t('operations.loansPanel.collectionAvailableThroughReturnDue')}: {formatDate(l.collectionDate)} / {formatDate(l.availableUntil)} / {formatDate(l.returnDue)}</Typography>
      {!!l.assetCodes.length && <Typography sx={{ overflowWrap: 'anywhere' }}>{t('operations.loansPanel.assets')}: {l.assetCodes.join(', ')}</Typography>}
      {l.history.map((h, index) => <Typography key={index} variant="body2" sx={{ overflowWrap: 'anywhere' }}>{formatDateTime(h.at)} · {h.actor} · {h.action} · {h.notes}</Typography>)}
    </OperationListEntry>)}
    {loans.hasNextPage && <Button title={t('operations.loansPanel.loadMoreArrangements')} disabled={loans.isFetchingNextPage} onClick={() => { void loans.fetchNextPage(); }}>{t('operations.loansPanel.loadMore')}</Button>}
    {create && <OperationForm title={t('operations.loansPanel.newArrangement2')} onClose={() => setCreate(false)} initial={{ kind: 'borrow', provider: profile.data?.ownerName ?? '' }} fields={[
      { key: 'commitmentId', label: t('operations.loansPanel.commitment'), required: true, options: (profile.data?.commitments ?? []).filter(c => ['active', 'scheduled'].includes(c.status)).map(c => ({ value: c.id, label: `${c.eventName ?? ''} · ${c.quantity} · ${formatDate(c.availableFrom)} – ${formatDate(c.returnDue)}` })) },
      { key: 'kind', label: t('operations.loansPanel.kind'), required: true, options: [{ value: 'borrow', label: t('operations.loansPanel.borrowing') }, { value: 'rental', label: t('enum.value.rental') }] },
      { key: 'provider', label: t('operations.loansPanel.provider'), required: true }, { key: 'contact', label: t('operations.loansPanel.contact'), required: true },
      { key: 'providerLocationId', label: t('operations.loansPanel.providerLocation'), required: true, options: lookup.locationOptions },
      { key: 'terms', label: t('operations.loansPanel.agreementCostsEvidence'), required: true, multiline: true },
    ]} onSave={v => loanApi.create({ commitmentId: inputText(v.commitmentId), providerLocationId: inputText(v.providerLocationId), kind: inputChoice(v.kind, ['borrow', 'rental']), provider: inputText(v.provider), contact: inputText(v.contact), terms: inputText(v.terms) })} />}
    {action && <OperationForm title={t('operations.loansPanel.updateArrangement')} onClose={() => setAction(null)} initial={{ availableUntil: action.loan.availableUntil, returnDue: action.loan.returnDue }} fields={action.type === 'extend' ? [
      { key: 'availableUntil', label: t('operations.loansPanel.availableThrough'), type: 'date', required: true }, { key: 'returnDue', label: t('operations.loansPanel.returnDue'), type: 'date', required: true }, { key: 'reason', label: t('operations.loansPanel.providerAgreementReason'), required: true },
    ] : [
      { key: 'transferId', label: t('operations.loansPanel.fullyReceivedTransfer'), required: true, options: (transfers.data ?? []).filter(tr => tr.status === 'received' && (action.type === 'collect' ? tr.sourceLocationId : tr.destinationLocationId) === action.loan.providerLocationId && tr.lines.every(line => line.itemId === action.loan.itemId)).map(tr => ({ value: tr.id, label: tr.transferNumber })) },
      { key: 'notes', label: t('operations.loansPanel.handoverReceiptEvidence'), required: true },
    ]} onSave={v => action.type === 'extend' ? loanApi.extend(action.loan.id, { availableUntil: inputText(v.availableUntil), returnDue: inputText(v.returnDue), reason: inputText(v.reason), revision: action.loan.revision }) : loanApi.move(action.loan.id, action.type, { transferId: inputText(v.transferId), notes: inputText(v.notes), revision: action.loan.revision })} />}
  </Stack>;
}
