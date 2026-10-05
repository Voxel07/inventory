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
import { translate, useLocalizedText } from '../../utils/naming';
import { OperationForm, type Field } from '../operations/OperationForm';

/** `showSummary` repeats owner, keeper and stock facts; hide it where the page already shows them. */
export function EquipmentOwnership({ item, canEdit, embedded = false, showSummary = true }: { item: Item; canEdit: boolean; embedded?: boolean; showSummary?: boolean }) {
  const t = useLocalizedText();
  const profile = useEquipmentProfile(item.id);
  const { data: events = [] } = useEventReports();
  const { data: assets = [], isLoading: assetsLoading, isError: assetsError } = useItemAssets(item.trackingMode === 'serialized' ? item.id : undefined);
  const [editing, setEditing] = useState<EquipmentProfile | null>(null);
  const [offering, setOffering] = useState<EquipmentProfile | null>(null);
  const [cancelling, setCancelling] = useState<{ profile: EquipmentProfile; commitment: EquipmentCommitment } | null>(null);
  const ownership = { organization: t('Organisation', 'Organization'), private_owner: t('Privat', 'Privately owned'), external: t('Extern', 'External provider') };
  const policy = { available: t('Allgemein verfügbar', 'Generally available'), commitment_required: t('Zusage erforderlich', 'Commitment required'), unavailable: t('Nicht verfügbar', 'Unavailable') };
  const statuses = { active: t('Aktiv', 'Active'), scheduled: t('Geplant', 'Scheduled'), expired: t('Abgelaufen', 'Expired'), cancelled: t('Storniert', 'Cancelled') };
  const data = profile.data;
  const readyAssets = assets.filter(a => a.active && a.availabilityStatus === 'available' && !['damaged', 'unsafe', 'lost'].includes(a.conditionStatus));
  return <Box component={embedded ? 'div' : Paper} sx={embedded ? {} : { p: { xs: 2, sm: 3 }, my: 2 }}>
    <Stack spacing={embedded ? 1 : 2} sx={embedded ? { '& .MuiButton-root': { alignSelf: 'flex-start', fontSize: '0.8125rem', py: 0.25 }, '& .MuiCardContent-root': { p: 1, '&:last-child': { pb: 1 } } } : {}}>
      {!embedded && <>
        <Typography variant="h6">{t('Eigentum, Verwahrung & Zusagen', 'Ownership, keeper & commitments')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('Eigentum und Verwahrung gelten für alle Einheiten dieses Artikels. Für unterschiedliche Eigentümer separate Artikel anlegen. Sichtbarkeit, Lagerort und aktuelle Ausleihe sind unabhängig davon.', 'Ownership and keeper apply to every unit of this item. Use separate items for different owners. Catalog visibility, physical location and current custody are independent.')}</Typography>
      </>}
      {profile.isLoading && <Typography>{t('Wird geladen …', 'Loading…')}</Typography>}
      {profile.error && <Alert severity="error" action={<Button title={translate('Die Daten erneut laden', 'Retry loading the data')} onClick={() => void profile.refetch()}>{t('Erneut laden', 'Retry')}</Button>}>{profile.error.message}</Alert>}
      {data && <>
        {showSummary && <>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}><Chip size={embedded ? 'small' : 'medium'} label={ownership[data.ownershipType]} /><Chip size={embedded ? 'small' : 'medium'} label={policy[data.availabilityPolicy]} color={data.availabilityPolicy === 'available' ? 'success' : 'warning'} /></Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: embedded ? { xs: '1fr', sm: '1fr 1fr' } : '1fr', gap: 1 }}>
            <Box><Typography variant="subtitle2" color="text.secondary">{t('Eigentümer / Anbieter', 'Owner / provider')}</Typography><Typography variant="body2">{data.ownerName || (data.ownershipType === 'organization' ? ownership.organization : '—')}</Typography></Box>
            <Box><Typography variant="subtitle2" color="text.secondary">{t('Verwahrer / Kontakt', 'Keeper / contact')}</Typography><Typography variant="body2">{[data.keeperName, data.keeperContact].filter(Boolean).join(' · ') || '—'}</Typography></Box>
          </Box>
          <Typography variant="body2">{t('Physisch geführt', 'Physical inventory')}: {(item.stock?.onHand ?? 0) + (item.stock?.checkedOut ?? 0) + (item.stock?.inTransit ?? 0)} · {item.access?.privateResource ? t('Privates Eigentum', 'Privately owned') : t('Organisationseigentum', 'Organization owned')}: {item.stock?.totalOwned ?? 0}</Typography>
        </>}
        {data.availabilityPolicy !== 'available' && (embedded ? <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Typography variant="caption" color="text.secondary">{t('Zusagen-Richtlinie', 'Commitment policy')}</Typography><Tooltip arrow enterTouchDelay={0} title={t('Nur passende Zusagen zählen für Planung und Ausgabe. Lagerbewegungen ändern Eigentum und Zusagen nicht. Rückgaben mit dem Eigentümer abstimmen.', 'Only matching commitments count toward planning and checkout. Storage movements do not change ownership or commitments. Coordinate returns with the owner.')}><IconButton size="small" aria-label={t('Information zur Zusagen-Richtlinie', 'About commitment policy')}><InfoOutlinedIcon fontSize="small" /></IconButton></Tooltip></Stack> : <Alert severity="info">{t('Nur passende Zusagen zählen für die Eventplanung und Ausgabe. Lagerbewegungen ändern Eigentum und Zusagen nicht. Rückgabe an den Eigentümer gemäß den vereinbarten Anweisungen koordinieren.', 'Only matching commitments count toward event planning and checkout. Storage movements do not change ownership or commitments. Coordinate return to the owner using the agreed instructions.')}</Alert>)}
        {canEdit && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button title={translate('Eigentümer, Verwahrer und Verfügbarkeit bearbeiten', 'Edit the owner, keeper and availability')} onClick={() => setEditing(data)}>{t('Eigentum bearbeiten', 'Edit ownership')}</Button>
          <Button title={translate('Eine Verfügbarkeitszusage für ein Event erfassen', 'Record an availability commitment for an event')} variant="outlined" disabled={data.availabilityPolicy !== 'commitment_required' || assetsLoading || assetsError} onClick={() => setOffering(data)}>{t('Zusage erfassen', 'Record commitment')}</Button>
        </Stack>}
        {data.availabilityPolicy === 'commitment_required' && data.commitments.length === 0 && <Typography variant="body2" color="text.secondary">{t('Keine Zusagen erfasst.', 'No commitments recorded.')}</Typography>}
        {data.commitments.map(c => <Card key={c.id} variant="outlined"><CardContent><Stack spacing={1}>
          <Typography sx={{ fontWeight: 700 }}>{c.eventName || t('Datumsgebundene Zusage ohne Eventbindung', 'Date range without event restriction')} · {c.quantity} · {statuses[c.status]}</Typography>
          <Typography>{formatDate(c.availableFrom)} – {formatDate(c.availableUntil)}</Typography>
          <Typography variant="body2">{t('Abholung', 'Pickup')}: {c.pickupDetails}</Typography>
          {c.returnDue && <Typography variant="body2">{t('Rückgabe fällig', 'Return due')}: {formatDate(c.returnDue)} · {c.returnDetails}</Typography>}
          {c.assetIds.length > 0 && <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{t('Geräte', 'Assets')}: {c.assetIds.map(id => assets.find(a => a.id === id)?.assetCode ?? id).join(', ')}</Typography>}
          <Typography variant="body2">{c.recordedBy}: {c.notes}</Typography>
          {c.cancellationReason && <Typography variant="body2">{t('Stornogrund', 'Cancellation reason')}: {c.cancellationReason}</Typography>}
          {canEdit && c.status !== 'cancelled' && <Button title={translate('Diese Verfügbarkeitszusage stornieren', 'Cancel this availability commitment')} color="warning" onClick={() => setCancelling({ profile: data, commitment: c })}>{t('Zusage stornieren', 'Cancel commitment')}</Button>}
        </Stack></CardContent></Card>)}
      </>}
    </Stack>
    {editing && <OperationForm title={t('Eigentum / Verwahrung', 'Ownership / keeper')} onClose={() => setEditing(null)} initial={{ ownershipType: editing.ownershipType, ownerName: editing.ownerName ?? '', keeperName: editing.keeperName ?? '', keeperContact: editing.keeperContact ?? '', availabilityPolicy: editing.availabilityPolicy }} fields={values => [
      { key: 'ownershipType', label: t('Eigentum', 'Ownership'), required: true, options: Object.entries(ownership).map(([value, label]) => ({ value, label })) },
      { key: 'ownerName', label: t('Eigentümer / Anbieter', 'Owner / provider'), required: values.ownershipType !== 'organization' },
      { key: 'keeperName', label: t('Verwahrer', 'Keeper') }, { key: 'keeperContact', label: t('Kontakt zur Abholung', 'Pickup contact') },
      { key: 'availabilityPolicy', label: t('Verfügbarkeit', 'Availability'), required: true, options: Object.entries(policy).filter(([key]) => values.ownershipType === 'organization' || key !== 'available').map(([value, label]) => ({ value, label })) },
      { key: 'reason', label: t('Begründung', 'Reason'), required: true },
    ]} onSave={values => equipmentApi.update(item.id,equipmentProfileInput({ ...values, revision: editing.revision }))}>
      <Alert severity="info">{t('Änderungen an Eigentum und Verfügbarkeit erfordern freigegebene Reservierungen, geklärte Ausleihen und stornierte laufende Zusagen. Kontaktänderungen bleiben möglich.', 'Ownership and availability changes require released reservations, reconciled custody and cancelled current commitments. Contact details can still be updated.')}</Alert>
    </OperationForm>}
    {offering && <OperationForm title={t('Zusage erfassen', 'Record commitment')} onClose={() => setOffering(null)} initial={{ quantity: 1 }} fields={[
      { key: 'eventId', label: t('Event (optional)', 'Event (optional)'), options: events.map(e => ({ value: e.id, label: `${e.name} · ${formatDate(e.startDate)} – ${formatDate(e.endDate)}` })) },
      { key: 'quantity', label: t('Zugesagte Menge', 'Committed quantity'), type: 'number', min: 1, required: true },
      ...readyAssets.map((a): Field => ({ key: `asset:${a.id}`, label: a.assetCode, type: 'checkbox' })),
      { key: 'availableFrom', label: t('Abholung möglich ab', 'Pickup available from'), type: 'date', required: true },
      { key: 'availableUntil', label: t('Verfügbar bis einschließlich', 'Available through'), type: 'date', required: true },
      { key: 'pickupDetails', label: t('Abholvereinbarung / Ort', 'Pickup instructions / place'), required: true },
      { key: 'returnDue', label: t('Rückgabe fällig am', 'Return due'), type: 'date', required: !item.isConsumable },
      { key: 'returnDetails', label: t('Rückgabeverpflichtung / Ort', 'Return obligation / place'), required: !item.isConsumable },
      { key: 'notes', label: t('Nachweis der Zusage / Notizen', 'Agreement evidence / notes'), required: true },
    ]} onSave={values => equipmentApi.commit(item.id,equipmentCommitmentInput({ ...values, eventId: values.eventId || null, returnDue: values.returnDue || null, assetIds: readyAssets.filter(a => values[`asset:${a.id}`]).map(a => a.id), revision: offering.revision }))}>
      <Alert severity="info">{t('Der Zeitraum muss das gesamte Event abdecken. Pro Artikel ist nur eine überlappende Zusage inklusive Rückgabefrist zulässig. Zusagen erzeugen keinen Bestand.', 'The dates must cover the entire event. A stock pool can have only one overlapping commitment, including its return window. Commitments do not create stock.')}</Alert>
    </OperationForm>}
    {cancelling && <OperationForm title={t('Zusage stornieren', 'Cancel commitment')} onClose={() => setCancelling(null)} fields={[{ key: 'reason', label: t('Begründung', 'Reason'), required: true }]} onSave={values => equipmentApi.cancel(item.id, cancelling.commitment.id, { reason: String(values.reason), revision: cancelling.profile.revision })} />}
  </Box>;
}
