import { formatDate } from '../../utils/dateFormat';
import { Dialog } from '../shared/ClosableDialog';
import { CollapsibleOperationLines, OperationLines } from './OperationLines';
import { OperationHistory, OperationListEntry } from './OperationListEntry';
import { Button } from '../shared/ActionButtons';
import { optionalText, inputNumber } from '../../utils/inputValues';
import { transferInput, countInput, lotCreateInput, lotUpdateInput } from '../../services/operationsInputs';
import { QueryFeedback } from '../common/QueryFeedback';
import { useStockLookups } from '../../hooks/useStockLookups';
import { optionalValues } from '../../utils/operationForm';
import { useState } from 'react';
import { Alert, Card, CardContent, DialogActions, DialogContent, DialogTitle, Link, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useItemAssets, useItemCategories, useItemsByIds } from '../../hooks/useItems';
import { useCompleteList } from '../../hooks/usePagedList';
import { queryKeys } from '../../utils/queryKeys';
import { LoadMore } from '../shared/LoadMore';
import { useOperationList } from '../../hooks/useOperations';
import { operationsApi } from '../../services/operationsService';
import type { Item } from '../../types';
import type { Count, Lot, Transfer } from '../../types/operations';
import { Fields, OperationForm } from './OperationForm';
import type { Field, Values } from '../../types/operationForm';
import { translate, useT } from '../../utils/naming';
import { useAuth } from '../../hooks/useAuth';
import { canManageUsers } from '../../utils/access';
import { formatStatus } from '../../utils/formatters';

export function StockPositions({ itemId, locationId }: { itemId?: string; locationId?: string }) {
  const t = useT();
  const [filters, setFilters] = useState<Values>({ itemId: itemId ?? '', locationId: locationId ?? '' });
  const selectedItem = itemId ?? String(filters.itemId || '');
  const selectedLocation = locationId ?? String(filters.locationId || '');
  const positions = useOperationList(`positions:${selectedItem}:${selectedLocation}`, operationsApi.positions({ itemId: selectedItem || undefined, locationId: selectedLocation || undefined }));
  const assets = useOperationList(`assets:${selectedItem}:${selectedLocation}`, operationsApi.assets({ itemId: selectedItem || undefined, locationId: selectedLocation || undefined }));
  const lots = useOperationList(`stock-lot-labels:${itemId ?? ''}`, operationsApi.lots({ itemId }), Boolean(itemId));
  const lookup = useStockLookups(itemId ? [] : (positions.data ?? []).map((position) => position.itemId));
  return <Stack spacing={1}>
    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 1 }}>
      <Typography variant="h6">{t('operations.stockOperations.stockByLocation')}</Typography>
    </Stack>
    {!itemId && <Fields values={filters} onChange={setFilters} fields={[
      ...(!itemId ? [{ key: 'itemId', label: t('operations.stockOperations.itemShowIndividualAssets'), type: 'item' as const }] : []),
      ...(!locationId ? [{ key: 'locationId', label: t('enum.value.location'), options: lookup.locationOptions }] : []),
    ]} />}
    <QueryFeedback isLoading={positions.isLoading || assets.isLoading} error={positions.error || assets.error || lookup.error} isEmpty={!positions.data?.length && !assets.data?.length} emptyMessage={t('operations.stockOperations.noLocatedStockForThisSelection')} />
    {!!positions.data?.length && <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={t('operations.stockOperations.stockByLocation')} sx={{ '& td, & th': { px: 1, py: 0.75 }, '& tr:last-child td, & tr:last-child th': { borderBottom: 0 } }}>
        <TableHead><TableRow>
          <TableCell sx={{ minWidth: 200 }}>{itemId ? t('enum.value.location') : t('operations.stockOperations.itemLocation')}</TableCell>
          {[t('enum.itemStatus.available'), t('operations.stockOperations.onHand'), t('enum.transactionType.reserved'), t('enum.itemStatus.damaged'), t('enum.value.quarantine'), t('enum.value.in_transit')].map((label) => <TableCell key={label} align="right">{label}</TableCell>)}
        </TableRow></TableHead>
        <TableBody>{positions.data.map((position) => <TableRow key={position.id} hover>
          <TableCell component="th" scope="row">
            {itemId ? <Link component={RouterLink} to={`/storage-locations?locationId=${position.locationId}`} color="text.primary" underline="hover" sx={{ fontWeight: 600 }}>{lookup.locationOptions.find((location) => location.value === position.locationId)?.label ?? t('operations.stockOperations.unassignedLocation')}</Link>
              : <Link component={RouterLink} to={`/items/${position.itemId}`} color="text.primary" underline="hover" sx={{ fontWeight: 600 }}>{lookup.itemName(position.itemId)}</Link>}
            {(!itemId || position.lotId) && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {!itemId && (lookup.locationOptions.find((location) => location.value === position.locationId)?.label ?? t('operations.stockOperations.unassignedLocation'))}
              {position.lotId ? `${!itemId ? ' · ' : ''}${t('enum.value.lot')}: ${lots.data?.find((lot) => lot.id === position.lotId)?.lotNumber ?? position.lotId}` : ''}
            </Typography>}
          </TableCell>
          <TableCell align="right" sx={{ color: position.availableQuantity > 0 ? 'success.main' : 'text.secondary', fontWeight: 700 }}>{position.availableQuantity}</TableCell>
          {[position.quantityOnHand, position.quantityReserved, position.quantityDamaged, position.quantityQuarantined, position.quantityInTransit].map((quantity, index) => <TableCell key={index} align="right">{quantity}</TableCell>)}
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>}
    <LoadMore list={positions} />
    {assets.data?.filter((asset) => !selectedLocation || asset.currentLocationId === selectedLocation).map((asset) => <Card key={asset.id}><CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
      <Link component={RouterLink} to={`/items/${asset.itemId}/assets/${asset.id}`} color="text.primary" underline="hover" sx={{ fontWeight: 600 }}>{asset.assetCode}</Link>
      <Typography variant="body2" color="text.secondary">{asset.currentLocationName ?? t('operations.stockOperations.unassignedLocation')} · {formatStatus(asset.availabilityStatus)} · {formatStatus(asset.conditionStatus)}{asset.currentCustodianName && ` · ${t('operations.stockOperations.heldBy')}: ${asset.currentCustodianName}`}</Typography>
    </CardContent></Card>)}
    <LoadMore list={assets} />
  </Stack>;
}

export function TransfersPanel() {
  const [params] = useSearchParams();
  const t = useT();
  const transfers = useOperationList('transfers', operationsApi.transfers);
  const [chooseItem, setChooseItem] = useState(false);
  const [itemId, setItemId] = useState('');
  const lookup = useStockLookups(itemId ? [itemId] : []);
  const item = lookup.items.find((value) => value.id === itemId);
  const [action, setAction] = useState<{ transfer: Transfer; type: 'dispatch' | 'receive' | 'cancel'; key: string } | null>(null);
  const [createKey, setCreateKey] = useState('');
  return <Stack spacing={2}>
    <Button title={translate('operations.stockOperations.createATransferBetweenStorageLocations')} variant="contained" onClick={() => setChooseItem(true)}>{t('operations.stockOperations.newTransfer')}</Button>
    <QueryFeedback isLoading={transfers.isLoading} error={transfers.error} isEmpty={!transfers.data?.length} emptyMessage={t('operations.stockOperations.noTransfersYet')} />
    {transfers.data?.map((transfer) => <OperationListEntry key={transfer.id} actions={<>
        {['requested', 'picking'].includes(transfer.status) && <><Button title={translate('operations.stockOperations.recordDispatchOfThisTransfer')} onClick={() => setAction({ transfer, type: 'dispatch', key: crypto.randomUUID() })}>{t('operations.stockOperations.dispatch')}</Button><Button title={translate('operations.stockOperations.cancelThisTransfer')} onClick={() => setAction({ transfer, type: 'cancel', key: crypto.randomUUID() })}>{t('operations.stockOperations.cancelTransfer')}</Button></>}
        {['in_transit', 'partially_received'].includes(transfer.status) && <Button title={translate('operations.stockOperations.recordTheQuantitiesReceivedInThisTransfer')} onClick={() => setAction({ transfer, type: 'receive', key: crypto.randomUUID() })}>{t('operations.stockOperations.receiveTransfer')}</Button>}
       </>} title={<>{transfer.transferNumber}</>} status={transfer.status}>
      <Typography>{lookup.locations.find((value) => value.id === transfer.sourceLocationId)?.name} → {lookup.locations.find((value) => value.id === transfer.destinationLocationId)?.name}</Typography>
      <OperationLines label={t('operations.stockOperations.transferLines')} headers={[t('operations.stockOperations.itemAsset'), t('enum.value.requested'), t('enum.value.received'), t('operations.stockOperations.discrepancy')]} rows={transfer.lines.map(line => ({ id: line.id, cells: [<Link component={RouterLink} to={`/items/${line.itemId}`} key={line.id}>{line.itemName} {line.assetCode}{line.discrepancyNotes && <Typography variant="caption" sx={{ display: 'block' }}>{line.discrepancyNotes}</Typography>}</Link>, line.requestedQuantity, line.receivedQuantity, line.discrepancyQuantity] }))} />
      {transfer.notes && <Typography>{transfer.notes}</Typography>}

    </OperationListEntry>)}
    <LoadMore list={transfers} />
    {chooseItem && <OperationForm title={t('operations.stockOperations.transferItem')} fields={[{ key: 'itemId', label: t('common.item'), type: 'item', required: true }]} onClose={() => setChooseItem(false)} submitLabel={t('common.next')} onSave={async (values) => { setChooseItem(false); setItemId(String(values.itemId)); setCreateKey(crypto.randomUUID()); }} />}
    {item && <TransferItemForm item={item} sourceLocationId={params.get('sourceLocationId') ?? ''} idempotencyKey={createKey} onClose={() => setItemId('')} />}
    {action && <OperationForm title={`${action.transfer.transferNumber} · ${action.type}`} onClose={() => setAction(null)}
      initial={Object.fromEntries(action.transfer.lines.flatMap(line => [[`received:${line.id}`, Math.max(0, line.pickedQuantity - line.receivedQuantity - line.discrepancyQuantity)], [`discrepancy:${line.id}`, 0], [`reason:${line.id}`, '']]))} fields={[
      ...(action.type === 'receive' ? action.transfer.lines.flatMap((line): Field[] => {
        const remaining = line.pickedQuantity - line.receivedQuantity - line.discrepancyQuantity;
        if (remaining <= 0) return [];
        return [{ key: `received:${line.id}`, label: `${line.itemName} ${line.assetCode ?? ''} · ${t('enum.value.received')}`, type: 'number', min: 0, max: remaining, required: true, help: `${t('common.remaining')}: ${remaining}` }, { key: `discrepancy:${line.id}`, label: t('operations.stockOperations.discrepancyQuantity'), type: 'number', min: 0, max: remaining, required: true }, { key: `reason:${line.id}`, label: t('operations.stockOperations.discrepancyReason') }];
      }) : []), { key: 'notes', label: t('common.notes2'), multiline: true },
    ]} onSave={(values) => operationsApi.transferCommand(action.transfer.id, action.type, { idempotencyKey: action.key, notes: optionalText(values.notes), ...(action.type === 'receive' ? { lines: action.transfer.lines.map((line) => ({ transferLineId: line.id, receivedQuantity: Number(values[`received:${line.id}`] || 0), discrepancyQuantity: Number(values[`discrepancy:${line.id}`] || 0), discrepancyNotes: optionalText(values[`reason:${line.id}`]) })).filter((line) => line.receivedQuantity + line.discrepancyQuantity > 0) } : {}) })} />}
  </Stack>;
}

function TransferItemForm({ item, sourceLocationId, idempotencyKey, onClose }: { item: Item; sourceLocationId: string; idempotencyKey: string; onClose: () => void }) {
  const t = useT(); const lookup = useStockLookups();
  // Choosing a source needs every position, asset and lot of this one item.
  const positions = useCompleteList(queryKeys.operations(`positions:transfer:${item.id}`), operationsApi.positions({ itemId: item.id }), { enabled: item.trackingMode !== 'serialized' });
  const assets = useItemAssets(item.trackingMode === 'serialized' ? item.id : undefined);
  const lots = useCompleteList(queryKeys.operations(`lots:${item.id}`), operationsApi.lots({ itemId: item.id }), { enabled: item.trackingMode === 'lot_tracked' });
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
    .map(location => ({ ...location, label: `${location.label} · ${t('enum.itemStatus.available')}: ${available(location.value)}` }));
  const error = lookup.error || positions.error || assets.error || lots.error;
  const loading = lookup.loading || (item.trackingMode === 'serialized' ? !assets.isComplete : !positions.isComplete) || (item.trackingMode === 'lot_tracked' && !lots.isComplete);
  const [ready, setReady] = useState(false);
  if (!ready && !error && !loading) setReady(true);
  if (error || !ready || !sourceOptions.length) return <Dialog open fullWidth onClose={onClose}><DialogTitle>{item.name}</DialogTitle><DialogContent><QueryFeedback isLoading={!error && loading} error={error} />{!error && !loading && <Alert severity="info">{t('operations.stockOperations.noAvailableStockToTransfer')}</Alert>}</DialogContent><DialogActions><Button onClick={onClose}>{t('common.close')}</Button></DialogActions></Dialog>;
  return <OperationForm title={`${t('operations.stockOperations.transfer')}: ${item.name}`} initial={{ quantity: 1, sourceLocationId: sourceOptions.some(option => option.value === sourceLocationId) ? sourceLocationId : sourceOptions[0].value }} onClose={onClose} fields={(values): Field[] => {
    const source = String(values.sourceLocationId ?? '');
    const lotId = String(values.lotId ?? '');
    const quantity = available(source, lotId);
    return [
      { key: 'sourceLocationId', label: t('operations.stockOperations.from'), options: sourceOptions, required: true, reset: { assetInstanceId: '', lotId: '', quantity: 1 } },
      { key: 'destinationLocationId', label: t('operations.stockOperations.to'), options: lookup.locationOptions.filter(location => location.value !== source), required: true },
      ...(item.trackingMode === 'serialized' ? [{ key: 'assetInstanceId', label: t('common.asset'), required: true, options: availableAssets.filter(asset => asset.currentLocationId === source).map(asset => ({ value: asset.id, label: asset.assetCode })) }] : [{ key: 'quantity', label: t('common.quantity'), type: 'number' as const, min: 1, max: quantity, required: true, help: `${t('operations.stockOperations.availableAtLocation')}: ${quantity}` }]),
      ...(item.trackingMode === 'lot_tracked' ? [{ key: 'lotId', label: t('enum.value.lot'), required: true, reset: { quantity: 1 }, options: usableLots.filter(lot => availablePositions.some(position => position.locationId === source && position.lotId === lot.id)).map(lot => ({ value: lot.id, label: `${lot.lotNumber} · ${t('enum.itemStatus.available')}: ${available(source, lot.id)}` })) }] : []),
      { key: 'notes', label: t('common.notes2'), multiline: true },
    ];
  }} onSave={values => {
    const source = String(values.sourceLocationId); const lotId = String(values.lotId || '');
    const quantity = item.trackingMode === 'serialized' ? 1 : Number(values.quantity);
    if (source === values.destinationLocationId) return Promise.reject(new Error(t('operations.stockOperations.sourceAndDestinationMustDiffer')));
    if (quantity < 1 || quantity > available(source, lotId) || !Number.isInteger(quantity)) return Promise.reject(new Error(t('operations.stockOperations.quantityExceedsAvailableStock')));
    if (item.trackingMode === 'serialized' && !availableAssets.some(asset => asset.id === values.assetInstanceId && asset.currentLocationId === source)) return Promise.reject(new Error(t('operations.stockOperations.theAssetIsNotAvailableAtThisLocation')));
    return operationsApi.createTransfer(transferInput({ ...optionalValues(values), idempotencyKey, lines: [{ itemId: item.id, assetInstanceId: values.assetInstanceId || null, lotId: values.lotId || null, quantity }] }));
  }} />;
}

export function CountsPanel() {
  const t = useT(); const lookup = useStockLookups(); const { user } = useAuth(); const categories = useItemCategories();
  const counts = useOperationList('counts', operationsApi.counts);
  const [create, setCreate] = useState(false);
  const [action, setAction] = useState<{ count: Count; type: 'submit' | 'recount' | 'approve' | 'post' | 'cancel' } | null>(null);
  const finished = (count: Count) => ['posted', 'cancelled'].includes(count.status);
  const activeCounts = (counts.data ?? []).filter((count) => !finished(count));
  const finishedCounts = (counts.data ?? []).filter(finished);
  const countSummary = (count: Count) => {
    const counted = count.lines.filter((line) => line.countedQuantity != null).length;
    const variances = count.lines.filter((line) => line.varianceQuantity != null && line.varianceQuantity !== 0).length;
    return [t('operations.stockOperations.countedOfLineCountCounted', { counted: counted, lineCount: String(count.lines.length) }),
      variances ? t('operations.stockOperations.variancesWithVariance', { variances: variances }) : ''].filter(Boolean).join(' · ');
  };
  const countEntry = (count: Count) => <OperationListEntry key={count.id} actions={<>
        {count.status === 'counting' && <Button title={translate('operations.stockOperations.enterTheCountedQuantities')} onClick={() => setAction({ count, type: 'submit' })}>{count.lines.some(line => line.countedQuantity != null) ? t('operations.stockOperations.resumeCount') : t('operations.stockOperations.recordCount')}</Button>}
        {count.status === 'awaiting_recount' && <Button title={translate('operations.stockOperations.startARecountOfThisInventory')} onClick={() => setAction({ count, type: 'recount' })}>{t('operations.stockOperations.recount')}</Button>}
        {count.status === 'awaiting_approval' && canManageUsers(user) && <Button title={translate('operations.stockOperations.approveTheRecordedCountQuantities')} onClick={() => setAction({ count, type: 'approve' })}>{t('operations.stockOperations.approve')}</Button>}
        {count.status === 'approved' && <Button title={translate('operations.stockOperations.adjustStockUsingTheApprovedCount')} onClick={() => setAction({ count, type: 'post' })}>{t('operations.stockOperations.postAdjustment')}</Button>}
        {!['posted', 'cancelled'].includes(count.status) && <Button title={translate('operations.stockOperations.cancelThisStockCount')} onClick={() => setAction({ count, type: 'cancel' })}>{t('operations.stockOperations.cancelCount')}</Button>}
       </>} title={<>{count.sessionNumber}</>} status={count.status}>
      <Typography>{lookup.locations.find((value) => value.id === count.locationId)?.name} {count.blindCount ? t('operations.stockOperations.blindCount') : ''}</Typography>
      <CollapsibleOperationLines summary={countSummary(count)} label={t('operations.stockOperations.countLines')} headers={[t('operations.stockOperations.itemLocation'), t('operations.stockOperations.expected'), t('operations.stockOperations.counted'), t('operations.stockOperations.recount2'), t('operations.stockOperations.variance')]} rows={count.lines.map(line => ({ id: line.id, cells: [<Stack key={line.id}><Typography>{line.itemName} {line.assetCode}</Typography><Typography variant="caption" color="text.secondary">{lookup.locationOptions.find(location => location.value === line.locationId)?.label ?? '—'}</Typography></Stack>, line.expectedQuantity ?? '—', line.countedQuantity ?? '—', line.recountedQuantity ?? '—', line.varianceQuantity ?? '—'] }))} />
    </OperationListEntry>;
  return <Stack spacing={2}>
    <Button title={translate('operations.stockOperations.createANewStockCount')} variant="contained" onClick={() => setCreate(true)}>{t('operations.stockOperations.newStockCount')}</Button>
    <QueryFeedback isLoading={counts.isLoading} error={counts.error} isEmpty={!counts.data?.length} emptyMessage={t('operations.stockOperations.noStockCountsYet')} />
    {activeCounts.map(countEntry)}
    <OperationHistory title={t('operations.stockOperations.completedStockCounts')} count={finishedCounts.length}>{finishedCounts.map(countEntry)}</OperationHistory>
    <LoadMore list={counts} />
    {create && <OperationForm title={t('operations.stockOperations.newStockCount2')} initial={{ blindCount: false }} fields={[
      { key: 'locationId', label: t('operations.stockOperations.locationEmptyAll'), options: lookup.locationOptions },
      { key: 'itemId', label: t('operations.stockOperations.itemEmptyAll'), type: 'item' },
      { key: 'category', label: t('operations.stockOperations.categoryEmptyAll'), options: (categories.data ?? []).map((value) => ({ value, label: value })) },
      { key: 'blindCount', label: t('operations.stockOperations.blindCount2'), type: 'checkbox' },
    ]} onSave={(values) => operationsApi.createCount(countInput(optionalValues(values)))} onClose={() => setCreate(false)} />}
    {action && <OperationForm title={`${action.count.sessionNumber} · ${action.type}`} onClose={() => setAction(null)}
      submitLabel={['submit', 'recount'].includes(action.type) ? t('operations.stockOperations.saveProgress') : undefined}
      initial={Object.fromEntries(action.count.lines.flatMap(line => [
        [`quantity:${line.id}`, (action.type === 'recount' ? line.recountedQuantity : line.countedQuantity) ?? ''],
        [`note:${line.id}`, line.notes ?? ''],
      ]))} fields={[
      ...(['submit', 'recount'].includes(action.type) ? action.count.lines.flatMap((line): Field[] => [
        { key: `quantity:${line.id}`, label: `${line.itemName} ${line.assetCode ?? ''} · ${lookup.locationOptions.find(location => location.value === line.locationId)?.label ?? '—'}`, type: 'number', min: 0, max: line.assetCode ? 1 : undefined, help: [line.expectedQuantity != null && `${t('operations.stockOperations.expected')}: ${line.expectedQuantity}`, line.lotId && `${t('enum.value.lot')}: ${line.lotId}`].filter(Boolean).join(' · ') || undefined }, { key: `note:${line.id}`, label: t('operations.stockOperations.lineNotes') },
      ]) : []), { key: 'notes', label: t('operations.stockOperations.notesApprovalReason'), multiline: true },
    ]} onSave={(values) => {
      if (['submit', 'recount'].includes(action.type) && !action.count.lines.some(line => values[`quantity:${line.id}`] !== '' && values[`quantity:${line.id}`] !== undefined)) return Promise.reject(new Error(t('operations.stockOperations.enterAtLeastOneCountedQuantity')));
      return operationsApi.countCommand(action.count.id, action.type, { notes: optionalText(values.notes), ...(['submit', 'recount'].includes(action.type) ? { lines: action.count.lines.filter(line => values[`quantity:${line.id}`] !== '' && values[`quantity:${line.id}`] !== undefined).map((line) => ({ lineId: line.id, quantity: inputNumber(values[`quantity:${line.id}`]), notes: optionalText(values[`note:${line.id}`]) })) } : {}) });
    }} />}
  </Stack>;
}

/**
 * Lots of one item (`itemId`: the parent is fixed and never chosen) or of every lot-tracked item. A lot's item is
 * chosen once at creation; editing changes batch metadata only. `canEdit` gates mutations; viewers still see
 * each lot's stock by location.
 */
export function LotsPanel({ itemId, canEdit = true }: { itemId?: string; canEdit?: boolean } = {}) {
  const t = useT();
  const lots = useOperationList(`lots:${itemId ?? ''}`, operationsApi.lots({ itemId }));
  const fixedItem = useItemsByIds(itemId ? [itemId] : []).data?.[0];
  const [edit, setEdit] = useState<Lot | { itemId: string } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const creating = edit !== null && !('id' in edit);
  const parentName = edit === null ? '' : 'id' in edit ? edit.itemName : fixedItem?.id === edit.itemId ? fixedItem.name : '';
  return <Stack spacing={2}>
    {canEdit && <Button title={translate('operations.stockOperations.createANewInventoryLot')} variant="contained"
      onClick={() => itemId ? setEdit({ itemId }) : setChoosing(true)}>{t('operations.stockOperations.newLot')}</Button>}
    <QueryFeedback isLoading={lots.isLoading} error={lots.error} isEmpty={!lots.data?.length} emptyMessage={t('operations.stockOperations.noLotsYet')} />
    {lots.data?.map((lot) => <OperationListEntry key={lot.id} status={lot.status} actions={canEdit ? <>
        <Button title={translate('operations.stockOperations.bookStockForThisLot')} component={RouterLink} to={`/items/${lot.itemId}?transaction=1&lotId=${lot.id}`}>{t('operations.stockOperations.addStock')}</Button>
        <Button title={translate('operations.stockOperations.editLotDetailsOrHoldStatus')} onClick={() => setEdit(lot)}>{t('operations.stockOperations.editHold')}</Button>
      </> : undefined} title={<>
        {!itemId && <><Link component={RouterLink} to={`/items/${lot.itemId}`} underline="hover">{lot.itemName}</Link>{lot.itemSku ? ` (${lot.itemSku})` : ''}{!lot.itemActive && ` · ${t('operations.stockOperations.retired')}`} · </>}{lot.lotNumber}
        {lot.empty && <Typography component="span" variant="caption" color="text.secondary"> · {t('operations.stockOperations.noStock')}</Typography>}
      </>}>
      <Typography>{t('operations.stockOperations.expiry')}: {formatDate(lot.expiryDate)} · {t('operations.stockOperations.bestBefore')}: {formatDate(lot.bestBeforeDate)}{lot.supplierLot ? ` · ${t('operations.stockOperations.supplierLot')}: ${lot.supplierLot}` : ''}</Typography>
      {lot.storageRequirements || lot.notes ? <Typography>{lot.storageRequirements} {lot.notes}</Typography> : null}
      {lot.stock.length > 0 && <OperationLines label={t('operations.stockOperations.stockOfThisLot')}
        headers={[t('enum.value.location'), t('operations.stockOperations.onHand'), t('enum.itemStatus.available'), t('enum.transactionType.reserved'), t('enum.itemStatus.damaged'), t('enum.value.quarantine'), t('enum.value.in_transit')]}
        rows={lot.stock.map((row, index) => ({ id: `${lot.id}:${row.locationId ?? index}`, cells: [row.locationName ?? t('operations.stockOperations.restrictedLocation'), row.onHand, row.available, row.reserved, row.damaged, row.quarantined, row.inTransit] }))} />}
    </OperationListEntry>)}
    <LoadMore list={lots} />
    {choosing && <OperationForm title={t('operations.stockOperations.newLot')} submitLabel={t('common.next')} onClose={() => setChoosing(false)}
      fields={[{ key: 'itemId', label: t('operations.stockOperations.itemLotTracked'), type: 'item', itemFilter: (item) => item.trackingMode === 'lot_tracked', required: true }]}
      onSave={async (values) => { setChoosing(false); setEdit({ itemId: String(values.itemId) }); }} />}
    {edit && <OperationForm title={creating ? t('operations.stockOperations.newLot2') : `${t('enum.value.lot')} ${'lotNumber' in edit ? edit.lotNumber : ''}`}
      initial={creating ? { status: 'available' } : Object.fromEntries(Object.entries(edit).filter(([, value]) => typeof value === 'string'))}
      onClose={() => setEdit(null)} fields={[
      { key: 'lotNumber', label: t('operations.stockOperations.lotNumber'), required: true }, { key: 'supplierLot', label: t('operations.stockOperations.supplierLot') },
      { key: 'manufactureDate', label: t('operations.stockOperations.manufactured'), type: 'date' }, { key: 'expiryDate', label: t('operations.stockOperations.expiryDate'), type: 'date' }, { key: 'bestBeforeDate', label: t('operations.stockOperations.bestBefore2'), type: 'date' },
      { key: 'status', label: t('common.status'), required: true, options: ['available', 'hold', 'recalled', 'expired', 'depleted'].map((value) => ({ value, label: formatStatus(value) })) },
      { key: 'storageRequirements', label: t('operations.stockOperations.storageRequirements'), multiline: true }, { key: 'notes', label: t('common.notes2'), multiline: true },
    ]} onSave={(values) => 'id' in edit
      ? operationsApi.updateLot(edit.id, lotUpdateInput(optionalValues(values)))
      : operationsApi.createLot(lotCreateInput(optionalValues({ ...values, itemId: edit.itemId })))}>
      {parentName && <Alert severity="info">{t('common.item')}: {parentName}{creating ? ` · ${t('operations.stockOperations.aLotHoldsNoStockUntilItIsReceivedOr')}` : ''}</Alert>}
    </OperationForm>}
  </Stack>;
}
