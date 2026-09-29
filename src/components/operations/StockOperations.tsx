import { useStockLookups } from '../../hooks/useStockLookups';
import { optionalValues } from '../../utils/operationForm';
import { useState } from 'react';
import { Alert, Button, Card, CardContent, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import { Link, useSearchParams } from 'react-router-dom';
import { useItemAssets } from '../../hooks/useItems';
import { useOperationList } from '../../hooks/useOperations';
import { operationsApi, type Count, type Lot, type Transfer } from '../../services/operationsService';
import { Fields, OperationForm, type Field, type Values } from './OperationForm';
import { useLocalizedText } from '../../utils/naming';
import { useAuth } from '../../hooks/useAuth';
import { canManageUsers } from '../../utils/access';

export function StockPositions({ itemId, locationId }: { itemId?: string; locationId?: string }) {
  const t = useLocalizedText();
  const lookup = useStockLookups();
  const [filters, setFilters] = useState<Values>({ itemId: itemId ?? '', locationId: locationId ?? '' });
  const selectedItem = String(filters.itemId || itemId || '');
  const selectedLocation = String(filters.locationId || locationId || '');
  const positions = useOperationList(`positions:${selectedItem}:${selectedLocation}`, operationsApi.positions({ itemId: selectedItem || undefined, locationId: selectedLocation || undefined }));
  const assets = useOperationList(`assets:${selectedItem}:${selectedLocation}`, operationsApi.assets({ itemId: selectedItem || undefined, locationId: selectedLocation || undefined }));
  const lots = useOperationList('stock-lot-labels', operationsApi.lots());
  return <Stack spacing={2}>
    <Typography variant="h6">{t('Bestand nach Lagerort', 'Stock by location')}</Typography>
    <Fields values={filters} onChange={setFilters} fields={[
      ...(!itemId ? [{ key: 'itemId', label: t('Artikel / Geräte anzeigen', 'Item / show individual assets'), options: lookup.itemOptions }] : []),
      ...(!locationId ? [{ key: 'locationId', label: t('Lagerort', 'Location'), options: lookup.locationOptions }] : []),
    ]} />
    {(positions.isLoading || assets.isLoading) && <LinearProgress />}
    {(positions.error || assets.error || lookup.error) && <Alert severity="error">{(positions.error || assets.error || lookup.error)?.message}</Alert>}
    {!positions.isLoading && !positions.data?.length && !assets.data?.length && <Alert severity="info">{t('Kein lokalisierter Bestand für diese Auswahl.', 'No located stock for this selection.')}</Alert>}
    {positions.data?.map((position) => <Card key={position.id}><CardContent><Stack spacing={1}>
      <Typography component={Link} to={`/items/${position.itemId}`} variant="h6">{lookup.items.find((item) => item.id === position.itemId)?.name ?? position.itemId}</Typography>
      <Typography>{lookup.locations.find((location) => location.id === position.locationId)?.name ?? t('Ohne Lagerort', 'Unassigned location')}{position.lotId ? ` · ${t('Charge', 'Lot')}: ${lots.data?.find((lot) => lot.id === position.lotId)?.lotNumber ?? position.lotId}` : ''}</Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Chip color="success" label={`${t('Verfügbar', 'Available')}: ${position.availableQuantity}`} />
        <Chip label={`${t('Vor Ort', 'On hand')}: ${position.quantityOnHand}`} /><Chip label={`${t('Reserviert', 'Reserved')}: ${position.quantityReserved}`} />
        <Chip label={`${t('Beschädigt', 'Damaged')}: ${position.quantityDamaged}`} /><Chip label={`${t('Quarantäne', 'Quarantine')}: ${position.quantityQuarantined}`} /><Chip label={`${t('Unterwegs', 'In transit')}: ${position.quantityInTransit}`} />
      </Stack>
    </Stack></CardContent></Card>)}
    {assets.data?.filter((asset) => !selectedLocation || asset.currentLocationId === selectedLocation).map((asset) => <Card key={asset.id}><CardContent>
      <Typography component={Link} to={`/items/${asset.itemId}/assets/${asset.id}`}>{asset.assetCode}</Typography>
      <Typography>{asset.currentLocationName ?? t('Ohne Lagerort', 'Unassigned location')} · {asset.availabilityStatus} · {asset.conditionStatus}</Typography>
      {asset.currentCustodianName && <Typography>{t('Bei', 'Held by')}: {asset.currentCustodianName}</Typography>}
    </CardContent></Card>)}
  </Stack>;
}

export function TransfersPanel() {
  const [params] = useSearchParams();
  const t = useLocalizedText();
  const lookup = useStockLookups();
  const transfers = useOperationList('transfers', operationsApi.transfers);
  const [chooseItem, setChooseItem] = useState(false);
  const [itemId, setItemId] = useState('');
  const item = lookup.items.find((value) => value.id === itemId);
  const assets = useItemAssets(itemId || undefined);
  const lots = useOperationList(`lots:${itemId}`, operationsApi.lots({ itemId: itemId || undefined }), Boolean(itemId));
  const [action, setAction] = useState<{ transfer: Transfer; type: 'dispatch' | 'receive' | 'cancel'; key: string } | null>(null);
  const [createKey, setCreateKey] = useState('');
  return <Stack spacing={2}>
    <Button variant="contained" onClick={() => setChooseItem(true)}>{t('Umlagerung anlegen', 'New transfer')}</Button>
    {transfers.isLoading && <LinearProgress />}{transfers.error && <Alert severity="error">{transfers.error.message}</Alert>}
    {!transfers.isLoading && !transfers.data?.length && <Alert severity="info">{t('Noch keine Umlagerungen.', 'No transfers yet.')}</Alert>}
    {transfers.data?.map((transfer) => <Card key={transfer.id}><CardContent><Stack spacing={1}>
      <Typography variant="h6">{transfer.transferNumber} · {transfer.status}</Typography>
      <Typography>{lookup.locations.find((value) => value.id === transfer.sourceLocationId)?.name} → {lookup.locations.find((value) => value.id === transfer.destinationLocationId)?.name}</Typography>
      {transfer.lines.map((line) => <Typography key={line.id}>{line.itemName} {line.assetCode} · {t('Angefordert', 'Requested')}: {line.requestedQuantity} · {t('Erhalten', 'Received')}: {line.receivedQuantity} · {t('Abweichung', 'Discrepancy')}: {line.discrepancyQuantity}{line.discrepancyNotes ? ` — ${line.discrepancyNotes}` : ''}</Typography>)}
      {transfer.notes && <Typography>{transfer.notes}</Typography>}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {['requested', 'picking'].includes(transfer.status) && <><Button onClick={() => setAction({ transfer, type: 'dispatch', key: crypto.randomUUID() })}>{t('Versenden', 'Dispatch')}</Button><Button onClick={() => setAction({ transfer, type: 'cancel', key: crypto.randomUUID() })}>{t('Stornieren', 'Cancel transfer')}</Button></>}
        {['in_transit', 'partially_received'].includes(transfer.status) && <Button onClick={() => setAction({ transfer, type: 'receive', key: crypto.randomUUID() })}>{t('Empfang erfassen', 'Receive transfer')}</Button>}
      </Stack>
    </Stack></CardContent></Card>)}
    {chooseItem && <OperationForm title={t('Artikel umlagern', 'Transfer item')} fields={[{ key: 'itemId', label: t('Artikel', 'Item'), options: lookup.itemOptions, required: true }]} onClose={() => setChooseItem(false)} submitLabel={t('Weiter', 'Next')} onSave={async (values) => { setItemId(String(values.itemId)); setCreateKey(crypto.randomUUID()); }} />}
    {item && <OperationForm title={`${t('Umlagern', 'Transfer')}: ${item.name}`} initial={{ quantity: 1, sourceLocationId: params.get('sourceLocationId') ?? '' }} onClose={() => setItemId('')} fields={[
      { key: 'sourceLocationId', label: t('Von', 'From'), options: lookup.locationOptions, required: true },
      { key: 'destinationLocationId', label: t('Nach', 'To'), options: lookup.locationOptions, required: true },
      ...(item.trackingMode === 'serialized' ? [{ key: 'assetInstanceId', label: t('Gerät', 'Asset'), required: true, options: (assets.data ?? []).filter((asset) => asset.active && asset.availabilityStatus === 'available').map((asset) => ({ value: asset.id, label: `${asset.assetCode} · ${asset.currentLocationName ?? ''}` })) }] : [{ key: 'quantity', label: t('Menge', 'Quantity'), type: 'number' as const, min: 1, required: true }]),
      ...(item.trackingMode === 'lot_tracked' ? [{ key: 'lotId', label: t('Charge', 'Lot'), required: true, options: (lots.data ?? []).map((lot) => ({ value: lot.id, label: lot.lotNumber })) }] : []),
      { key: 'notes', label: t('Notiz', 'Notes'), multiline: true },
    ]} onSave={(values) => {
      if (values.sourceLocationId === values.destinationLocationId) return Promise.reject(new Error(t('Quelle und Ziel müssen verschieden sein.', 'Source and destination must differ.')));
      return operationsApi.createTransfer({ ...optionalValues(values), idempotencyKey: createKey, lines: [{ itemId, assetInstanceId: values.assetInstanceId || null, lotId: values.lotId || null, quantity: item.trackingMode === 'serialized' ? 1 : values.quantity }] });
    }} />}
    {action && <OperationForm title={`${action.transfer.transferNumber} · ${action.type}`} onClose={() => setAction(null)} fields={[
      ...(action.type === 'receive' ? action.transfer.lines.flatMap((line): Field[] => {
        const remaining = line.pickedQuantity - line.receivedQuantity - line.discrepancyQuantity;
        if (remaining <= 0) return [];
        return [{ key: `received:${line.id}`, label: `${line.itemName} ${line.assetCode ?? ''} · ${t('Erhalten', 'Received')}`, type: 'number', min: 0, max: remaining, help: `${t('Offen', 'Remaining')}: ${remaining}` }, { key: `discrepancy:${line.id}`, label: t('Fehlmenge', 'Discrepancy quantity'), type: 'number', min: 0, max: remaining }, { key: `reason:${line.id}`, label: t('Grund der Abweichung', 'Discrepancy reason') }];
      }) : []), { key: 'notes', label: t('Notiz', 'Notes'), multiline: true },
    ]} onSave={(values) => operationsApi.transferCommand(action.transfer.id, action.type, { idempotencyKey: action.key, notes: values.notes || null, ...(action.type === 'receive' ? { lines: action.transfer.lines.map((line) => ({ transferLineId: line.id, receivedQuantity: Number(values[`received:${line.id}`] || 0), discrepancyQuantity: Number(values[`discrepancy:${line.id}`] || 0), discrepancyNotes: values[`reason:${line.id}`] || null })).filter((line) => line.receivedQuantity + line.discrepancyQuantity > 0) } : {}) })} />}
  </Stack>;
}

export function CountsPanel() {
  const t = useLocalizedText(); const lookup = useStockLookups(); const { user } = useAuth();
  const counts = useOperationList('counts', operationsApi.counts);
  const [create, setCreate] = useState(false);
  const [action, setAction] = useState<{ count: Count; type: 'start' | 'submit' | 'recount' | 'approve' | 'post' | 'cancel' } | null>(null);
  return <Stack spacing={2}>
    <Button variant="contained" onClick={() => setCreate(true)}>{t('Inventur starten', 'New stock count')}</Button>
    {counts.isLoading && <LinearProgress />}{counts.error && <Alert severity="error">{counts.error.message}</Alert>}
    {!counts.isLoading && !counts.data?.length && <Alert severity="info">{t('Noch keine Inventuren.', 'No stock counts yet.')}</Alert>}
    {counts.data?.map((count) => <Card key={count.id}><CardContent><Stack spacing={1}>
      <Typography variant="h6">{count.sessionNumber} · {count.status}</Typography>
      <Typography>{lookup.locations.find((value) => value.id === count.locationId)?.name} {count.blindCount ? t(' · Blindzählung', ' · Blind count') : ''}</Typography>
      {count.lines.map((line) => <Typography key={line.id}>{line.itemName} {line.assetCode} · {t('Gezählt', 'Counted')}: {line.countedQuantity ?? '—'} · {t('Nachzählung', 'Recount')}: {line.recountedQuantity ?? '—'}{line.expectedQuantity != null ? ` · ${t('Erwartet', 'Expected')}: ${line.expectedQuantity}` : ''}{line.varianceQuantity != null ? ` · ${t('Abweichung', 'Variance')}: ${line.varianceQuantity}` : ''}</Typography>)}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {count.status === 'draft' && <Button onClick={() => setAction({ count, type: 'start' })}>{t('Zählen', 'Start counting')}</Button>}
        {count.status === 'counting' && <Button onClick={() => setAction({ count, type: 'submit' })}>{t('Zählung erfassen', 'Record count')}</Button>}
        {count.status === 'awaiting_recount' && <Button onClick={() => setAction({ count, type: 'recount' })}>{t('Nachzählen', 'Recount')}</Button>}
        {count.status === 'awaiting_approval' && canManageUsers(user) && <Button onClick={() => setAction({ count, type: 'approve' })}>{t('Freigeben', 'Approve')}</Button>}
        {count.status === 'approved' && <Button onClick={() => setAction({ count, type: 'post' })}>{t('Bestand korrigieren', 'Post adjustment')}</Button>}
        {!['posted', 'cancelled'].includes(count.status) && <Button onClick={() => setAction({ count, type: 'cancel' })}>{t('Abbrechen', 'Cancel count')}</Button>}
      </Stack>
    </Stack></CardContent></Card>)}
    {create && <OperationForm title={t('Neue Inventur', 'New stock count')} initial={{ blindCount: true }} fields={[
      { key: 'locationId', label: t('Lagerort (leer = alle)', 'Location (empty = all)'), options: lookup.locationOptions },
      { key: 'itemId', label: t('Artikel (leer = alle)', 'Item (empty = all)'), options: lookup.itemOptions },
      { key: 'category', label: t('Kategorie (leer = alle)', 'Category (empty = all)'), options: [...new Set(lookup.items.map((item) => item.category))].map((value) => ({ value, label: value })) },
      { key: 'blindCount', label: t('Blindzählung', 'Blind count'), type: 'checkbox' }, { key: 'notes', label: t('Notiz', 'Notes'), multiline: true },
    ]} onSave={(values) => operationsApi.createCount(optionalValues(values))} onClose={() => setCreate(false)} />}
    {action && <OperationForm title={`${action.count.sessionNumber} · ${action.type}`} onClose={() => setAction(null)} fields={[
      ...(['submit', 'recount'].includes(action.type) ? action.count.lines.flatMap((line): Field[] => [
        { key: `quantity:${line.id}`, label: `${line.itemName} ${line.assetCode ?? ''}`, type: 'number', min: 0, required: true }, { key: `note:${line.id}`, label: t('Zeilennotiz', 'Line notes') },
      ]) : []), { key: 'notes', label: t('Notiz / Freigabebegründung', 'Notes / approval reason'), multiline: true },
    ]} onSave={(values) => operationsApi.countCommand(action.count.id, action.type, { notes: values.notes || null, ...(['submit', 'recount'].includes(action.type) ? { lines: action.count.lines.map((line) => ({ lineId: line.id, quantity: values[`quantity:${line.id}`], notes: values[`note:${line.id}`] || null })) } : {}) })} />}
  </Stack>;
}

export function LotsPanel() {
  const t = useLocalizedText(); const lookup = useStockLookups(); const lots = useOperationList('lots', operationsApi.lots());
  const [edit, setEdit] = useState<Lot | 'new' | null>(null);
  return <Stack spacing={2}>
    <Button variant="contained" onClick={() => setEdit('new')}>{t('Charge anlegen', 'New lot')}</Button>
    {lots.isLoading && <LinearProgress />}{lots.error && <Alert severity="error">{lots.error.message}</Alert>}
    {!lots.isLoading && !lots.data?.length && <Alert severity="info">{t('Noch keine Chargen.', 'No lots yet.')}</Alert>}
    {lots.data?.map((lot) => <Card key={lot.id}><CardContent><Stack spacing={1}>
      <Typography variant="h6">{lookup.items.find((item) => item.id === lot.itemId)?.name} · {lot.lotNumber}</Typography>
      <Typography>{lot.status} · {t('Ablauf', 'Expiry')}: {lot.expiryDate ?? '—'} · {t('MHD', 'Best before')}: {lot.bestBeforeDate ?? '—'}</Typography>
      <Typography>{lot.storageRequirements} {lot.notes}</Typography><Button onClick={() => setEdit(lot)}>{t('Bearbeiten / sperren', 'Edit / hold')}</Button>
    </Stack></CardContent></Card>)}
    {edit && <OperationForm title={t('Charge', 'Lot')} initial={edit === 'new' ? { status: 'available' } : Object.fromEntries(Object.entries(edit).filter(([, value]) => typeof value === 'string'))} onClose={() => setEdit(null)} fields={[
      { key: 'itemId', label: t('Artikel', 'Item'), options: lookup.itemOptions.filter((option) => lookup.items.find((item) => item.id === option.value)?.trackingMode === 'lot_tracked'), required: true },
      { key: 'lotNumber', label: t('Chargennummer', 'Lot number'), required: true }, { key: 'supplierLot', label: t('Lieferantencharge', 'Supplier lot') },
      { key: 'manufactureDate', label: t('Herstellungsdatum', 'Manufactured'), type: 'date' }, { key: 'expiryDate', label: t('Ablaufdatum', 'Expiry date'), type: 'date' }, { key: 'bestBeforeDate', label: t('Mindesthaltbarkeit', 'Best before'), type: 'date' },
      { key: 'status', label: t('Status', 'Status'), required: true, options: ['available', 'hold', 'recalled', 'expired', 'depleted'].map((value) => ({ value, label: value })) },
      { key: 'storageRequirements', label: t('Lagerbedingungen', 'Storage requirements'), multiline: true }, { key: 'notes', label: t('Notiz', 'Notes'), multiline: true },
    ]} onSave={(values) => operationsApi.saveLot(optionalValues(values), edit === 'new' ? undefined : edit.id)} />}
  </Stack>;
}

