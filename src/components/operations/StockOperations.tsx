import { CollapsibleOperationLines, OperationLines } from './OperationLines';
import { OperationHistory, OperationListEntry } from './OperationListEntry';
import { Button } from '../shared/ActionButtons';
import { optionalText, inputNumber } from '../../utils/inputValues';
import { transferInput, countInput, lotInput } from '../../services/operationsInputs';
import { QueryFeedback } from '../common/QueryFeedback';
import { useStockLookups } from '../../hooks/useStockLookups';
import { optionalValues } from '../../utils/operationForm';
import { useState } from 'react';
import { Alert, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Link, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useItemAssets } from '../../hooks/useItems';
import { useOperationList } from '../../hooks/useOperations';
import { operationsApi } from '../../services/operationsService';
import type { Item } from '../../types';
import type { Count, Lot, Transfer } from '../../types/operations';
import { Fields, OperationForm, type Field, type Values } from './OperationForm';
import { translate, useLocalizedText } from '../../utils/naming';
import { useAuth } from '../../hooks/useAuth';
import { canManageUsers } from '../../utils/access';

export function StockPositions({ itemId, locationId }: { itemId?: string; locationId?: string }) {
  const t = useLocalizedText();
  const lookup = useStockLookups();
  const [filters, setFilters] = useState<Values>({ itemId: itemId ?? '', locationId: locationId ?? '' });
  const selectedItem = itemId ?? String(filters.itemId || '');
  const selectedLocation = locationId ?? String(filters.locationId || '');
  const positions = useOperationList(`positions:${selectedItem}:${selectedLocation}`, operationsApi.positions({ itemId: selectedItem || undefined, locationId: selectedLocation || undefined }));
  const assets = useOperationList(`assets:${selectedItem}:${selectedLocation}`, operationsApi.assets({ itemId: selectedItem || undefined, locationId: selectedLocation || undefined }));
  const lots = useOperationList(`stock-lot-labels:${itemId ?? ''}`, operationsApi.lots({ itemId }));
  return <Stack spacing={1}>
    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 1 }}>
      <Typography variant="h6">{t('Bestand nach Lagerort', 'Stock by location')}</Typography>
    </Stack>
    {!itemId && <Fields values={filters} onChange={setFilters} fields={[
      ...(!itemId ? [{ key: 'itemId', label: t('Artikel / Geräte anzeigen', 'Item / show individual assets'), options: lookup.itemOptions }] : []),
      ...(!locationId ? [{ key: 'locationId', label: t('Lagerort', 'Location'), options: lookup.locationOptions }] : []),
    ]} />}
    <QueryFeedback isLoading={positions.isLoading || assets.isLoading} error={positions.error || assets.error || lookup.error} isEmpty={!positions.data?.length && !assets.data?.length} emptyMessage={t('Kein lokalisierter Bestand für diese Auswahl.', 'No located stock for this selection.')} />
    {!!positions.data?.length && <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={t('Bestand nach Lagerort', 'Stock by location')} sx={{ '& td, & th': { px: 1, py: 0.75 }, '& tr:last-child td, & tr:last-child th': { borderBottom: 0 } }}>
        <TableHead><TableRow>
          <TableCell sx={{ minWidth: 200 }}>{itemId ? t('Lagerort', 'Location') : t('Artikel / Lagerort', 'Item / location')}</TableCell>
          {[t('Verfügbar', 'Available'), t('Vor Ort', 'On hand'), t('Reserviert', 'Reserved'), t('Beschädigt', 'Damaged'), t('Quarantäne', 'Quarantine'), t('Unterwegs', 'In transit')].map((label) => <TableCell key={label} align="right">{label}</TableCell>)}
        </TableRow></TableHead>
        <TableBody>{positions.data.map((position) => <TableRow key={position.id} hover>
          <TableCell component="th" scope="row">
            {itemId ? <Link component={RouterLink} to={`/storage-locations?locationId=${position.locationId}`} color="text.primary" underline="hover" sx={{ fontWeight: 600 }}>{lookup.locationOptions.find((location) => location.value === position.locationId)?.label ?? t('Ohne Lagerort', 'Unassigned location')}</Link>
              : <Link component={RouterLink} to={`/items/${position.itemId}`} color="text.primary" underline="hover" sx={{ fontWeight: 600 }}>{lookup.items.find((item) => item.id === position.itemId)?.name ?? position.itemId}</Link>}
            {(!itemId || position.lotId) && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {!itemId && (lookup.locationOptions.find((location) => location.value === position.locationId)?.label ?? t('Ohne Lagerort', 'Unassigned location'))}
              {position.lotId ? `${!itemId ? ' · ' : ''}${t('Charge', 'Lot')}: ${lots.data?.find((lot) => lot.id === position.lotId)?.lotNumber ?? position.lotId}` : ''}
            </Typography>}
          </TableCell>
          <TableCell align="right" sx={{ color: position.availableQuantity > 0 ? 'success.main' : 'text.secondary', fontWeight: 700 }}>{position.availableQuantity}</TableCell>
          {[position.quantityOnHand, position.quantityReserved, position.quantityDamaged, position.quantityQuarantined, position.quantityInTransit].map((quantity, index) => <TableCell key={index} align="right">{quantity}</TableCell>)}
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>}
    {assets.data?.filter((asset) => !selectedLocation || asset.currentLocationId === selectedLocation).map((asset) => <Card key={asset.id}><CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
      <Link component={RouterLink} to={`/items/${asset.itemId}/assets/${asset.id}`} color="text.primary" underline="hover" sx={{ fontWeight: 600 }}>{asset.assetCode}</Link>
      <Typography variant="body2" color="text.secondary">{asset.currentLocationName ?? t('Ohne Lagerort', 'Unassigned location')} · {asset.availabilityStatus} · {asset.conditionStatus}{asset.currentCustodianName && ` · ${t('Bei', 'Held by')}: ${asset.currentCustodianName}`}</Typography>
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
  const [action, setAction] = useState<{ transfer: Transfer; type: 'dispatch' | 'receive' | 'cancel'; key: string } | null>(null);
  const [createKey, setCreateKey] = useState('');
  return <Stack spacing={2}>
    <Button title={translate('Eine Umlagerung zwischen Lagerorten anlegen', 'Create a transfer between storage locations')} variant="contained" onClick={() => setChooseItem(true)}>{t('Umlagerung anlegen', 'New transfer')}</Button>
    <QueryFeedback isLoading={transfers.isLoading} error={transfers.error} isEmpty={!transfers.data?.length} emptyMessage={t('Noch keine Umlagerungen.', 'No transfers yet.')} />
    {transfers.data?.map((transfer) => <OperationListEntry key={transfer.id} actions={<>
        {['requested', 'picking'].includes(transfer.status) && <><Button title={translate('Die Umlagerung als versendet erfassen', 'Record dispatch of this transfer')} onClick={() => setAction({ transfer, type: 'dispatch', key: crypto.randomUUID() })}>{t('Versenden', 'Dispatch')}</Button><Button title={translate('Diese Umlagerung stornieren', 'Cancel this transfer')} onClick={() => setAction({ transfer, type: 'cancel', key: crypto.randomUUID() })}>{t('Stornieren', 'Cancel transfer')}</Button></>}
        {['in_transit', 'partially_received'].includes(transfer.status) && <Button title={translate('Die empfangenen Mengen der Umlagerung erfassen', 'Record the quantities received in this transfer')} onClick={() => setAction({ transfer, type: 'receive', key: crypto.randomUUID() })}>{t('Empfang erfassen', 'Receive transfer')}</Button>}
       </>} title={<>{transfer.transferNumber}</>} status={transfer.status}>
      <Typography>{lookup.locations.find((value) => value.id === transfer.sourceLocationId)?.name} → {lookup.locations.find((value) => value.id === transfer.destinationLocationId)?.name}</Typography>
      <OperationLines label={t('Umlagerungspositionen', 'Transfer lines')} headers={[t('Artikel / Gerät', 'Item / asset'), t('Angefordert', 'Requested'), t('Erhalten', 'Received'), t('Abweichung', 'Discrepancy')]} rows={transfer.lines.map(line => ({ id: line.id, cells: [<Link component={RouterLink} to={`/items/${line.itemId}`} key={line.id}>{line.itemName} {line.assetCode}{line.discrepancyNotes && <Typography variant="caption" sx={{ display: 'block' }}>{line.discrepancyNotes}</Typography>}</Link>, line.requestedQuantity, line.receivedQuantity, line.discrepancyQuantity] }))} />
      {transfer.notes && <Typography>{transfer.notes}</Typography>}

    </OperationListEntry>)}
    {chooseItem && <OperationForm title={t('Artikel umlagern', 'Transfer item')} fields={[{ key: 'itemId', label: t('Artikel', 'Item'), options: lookup.itemOptions, required: true }]} onClose={() => setChooseItem(false)} submitLabel={t('Weiter', 'Next')} onSave={async (values) => { setChooseItem(false); setItemId(String(values.itemId)); setCreateKey(crypto.randomUUID()); }} />}
    {item && <TransferItemForm item={item} sourceLocationId={params.get('sourceLocationId') ?? ''} idempotencyKey={createKey} onClose={() => setItemId('')} />}
    {action && <OperationForm title={`${action.transfer.transferNumber} · ${action.type}`} onClose={() => setAction(null)}
      initial={Object.fromEntries(action.transfer.lines.flatMap(line => [[`received:${line.id}`, Math.max(0, line.pickedQuantity - line.receivedQuantity - line.discrepancyQuantity)], [`discrepancy:${line.id}`, 0], [`reason:${line.id}`, '']]))} fields={[
      ...(action.type === 'receive' ? action.transfer.lines.flatMap((line): Field[] => {
        const remaining = line.pickedQuantity - line.receivedQuantity - line.discrepancyQuantity;
        if (remaining <= 0) return [];
        return [{ key: `received:${line.id}`, label: `${line.itemName} ${line.assetCode ?? ''} · ${t('Erhalten', 'Received')}`, type: 'number', min: 0, max: remaining, required: true, help: `${t('Offen', 'Remaining')}: ${remaining}` }, { key: `discrepancy:${line.id}`, label: t('Fehlmenge', 'Discrepancy quantity'), type: 'number', min: 0, max: remaining, required: true }, { key: `reason:${line.id}`, label: t('Grund der Abweichung', 'Discrepancy reason') }];
      }) : []), { key: 'notes', label: t('Notiz', 'Notes'), multiline: true },
    ]} onSave={(values) => operationsApi.transferCommand(action.transfer.id, action.type, { idempotencyKey: action.key, notes: optionalText(values.notes), ...(action.type === 'receive' ? { lines: action.transfer.lines.map((line) => ({ transferLineId: line.id, receivedQuantity: Number(values[`received:${line.id}`] || 0), discrepancyQuantity: Number(values[`discrepancy:${line.id}`] || 0), discrepancyNotes: optionalText(values[`reason:${line.id}`]) })).filter((line) => line.receivedQuantity + line.discrepancyQuantity > 0) } : {}) })} />}
  </Stack>;
}

function TransferItemForm({ item, sourceLocationId, idempotencyKey, onClose }: { item: Item; sourceLocationId: string; idempotencyKey: string; onClose: () => void }) {
  const t = useLocalizedText(); const lookup = useStockLookups();
  const positions = useOperationList(`positions:transfer:${item.id}`, operationsApi.positions({ itemId: item.id }), item.trackingMode !== 'serialized');
  const assets = useItemAssets(item.trackingMode === 'serialized' ? item.id : undefined);
  const lots = useOperationList(`lots:${item.id}`, operationsApi.lots({ itemId: item.id }), item.trackingMode === 'lot_tracked');
  const [today] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
  const usableLots = (lots.data ?? []).filter(lot => lot.status === 'available' && (!lot.expiryDate || lot.expiryDate >= today) && (!lot.bestBeforeDate || lot.bestBeforeDate >= today));
  const availableAssets = (assets.data ?? []).filter(asset => asset.active && asset.availabilityStatus === 'available' && !['damaged', 'unsafe', 'lost'].includes(asset.conditionStatus));
  const availablePositions = (positions.data ?? []).filter(position => position.transferableQuantity > 0 && (item.trackingMode !== 'lot_tracked' || usableLots.some(lot => lot.id === position.lotId)));
  function available(locationId: string, lotId?: string) {
    if (item.trackingMode === 'serialized') return availableAssets.filter(asset => asset.currentLocationId === locationId).length;
    const located = availablePositions.filter(position => position.locationId === locationId && (!lotId || position.lotId === lotId)).reduce((sum, position) => sum + position.transferableQuantity, 0);
    return Math.min(located, item.stock ? Math.max(0, item.stock.onHand - item.stock.damaged - item.stock.reserved) : located);
  }
  const sourceOptions = lookup.locationOptions.filter(location => available(location.value) > 0)
    .map(location => ({ ...location, label: `${location.label} · ${t('Verfügbar', 'Available')}: ${available(location.value)}` }));
  const error = lookup.error || positions.error || assets.error || lots.error;
  const loading = lookup.loading || (item.trackingMode === 'serialized' ? !assets.isComplete : !positions.isComplete) || (item.trackingMode === 'lot_tracked' && !lots.isComplete);
  const [ready, setReady] = useState(false);
  if (!ready && !error && !loading) setReady(true);
  if (error || !ready || !sourceOptions.length) return <Dialog open fullWidth onClose={onClose}><DialogTitle>{item.name}</DialogTitle><DialogContent><QueryFeedback isLoading={!error && loading} error={error} />{!error && !loading && <Alert severity="info">{t('Kein verfügbarer Bestand zum Umlagern.', 'No available stock to transfer.')}</Alert>}</DialogContent><DialogActions><Button onClick={onClose}>{t('Schließen', 'Close')}</Button></DialogActions></Dialog>;
  return <OperationForm title={`${t('Umlagern', 'Transfer')}: ${item.name}`} initial={{ quantity: 1, sourceLocationId: sourceOptions.some(option => option.value === sourceLocationId) ? sourceLocationId : sourceOptions[0].value }} onClose={onClose} fields={(values): Field[] => {
    const source = String(values.sourceLocationId ?? '');
    const lotId = String(values.lotId ?? '');
    const quantity = available(source, lotId);
    return [
      { key: 'sourceLocationId', label: t('Von', 'From'), options: sourceOptions, required: true, reset: { assetInstanceId: '', lotId: '', quantity: 1 } },
      { key: 'destinationLocationId', label: t('Nach', 'To'), options: lookup.locationOptions.filter(location => location.value !== source), required: true },
      ...(item.trackingMode === 'serialized' ? [{ key: 'assetInstanceId', label: t('Gerät', 'Asset'), required: true, options: availableAssets.filter(asset => asset.currentLocationId === source).map(asset => ({ value: asset.id, label: asset.assetCode })) }] : [{ key: 'quantity', label: t('Menge', 'Quantity'), type: 'number' as const, min: 1, max: quantity, required: true, help: `${t('Verfügbar am Lagerort', 'Available at location')}: ${quantity}` }]),
      ...(item.trackingMode === 'lot_tracked' ? [{ key: 'lotId', label: t('Charge', 'Lot'), required: true, reset: { quantity: 1 }, options: usableLots.filter(lot => availablePositions.some(position => position.locationId === source && position.lotId === lot.id)).map(lot => ({ value: lot.id, label: `${lot.lotNumber} · ${t('Verfügbar', 'Available')}: ${available(source, lot.id)}` })) }] : []),
      { key: 'notes', label: t('Notiz', 'Notes'), multiline: true },
    ];
  }} onSave={values => {
    const source = String(values.sourceLocationId); const lotId = String(values.lotId || '');
    const quantity = item.trackingMode === 'serialized' ? 1 : Number(values.quantity);
    if (source === values.destinationLocationId) return Promise.reject(new Error(t('Quelle und Ziel müssen verschieden sein.', 'Source and destination must differ.')));
    if (quantity < 1 || quantity > available(source, lotId) || !Number.isInteger(quantity)) return Promise.reject(new Error(t('Die Menge überschreitet den verfügbaren Bestand.', 'Quantity exceeds available stock.')));
    if (item.trackingMode === 'serialized' && !availableAssets.some(asset => asset.id === values.assetInstanceId && asset.currentLocationId === source)) return Promise.reject(new Error(t('Das Gerät ist am gewählten Lagerort nicht verfügbar.', 'The asset is not available at this location.')));
    return operationsApi.createTransfer(transferInput({ ...optionalValues(values), idempotencyKey, lines: [{ itemId: item.id, assetInstanceId: values.assetInstanceId || null, lotId: values.lotId || null, quantity }] }));
  }} />;
}

export function CountsPanel() {
  const t = useLocalizedText(); const lookup = useStockLookups(); const { user } = useAuth();
  const counts = useOperationList('counts', operationsApi.counts);
  const [create, setCreate] = useState(false);
  const [action, setAction] = useState<{ count: Count; type: 'submit' | 'recount' | 'approve' | 'post' | 'cancel' } | null>(null);
  const finished = (count: Count) => ['posted', 'cancelled'].includes(count.status);
  const activeCounts = (counts.data ?? []).filter((count) => !finished(count));
  const finishedCounts = (counts.data ?? []).filter(finished);
  const countSummary = (count: Count) => {
    const counted = count.lines.filter((line) => line.countedQuantity != null).length;
    const variances = count.lines.filter((line) => line.varianceQuantity != null && line.varianceQuantity !== 0).length;
    return [t(`${counted} von ${count.lines.length} gezählt`, `${counted} of ${count.lines.length} counted`),
      variances ? t(`${variances} Abweichungen`, `${variances} with variance`) : ''].filter(Boolean).join(' · ');
  };
  const countEntry = (count: Count) => <OperationListEntry key={count.id} actions={<>
        {count.status === 'counting' && <Button title={translate('Die gezählten Mengen eingeben', 'Enter the counted quantities')} onClick={() => setAction({ count, type: 'submit' })}>{count.lines.some(line => line.countedQuantity != null) ? t('Zählung fortsetzen', 'Resume count') : t('Zählung erfassen', 'Record count')}</Button>}
        {count.status === 'awaiting_recount' && <Button title={translate('Eine Nachzählung der Inventur starten', 'Start a recount of this inventory')} onClick={() => setAction({ count, type: 'recount' })}>{t('Nachzählen', 'Recount')}</Button>}
        {count.status === 'awaiting_approval' && canManageUsers(user) && <Button title={translate('Die erfassten Zählmengen freigeben', 'Approve the recorded count quantities')} onClick={() => setAction({ count, type: 'approve' })}>{t('Freigeben', 'Approve')}</Button>}
        {count.status === 'approved' && <Button title={translate('Den Bestand anhand der freigegebenen Inventur korrigieren', 'Adjust stock using the approved count')} onClick={() => setAction({ count, type: 'post' })}>{t('Bestand korrigieren', 'Post adjustment')}</Button>}
        {!['posted', 'cancelled'].includes(count.status) && <Button title={translate('Diese Inventur abbrechen', 'Cancel this stock count')} onClick={() => setAction({ count, type: 'cancel' })}>{t('Abbrechen', 'Cancel count')}</Button>}
       </>} title={<>{count.sessionNumber}</>} status={count.status}>
      <Typography>{lookup.locations.find((value) => value.id === count.locationId)?.name} {count.blindCount ? t(' · Blindzählung', ' · Blind count') : ''}</Typography>
      <CollapsibleOperationLines summary={countSummary(count)} label={t('Inventurpositionen', 'Count lines')} headers={[t('Artikel / Lagerort', 'Item / location'), t('Erwartet', 'Expected'), t('Gezählt', 'Counted'), t('Nachzählung', 'Recount'), t('Abweichung', 'Variance')]} rows={count.lines.map(line => ({ id: line.id, cells: [<Stack key={line.id}><Typography>{line.itemName} {line.assetCode}</Typography><Typography variant="caption" color="text.secondary">{lookup.locationOptions.find(location => location.value === line.locationId)?.label ?? '—'}</Typography></Stack>, line.expectedQuantity ?? '—', line.countedQuantity ?? '—', line.recountedQuantity ?? '—', line.varianceQuantity ?? '—'] }))} />
    </OperationListEntry>;
  return <Stack spacing={2}>
    <Button title={translate('Eine neue Inventur anlegen', 'Create a new stock count')} variant="contained" onClick={() => setCreate(true)}>{t('Inventur starten', 'New stock count')}</Button>
    <QueryFeedback isLoading={counts.isLoading} error={counts.error} isEmpty={!counts.data?.length} emptyMessage={t('Noch keine Inventuren.', 'No stock counts yet.')} />
    {activeCounts.map(countEntry)}
    <OperationHistory title={t('Abgeschlossene Inventuren', 'Completed stock counts')} count={finishedCounts.length}>{finishedCounts.map(countEntry)}</OperationHistory>
    {create && <OperationForm title={t('Neue Inventur', 'New stock count')} initial={{ blindCount: false }} fields={[
      { key: 'locationId', label: t('Lagerort (leer = alle)', 'Location (empty = all)'), options: lookup.locationOptions },
      { key: 'itemId', label: t('Artikel (leer = alle)', 'Item (empty = all)'), options: lookup.itemOptions },
      { key: 'category', label: t('Kategorie (leer = alle)', 'Category (empty = all)'), options: [...new Set(lookup.items.map((item) => item.category))].map((value) => ({ value, label: value })) },
      { key: 'blindCount', label: t('Blindzählung', 'Blind count'), type: 'checkbox' },
    ]} onSave={(values) => operationsApi.createCount(countInput(optionalValues(values)))} onClose={() => setCreate(false)} />}
    {action && <OperationForm title={`${action.count.sessionNumber} · ${action.type}`} onClose={() => setAction(null)}
      submitLabel={['submit', 'recount'].includes(action.type) ? t('Fortschritt speichern', 'Save progress') : undefined}
      initial={Object.fromEntries(action.count.lines.flatMap(line => [
        [`quantity:${line.id}`, (action.type === 'recount' ? line.recountedQuantity : line.countedQuantity) ?? ''],
        [`note:${line.id}`, line.notes ?? ''],
      ]))} fields={[
      ...(['submit', 'recount'].includes(action.type) ? action.count.lines.flatMap((line): Field[] => [
        { key: `quantity:${line.id}`, label: `${line.itemName} ${line.assetCode ?? ''} · ${lookup.locationOptions.find(location => location.value === line.locationId)?.label ?? '—'}`, type: 'number', min: 0, max: line.assetCode ? 1 : undefined, help: `${t('Erwartet', 'Expected')}: ${line.expectedQuantity ?? '—'}${line.lotId ? ` · ${t('Charge', 'Lot')}: ${line.lotId}` : ''}` }, { key: `note:${line.id}`, label: t('Zeilennotiz', 'Line notes') },
      ]) : []), { key: 'notes', label: t('Notiz / Freigabebegründung', 'Notes / approval reason'), multiline: true },
    ]} onSave={(values) => {
      if (['submit', 'recount'].includes(action.type) && !action.count.lines.some(line => values[`quantity:${line.id}`] !== '' && values[`quantity:${line.id}`] !== undefined)) return Promise.reject(new Error(t('Mindestens eine gezählte Menge eingeben.', 'Enter at least one counted quantity.')));
      return operationsApi.countCommand(action.count.id, action.type, { notes: optionalText(values.notes), ...(['submit', 'recount'].includes(action.type) ? { lines: action.count.lines.filter(line => values[`quantity:${line.id}`] !== '' && values[`quantity:${line.id}`] !== undefined).map((line) => ({ lineId: line.id, quantity: inputNumber(values[`quantity:${line.id}`]), notes: optionalText(values[`note:${line.id}`]) })) } : {}) });
    }} />}
  </Stack>;
}

export function LotsPanel({ itemId }: { itemId?: string } = {}) {
  const t = useLocalizedText(); const lookup = useStockLookups(); const lots = useOperationList(`lots:${itemId ?? ''}`, operationsApi.lots({ itemId }));
  const [edit, setEdit] = useState<Lot | 'new' | null>(null);
  return <Stack spacing={2}>
    <Button title={translate('Eine neue Bestandscharge anlegen', 'Create a new inventory lot')} variant="contained" onClick={() => setEdit('new')}>{t('Charge anlegen', 'New lot')}</Button>
    <QueryFeedback isLoading={lots.isLoading} error={lots.error} isEmpty={!lots.data?.length} emptyMessage={t('Noch keine Chargen.', 'No lots yet.')} />
    {lots.data?.map((lot) => <OperationListEntry key={lot.id} status={lot.status} actions={<Button title={translate('Chargendaten oder Sperrstatus bearbeiten', 'Edit lot details or hold status')} onClick={() => setEdit(lot)}>{t('Bearbeiten / sperren', 'Edit / hold')}</Button>} title={<>{lookup.items.find((item) => item.id === lot.itemId)?.name} · {lot.lotNumber}</>}>
      <Typography>{t('Ablauf', 'Expiry')}: {lot.expiryDate ?? '—'} · {t('MHD', 'Best before')}: {lot.bestBeforeDate ?? '—'}</Typography>
      <Typography>{lot.storageRequirements} {lot.notes}</Typography>
    </OperationListEntry>)}
    {edit && <OperationForm title={t('Charge', 'Lot')} initial={edit === 'new' ? { status: 'available', itemId: itemId ?? '' } : Object.fromEntries(Object.entries(edit).filter(([, value]) => typeof value === 'string'))} onClose={() => setEdit(null)} fields={[
      { key: 'itemId', label: t('Artikel', 'Item'), options: lookup.itemOptions.filter((option) => (!itemId || option.value === itemId) && lookup.items.find((item) => item.id === option.value)?.trackingMode === 'lot_tracked'), required: true },
      { key: 'lotNumber', label: t('Chargennummer', 'Lot number'), required: true }, { key: 'supplierLot', label: t('Lieferantencharge', 'Supplier lot') },
      { key: 'manufactureDate', label: t('Herstellungsdatum', 'Manufactured'), type: 'date' }, { key: 'expiryDate', label: t('Ablaufdatum', 'Expiry date'), type: 'date' }, { key: 'bestBeforeDate', label: t('Mindesthaltbarkeit', 'Best before'), type: 'date' },
      { key: 'status', label: t('Status', 'Status'), required: true, options: ['available', 'hold', 'recalled', 'expired', 'depleted'].map((value) => ({ value, label: value })) },
      { key: 'storageRequirements', label: t('Lagerbedingungen', 'Storage requirements'), multiline: true }, { key: 'notes', label: t('Notiz', 'Notes'), multiline: true },
    ]} onSave={(values) => operationsApi.saveLot(lotInput(optionalValues(values)), edit === 'new' ? undefined : edit.id)} />}
  </Stack>;
}

