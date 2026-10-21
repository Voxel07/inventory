import { formatDate } from '../../utils/dateFormat';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Button, IconButton } from '../shared/ActionButtons';
import { useEquipmentProfile } from '../../hooks/useEquipment';
import { equipmentProfileInput, equipmentCommitmentInput } from '../../services/equipmentInputs';
import { useState } from 'react';
import { Alert, Box, Card, CardContent, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import type { Item } from '../../types';
import { equipmentApi } from '../../services/equipmentService';
import type { EquipmentCommitment, EquipmentProfile } from '../../types/equipment';
import { useItemAssets } from '../../hooks/useItems';
import { useEventReports } from '../../hooks/useEvents';
import { translate, useT } from '../../utils/naming';
import { OperationForm } from '../operations/OperationForm';
import type { Field } from '../../types/operationForm';
import { ItemResponsiblePerson } from './ItemResponsiblePerson';

/** `showSummary` repeats owner, keeper and stock facts; hide it where the page already shows them. */
/** `highlightAssetId` marks the commitments that name this unit (asset detail page). */
type Props = { item: Item; canEdit: boolean; embedded?: boolean; showSummary?: boolean; highlightAssetId?: string };

export function EquipmentOwnership(props: Props) {
  return props.item.access?.privateResource ? <PrivateOwnership {...props} /> : <EquipmentLending {...props} />;
}

function PrivateOwnership({ item, canEdit, embedded = false, showSummary = true }: Props) {
  const t = useT();
  const profile = useEquipmentProfile(item.id);
  const [editing, setEditing] = useState<EquipmentProfile | null>(null);
  return <Box component={embedded ? 'div' : Paper} sx={embedded ? {} : { p: { xs: 2, sm: 3 }, my: 2 }}>
    <Stack spacing={1}>
      {!embedded && <Typography variant="h6">{t('items.equipmentOwnership.ownershipKeeper')}</Typography>}
      <ItemResponsiblePerson itemId={item.id} canEdit={canEdit} />
      {profile.error && <Alert severity="error">{profile.error.message}</Alert>}
      {showSummary && <>
        <Typography variant="body2">{t('items.inventorySharing.owner')}: {item.access?.ownerName}</Typography>
        <Typography variant="body2">{t('items.equipmentOwnership.keeperContact')}: {[profile.data?.keeperName, profile.data?.keeperContact].filter(Boolean).join(' · ') || '—'}</Typography>
      </>}
      {canEdit && profile.data && <Button sx={{ alignSelf: 'flex-start' }} onClick={() => setEditing(profile.data!)}>{t('items.equipmentOwnership.editKeeper')}</Button>}
    </Stack>
    {editing && <OperationForm title={t('items.equipmentOwnership.ownershipKeeper')} onClose={() => setEditing(null)}
      initial={{ keeperName: editing.keeperName ?? '', keeperContact: editing.keeperContact ?? '' }} fields={[
        { key: 'keeperName', label: t('items.equipmentOwnership.keeper') },
        { key: 'keeperContact', label: t('items.equipmentOwnership.pickupContact') },
        { key: 'reason', label: t('common.reason'), required: true },
      ]} onSave={values => equipmentApi.update(item.id, equipmentProfileInput({ ...values, ownershipType: 'private_owner', availabilityPolicy: 'available', revision: editing.revision }))} />}
  </Box>;
}

function EquipmentLending({ item, canEdit, embedded = false, showSummary = true, highlightAssetId }: Props) {
  const t = useT();
  const profile = useEquipmentProfile(item.id);
  const { data: events = [] } = useEventReports();
  const { data: assets = [], isLoading: assetsLoading, isError: assetsError } = useItemAssets(item.trackingMode === 'serialized' ? item.id : undefined);
  const [editing, setEditing] = useState<EquipmentProfile | null>(null);
  const [offering, setOffering] = useState<EquipmentProfile | null>(null);
  const [cancelling, setCancelling] = useState<{ profile: EquipmentProfile; commitment: EquipmentCommitment } | null>(null);
  const ownership = { organization: t('enum.value.organization'), private_owner: t('enum.value.private_owner'), external: t('items.equipmentOwnership.externalProvider') };
  const policy = { available: t('items.equipmentOwnership.generallyAvailable'), commitment_required: t('enum.value.commitment_required'), unavailable: t('enum.value.unavailable') };
  const statuses = { active: t('enum.value.active'), scheduled: t('enum.value.scheduled'), expired: t('enum.value.expired'), cancelled: t('enum.value.cancelled') };
  const data = profile.data;
  const readyAssets = assets.filter(a => a.active && a.availabilityStatus === 'available' && !['damaged', 'unsafe', 'lost'].includes(a.conditionStatus));
  return <Box component={embedded ? 'div' : Paper} sx={embedded ? {} : { p: { xs: 2, sm: 3 }, my: 2 }}>
    <Stack spacing={embedded ? 1 : 2} sx={embedded ? { '& .MuiButton-root': { alignSelf: 'flex-start', fontSize: '0.8125rem', py: 0.25 }, '& .MuiCardContent-root': { p: 1, '&:last-child': { pb: 1 } } } : {}}>
      {!embedded && <>
        <Typography variant="h6">{t('items.equipmentOwnership.ownershipKeeperCommitments')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('items.equipmentOwnership.ownershipAndKeeperApplyToEveryUnitOfThisItem')}</Typography>
      </>}
      <ItemResponsiblePerson itemId={item.id} canEdit={canEdit} />
      {profile.isLoading && <Typography>{t('items.equipmentOwnership.loading')}</Typography>}
      {profile.error && <Alert severity="error" action={<Button title={translate('common.retryLoadingTheData')} onClick={() => void profile.refetch()}>{t('common.retry')}</Button>}>{profile.error.message}</Alert>}
      {data && <>
        {showSummary && <>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}><Chip size={embedded ? 'small' : 'medium'} label={ownership[data.ownershipType]} /><Chip size={embedded ? 'small' : 'medium'} label={policy[data.availabilityPolicy]} color={data.availabilityPolicy === 'available' ? 'success' : 'warning'} /></Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: embedded ? { xs: '1fr', sm: '1fr 1fr' } : '1fr', gap: 1 }}>
            <Box><Typography variant="subtitle2" color="text.secondary">{t('items.equipmentOwnership.ownerProvider')}</Typography><Typography variant="body2">{data.ownerName || (data.ownershipType === 'organization' ? ownership.organization : '—')}</Typography></Box>
            <Box><Typography variant="subtitle2" color="text.secondary">{t('items.equipmentOwnership.keeperContact')}</Typography><Typography variant="body2">{[data.keeperName, data.keeperContact].filter(Boolean).join(' · ') || '—'}</Typography></Box>
          </Box>
          <Typography variant="body2">{t('items.equipmentOwnership.physicalInventory')}: {(item.stock?.onHand ?? 0) + (item.stock?.checkedOut ?? 0) + (item.stock?.inTransit ?? 0)} · {item.access?.privateResource ? t('items.equipmentOwnership.privatelyOwned') : t('items.equipmentOwnership.organizationOwned')}: {item.stock?.totalOwned ?? 0}</Typography>
        </>}
        {data.availabilityPolicy !== 'available' && (embedded ? <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Typography variant="caption" color="text.secondary">{t('items.equipmentOwnership.commitmentPolicy')}</Typography><Tooltip arrow enterTouchDelay={0} title={t('items.equipmentOwnership.onlyMatchingCommitmentsCountTowardPlanningAndCheckoutStorageMovements')}><IconButton size="small" aria-label={t('items.equipmentOwnership.aboutCommitmentPolicy')}><InfoOutlinedIcon fontSize="small" /></IconButton></Tooltip></Stack> : <Alert severity="info">{t('items.equipmentOwnership.onlyMatchingCommitmentsCountTowardEventPlanningAndCheckoutStorage')}</Alert>)}
        {canEdit && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button title={translate('items.equipmentOwnership.editTheOwnerKeeperAndAvailability')} onClick={() => setEditing(data)}>{t('items.equipmentOwnership.editOwnership')}</Button>
          <Button title={translate('items.equipmentOwnership.recordAnAvailabilityCommitmentForAnEvent')} variant="outlined" disabled={data.availabilityPolicy !== 'commitment_required' || assetsLoading || assetsError} onClick={() => setOffering(data)}>{t('items.equipmentOwnership.recordCommitment')}</Button>
        </Stack>}
        {data.availabilityPolicy === 'commitment_required' && data.commitments.length === 0 && <Typography variant="body2" color="text.secondary">{t('items.equipmentOwnership.noCommitmentsRecorded')}</Typography>}
        {data.commitments.map(c => <Card key={c.id} variant="outlined" sx={highlightAssetId && c.assetIds.includes(highlightAssetId) ? { borderColor: 'primary.main', borderWidth: 2 } : undefined}><CardContent><Stack spacing={1}>
          <Typography sx={{ fontWeight: 700 }}>{c.eventName || t('items.equipmentOwnership.dateRangeWithoutEventRestriction')} · {c.quantity} · {statuses[c.status]}</Typography>
          <Typography>{formatDate(c.availableFrom)} – {formatDate(c.availableUntil)}</Typography>
          <Typography variant="body2">{t('common.pickup')}: {c.pickupDetails}</Typography>
          {c.returnDue && <Typography variant="body2">{t('items.equipmentOwnership.returnDue')}: {formatDate(c.returnDue)} · {c.returnDetails}</Typography>}
          {c.assetIds.length > 0 && <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{t('items.equipmentOwnership.assets')}: {c.assetIds.map(id => assets.find(a => a.id === id)?.assetCode ?? id).join(', ')}</Typography>}
          <Typography variant="body2">{c.recordedBy}: {c.notes}</Typography>
          {c.cancellationReason && <Typography variant="body2">{t('items.equipmentOwnership.cancellationReason')}: {c.cancellationReason}</Typography>}
          {canEdit && c.status !== 'cancelled' && <Button title={translate('items.equipmentOwnership.cancelThisAvailabilityCommitment')} color="warning" onClick={() => setCancelling({ profile: data, commitment: c })}>{t('items.equipmentOwnership.cancelCommitment')}</Button>}
        </Stack></CardContent></Card>)}
      </>}
    </Stack>
    {editing && <OperationForm title={t('items.equipmentOwnership.ownershipKeeper')} onClose={() => setEditing(null)} initial={{ ownershipType: editing.ownershipType, ownerName: editing.ownerName ?? '', keeperName: editing.keeperName ?? '', keeperContact: editing.keeperContact ?? '', availabilityPolicy: editing.availabilityPolicy }} fields={values => [
      { key: 'ownershipType', label: t('items.equipmentOwnership.ownership'), required: true, options: Object.entries(ownership).map(([value, label]) => ({ value, label })) },
      { key: 'ownerName', label: t('items.equipmentOwnership.ownerProvider'), required: values.ownershipType !== 'organization' },
      { key: 'keeperName', label: t('items.equipmentOwnership.keeper') }, { key: 'keeperContact', label: t('items.equipmentOwnership.pickupContact') },
      { key: 'availabilityPolicy', label: t('items.equipmentOwnership.availability'), required: true, options: Object.entries(policy).filter(([key]) => values.ownershipType === 'organization' || key !== 'available').map(([value, label]) => ({ value, label })) },
      { key: 'reason', label: t('items.equipmentOwnership.reason'), required: true },
    ]} onSave={values => equipmentApi.update(item.id,equipmentProfileInput({ ...values, revision: editing.revision }))}>
      <Alert severity="info">{t('items.equipmentOwnership.ownershipAndAvailabilityChangesRequireReleasedReservationsReconciledCustodyAnd')}</Alert>
    </OperationForm>}
    {offering && <OperationForm title={t('items.equipmentOwnership.recordCommitment')} onClose={() => setOffering(null)} initial={{ quantity: 1 }} fields={[
      { key: 'eventId', label: t('items.equipmentOwnership.eventOptional'), options: events.map(e => ({ value: e.id, label: `${e.name} · ${formatDate(e.startDate)} – ${formatDate(e.endDate)}` })) },
      { key: 'quantity', label: t('items.equipmentOwnership.committedQuantity'), type: 'number', min: 1, required: true },
      ...readyAssets.map((a): Field => ({ key: `asset:${a.id}`, label: a.assetCode, type: 'checkbox' })),
      { key: 'availableFrom', label: t('items.equipmentOwnership.pickupAvailableFrom'), type: 'dateRange', endKey: 'availableUntil', endLabel: t('items.equipmentOwnership.availableThrough'), required: true },
      { key: 'pickupDetails', label: t('items.equipmentOwnership.pickupInstructionsPlace'), required: true },
      { key: 'returnDue', label: t('items.equipmentOwnership.returnDue2'), type: 'date', required: !item.isConsumable },
      { key: 'returnDetails', label: t('items.equipmentOwnership.returnObligationPlace'), required: !item.isConsumable },
      { key: 'notes', label: t('items.equipmentOwnership.agreementEvidenceNotes'), required: true },
    ]} onSave={values => equipmentApi.commit(item.id,equipmentCommitmentInput({ ...values, eventId: values.eventId || null, returnDue: values.returnDue || null, assetIds: readyAssets.filter(a => values[`asset:${a.id}`]).map(a => a.id), revision: offering.revision }))}>
      <Alert severity="info">{t('items.equipmentOwnership.theDatesMustCoverTheEntireEventAStockPool')}</Alert>
    </OperationForm>}
    {cancelling && <OperationForm title={t('items.equipmentOwnership.cancelCommitment')} onClose={() => setCancelling(null)} fields={[{ key: 'reason', label: t('items.equipmentOwnership.reason'), required: true }]} onSave={values => equipmentApi.cancel(item.id, cancelling.commitment.id, { reason: String(values.reason), revision: cancelling.profile.revision })} />}
  </Box>;
}
