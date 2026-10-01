import { Button } from '../shared/ActionButtons';
import { optionalText, inputNumber } from '../../utils/inputValues';
import { transferInput, countInput, lotInput } from '../../services/operationsInputs';
import { QueryFeedback } from '../common/QueryFeedback';
import { useStockLookups } from '../../hooks/useStockLookups';
import { optionalValues } from '../../utils/operationForm';
import { useState } from 'react';
import { Autocomplete, Card, CardContent, Link, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useItemAssets } from '../../hooks/useItems';
import { useOperationList } from '../../hooks/useOperations';
import { operationsApi } from '../../services/operationsService';
import type { Count, Lot, Transfer } from '../../types/operations';
import { Fields, OperationForm, type Field, type Values } from './OperationForm';
import { translate, useLocalizedText } from '../../utils/naming';
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
  const lots = useOperationList(`stock-lot-labels:${itemId ?? ''}`, operationsApi.lots({ itemId }));
  return <Stack spacing={1}>
    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 1 }}>
      <Typography variant="h6">{t('Bestand nach Lagerort', 'Stock by location')}</Typography>
      {itemId && !locationId && <Autocomplete size="small" sx={{ width: { xs: '100%', sm: 300 } }}
        options={lookup.locationOptions} value={lookup.locationOptions.find((option) => option.value === selectedLocation) ?? null}
        getOptionLabel={(option) => option.label} isOptionEqualToValue={(a, b) => a.value === b.value}
        onChange={(_, option) => setFilters({ ...filters, locationId: option?.value ?? '' })}
        renderInput={(params) => <TextField {...params} label={t('Lagerort', 'Location')} placeholder={t('Alle Lagerorte', 'All locations')} />} />}
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
            {itemId ? <Typography variant="body2" sx={{ fontWeight: 600 }}>{lookup.locationOptions.find((location) => location.value === position.locationId)?.label ?? t('Ohne Lagerort', 'Unassigned location')}</Typography>
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
  const assets = useItemAssets(itemId || undefined);
  const lots = useOperationList(`lots:${itemId}`, operationsApi.lots({ itemId: itemId || undefined }), Boolean(itemId));
  const [action, setAction] = useState<{ transfer: Transfer; type: 'dispatch' | 'receive' | 'cancel'; key: string } | null>(null);
  const [createKey, setCreateKey] = useState('');
  return <Stack spacing={2}>
    <Button title={translate('Eine Umlagerung zwischen Lagerorten anlegen', 'Create a transfer between storage locations')} variant="contained" onClick={() => setChooseItem(true)}>{t('Umlagerung anlegen', 'New transfer')}</Button>
    <QueryFeedback isLoading={transfers.isLoading} error={transfers.error} isEmpty={!transfers.data?.length} emptyMessage={t('Noch keine Umlagerungen.', 'No transfers yet.')} />
    {transfers.data?.map((transfer) => <Card key={transfer.id}><CardContent><Stack spacing={1}>
      <Typography variant="h6">{transfer.transferNumber} · {transfer.status}</Typography>
      <Typography>{lookup.locations.find((value) => value.id === transfer.sourceLocationId)?.name} → {lookup.locations.find((value) => value.id === transfer.destinationLocationId)?.name}</Typography>
      {transfer.lines.map((line) => <Typography key={line.id}>{line.itemName} {line.assetCode} · {t('Angefordert', 'Requested')}: {line.requestedQuantity} · {t('Erhalten', 'Received')}: {line.receivedQuantity} · {t('Abweichung', 'Discrepancy')}: {line.discrepancyQuantity}{line.discrepancyNotes ? ` — ${line.discrepancyNotes}` : ''}</Typography>)}
      {transfer.notes && <Typography>{transfer.notes}</Typography>}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {['requested', 'picking'].includes(transfer.status) && <><Button title={translate('Die Umlagerung als versendet erfassen', 'Record dispatch of this transfer')} onClick={() => setAction({ transfer, type: 'dispatch', key: crypto.randomUUID() })}>{t('Versenden', 'Dispatch')}</Button><Button title={translate('Diese Umlagerung stornieren', 'Cancel this transfer')} onClick={() => setAction({ transfer, type: 'cancel', key: crypto.randomUUID() })}>{t('Stornieren', 'Cancel transfer')}</Button></>}
        {['in_transit', 'partially_received'].includes(transfer.status) && <Button title={translate('Die empfangenen Mengen der Umlagerung erfassen', 'Record the quantities received in this transfer')} onClick={() => setAction({ transfer, type: 'receive', key: crypto.randomUUID() })}>{t('Empfang erfassen', 'Receive transfer')}</Button>}
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
      return operationsApi.createTransfer(transferInput({ ...optionalValues(values), idempotencyKey: createKey, lines: [{ itemId, assetInstanceId: values.assetInstanceId || null, lotId: values.lotId || null, quantity: item.trackingMode === 'serialized' ? 1 : values.quantity }] }));
    }} />}
    {action && <OperationForm title={`${action.transfer.transferNumber} · ${action.type}`} onClose={() => setAction(null)} fields={[
      ...(action.type === 'receive' ? action.transfer.lines.flatMap((line): Field[] => {
        const remaining = line.pickedQuantity - line.receivedQuantity - line.discrepancyQuantity;
        if (remaining <= 0) return [];
        return [{ key: `received:${line.id}`, label: `${line.itemName} ${line.assetCode ?? ''} · ${t('Erhalten', 'Received')}`, type: 'number', min: 0, max: remaining, help: `${t('Offen', 'Remaining')}: ${remaining}` }, { key: `discrepancy:${line.id}`, label: t('Fehlmenge', 'Discrepancy quantity'), type: 'number', min: 0, max: remaining }, { key: `reason:${line.id}`, label: t('Grund der Abweichung', 'Discrepancy reason') }];
      }) : []), { key: 'notes', label: t('Notiz', 'Notes'), multiline: true },
    ]} onSave={(values) => operationsApi.transferCommand(action.transfer.id, action.type, { idempotencyKey: action.key, notes: optionalText(values.notes), ...(action.type === 'receive' ? { lines: action.transfer.lines.map((line) => ({ transferLineId: line.id, receivedQuantity: Number(values[`received:${line.id}`] || 0), discrepancyQuantity: Number(values[`discrepancy:${line.id}`] || 0), discrepancyNotes: optionalText(values[`reason:${line.id}`]) })).filter((line) => line.receivedQuantity + line.discrepancyQuantity > 0) } : {}) })} />}
  </Stack>;
}

export function CountsPanel() {
  const t = useLocalizedText(); const lookup = useStockLookups(); const { user } = useAuth();
  const counts = useOperationList('counts', operationsApi.counts);
  const [create, setCreate] = useState(false);
  const [action, setAction] = useState<{ count: Count; type: 'start' | 'submit' | 'recount' | 'approve' | 'post' | 'cancel' } | null>(null);
  return <Stack spacing={2}>
    <Button title={translate('Eine neue Inventur anlegen', 'Create a new stock count')} variant="contained" onClick={() => setCreate(true)}>{t('Inventur starten', 'New stock count')}</Button>
    <QueryFeedback isLoading={counts.isLoading} error={counts.error} isEmpty={!counts.data?.length} emptyMessage={t('Noch keine Inventuren.', 'No stock counts yet.')} />
    {counts.data?.map((count) => <Card key={count.id}><CardContent><Stack spacing={1}>
      <Typography variant="h6">{count.sessionNumber} · {count.status}</Typography>
      <Typography>{lookup.locations.find((value) => value.id === count.locationId)?.name} {count.blindCount ? t(' · Blindzählung', ' · Blind count') : ''}</Typography>
      {count.lines.map((line) => <Typography key={line.id}>{line.itemName} {line.assetCode} · {t('Gezählt', 'Counted')}: {line.countedQuantity ?? '—'} · {t('Nachzählung', 'Recount')}: {line.recountedQuantity ?? '—'}{line.expectedQuantity != null ? ` · ${t('Erwartet', 'Expected')}: ${line.expectedQuantity}` : ''}{line.varianceQuantity != null ? ` · ${t('Abweichung', 'Variance')}: ${line.varianceQuantity}` : ''}</Typography>)}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {count.status === 'draft' && <Button title={translate('Mit der Zählung dieser Inventur beginnen', 'Start counting this inventory')} onClick={() => setAction({ count, type: 'start' })}>{t('Zählen', 'Start counting')}</Button>}
        {count.status === 'counting' && <Button title={translate('Die gezählten Mengen eingeben', 'Enter the counted quantities')} onClick={() => setAction({ count, type: 'submit' })}>{t('Zählung erfassen', 'Record count')}</Button>}
        {count.status === 'awaiting_recount' && <Button title={translate('Eine Nachzählung der Inventur starten', 'Start a recount of this inventory')} onClick={() => setAction({ count, type: 'recount' })}>{t('Nachzählen', 'Recount')}</Button>}
        {count.status === 'awaiting_approval' && canManageUsers(user) && <Button title={translate('Die erfassten Zählmengen freigeben', 'Approve the recorded count quantities')} onClick={() => setAction({ count, type: 'approve' })}>{t('Freigeben', 'Approve')}</Button>}
        {count.status === 'approved' && <Button title={translate('Den Bestand anhand der freigegebenen Inventur korrigieren', 'Adjust stock using the approved count')} onClick={() => setAction({ count, type: 'post' })}>{t('Bestand korrigieren', 'Post adjustment')}</Button>}
        {!['posted', 'cancelled'].includes(count.status) && <Button title={translate('Diese Inventur abbrechen', 'Cancel this stock count')} onClick={() => setAction({ count, type: 'cancel' })}>{t('Abbrechen', 'Cancel count')}</Button>}
      </Stack>
    </Stack></CardContent></Card>)}
    {create && <OperationForm title={t('Neue Inventur', 'New stock count')} initial={{ blindCount: true }} fields={[
      { key: 'locationId', label: t('Lagerort (leer = alle)', 'Location (empty = all)'), options: lookup.locationOptions },
      { key: 'itemId', label: t('Artikel (leer = alle)', 'Item (empty = all)'), options: lookup.itemOptions },
      { key: 'category', label: t('Kategorie (leer = alle)', 'Category (empty = all)'), options: [...new Set(lookup.items.map((item) => item.category))].map((value) => ({ value, label: value })) },
      { key: 'blindCount', label: t('Blindzählung', 'Blind count'), type: 'checkbox' }, { key: 'notes', label: t('Notiz', 'Notes'), multiline: true },
    ]} onSave={(values) => operationsApi.createCount(countInput(optionalValues(values)))} onClose={() => setCreate(false)} />}
    {action && <OperationForm title={`${action.count.sessionNumber} · ${action.type}`} onClose={() => setAction(null)} fields={[
      ...(['submit', 'recount'].includes(action.type) ? action.count.lines.flatMap((line): Field[] => [
        { key: `quantity:${line.id}`, label: `${line.itemName} ${line.assetCode ?? ''}`, type: 'number', min: 0, required: true }, { key: `note:${line.id}`, label: t('Zeilennotiz', 'Line notes') },
      ]) : []), { key: 'notes', label: t('Notiz / Freigabebegründung', 'Notes / approval reason'), multiline: true },
    ]} onSave={(values) => operationsApi.countCommand(action.count.id, action.type, { notes: optionalText(values.notes), ...(['submit', 'recount'].includes(action.type) ? { lines: action.count.lines.map((line) => ({ lineId: line.id, quantity: inputNumber(values[`quantity:${line.id}`]), notes: optionalText(values[`note:${line.id}`]) })) } : {}) })} />}
  </Stack>;
}

export function LotsPanel() {
  const t = useLocalizedText(); const lookup = useStockLookups(); const lots = useOperationList('lots', operationsApi.lots());
  const [edit, setEdit] = useState<Lot | 'new' | null>(null);
  return <Stack spacing={2}>
    <Button title={translate('Eine neue Bestandscharge anlegen', 'Create a new inventory lot')} variant="contained" onClick={() => setEdit('new')}>{t('Charge anlegen', 'New lot')}</Button>
    <QueryFeedback isLoading={lots.isLoading} error={lots.error} isEmpty={!lots.data?.length} emptyMessage={t('Noch keine Chargen.', 'No lots yet.')} />
    {lots.data?.map((lot) => <Card key={lot.id}><CardContent><Stack spacing={1}>
      <Typography variant="h6">{lookup.items.find((item) => item.id === lot.itemId)?.name} · {lot.lotNumber}</Typography>
      <Typography>{lot.status} · {t('Ablauf', 'Expiry')}: {lot.expiryDate ?? '—'} · {t('MHD', 'Best before')}: {lot.bestBeforeDate ?? '—'}</Typography>
      <Typography>{lot.storageRequirements} {lot.notes}</Typography><Button title={translate('Chargendaten oder Sperrstatus bearbeiten', 'Edit lot details or hold status')} onClick={() => setEdit(lot)}>{t('Bearbeiten / sperren', 'Edit / hold')}</Button>
    </Stack></CardContent></Card>)}
    {edit && <OperationForm title={t('Charge', 'Lot')} initial={edit === 'new' ? { status: 'available' } : Object.fromEntries(Object.entries(edit).filter(([, value]) => typeof value === 'string'))} onClose={() => setEdit(null)} fields={[
      { key: 'itemId', label: t('Artikel', 'Item'), options: lookup.itemOptions.filter((option) => lookup.items.find((item) => item.id === option.value)?.trackingMode === 'lot_tracked'), required: true },
      { key: 'lotNumber', label: t('Chargennummer', 'Lot number'), required: true }, { key: 'supplierLot', label: t('Lieferantencharge', 'Supplier lot') },
      { key: 'manufactureDate', label: t('Herstellungsdatum', 'Manufactured'), type: 'date' }, { key: 'expiryDate', label: t('Ablaufdatum', 'Expiry date'), type: 'date' }, { key: 'bestBeforeDate', label: t('Mindesthaltbarkeit', 'Best before'), type: 'date' },
      { key: 'status', label: t('Status', 'Status'), required: true, options: ['available', 'hold', 'recalled', 'expired', 'depleted'].map((value) => ({ value, label: value })) },
      { key: 'storageRequirements', label: t('Lagerbedingungen', 'Storage requirements'), multiline: true }, { key: 'notes', label: t('Notiz', 'Notes'), multiline: true },
    ]} onSave={(values) => operationsApi.saveLot(lotInput(optionalValues(values)), edit === 'new' ? undefined : edit.id)} />}
  </Stack>;
}

