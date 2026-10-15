import { formatDate, formatDateTime } from '../../utils/dateFormat';
import { Dialog } from '../shared/ClosableDialog';
import { formatCents } from '../../utils/money';
import { OperationLines } from './OperationLines';
import { OperationListEntry } from './OperationListEntry';
import { Button } from '../shared/ActionButtons';
import { lotCreateInput, receiptInput, vendorDocumentInput } from '../../services/operationsInputs';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../utils/queryKeys';
import { loadAllPages } from '../../services/apiPagination';
import type { Lot } from '../../types/operations';
import { QueryFeedback } from '../common/QueryFeedback';
import { useStockLookups } from '../../hooks/useStockLookups';
import { optionalValues } from '../../utils/operationForm';
import { useRef, useState } from 'react';
import { Alert, Box, Card, CardContent, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useEventReports } from '../../hooks/useEvents';
import { useOperationCommand, useOperationList } from '../../hooks/useOperations';
import { canOperateWarehouse } from '../../utils/access';
import { translate, useT, type Translator } from '../../utils/naming';
import { createPurchaseOrder, getPurchaseOrders, getVendors, saveVendor, transitionPurchaseOrder, updatePurchaseOrder, type ProcurementDeficit, type PurchaseOrder, type Vendor } from '../../services/procurementService';
import { operationsApi } from '../../services/operationsService';
import { LoadMore } from '../shared/LoadMore';
import { useCompleteList } from '../../hooks/usePagedList';
import { vendorOptions } from '../../services/assignmentOptions';
import { Fields, OperationForm } from './OperationForm';
import type { Field, Values } from '../../types/operationForm';
import { formatStatus } from '../../utils/formatters';

export function PurchasingPanel() {
  const t = useT(); const { user } = useAuth();
  const orders = useOperationList('purchases', getPurchaseOrders);
  const [edit, setEdit] = useState<PurchaseOrder | 'new' | null>(null);
  const [receive, setReceive] = useState<PurchaseOrder | null>(null);
  const [transition, setTransition] = useState<{ order: PurchaseOrder; status: 'ordered' | 'cancelled' } | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  return <Stack spacing={2}>
    <Button title={translate('operations.purchasingOperations.createANewPurchaseDraft')} variant="contained" onClick={() => setEdit('new')}>{t('operations.purchasingOperations.newPurchaseDraft')}</Button>
    <QueryFeedback isLoading={orders.isLoading} error={orders.error} isEmpty={!orders.data?.length} emptyMessage={t('operations.purchasingOperations.noPurchaseOrdersYet')} />
    {orders.data?.map((order) => <OperationListEntry key={order.id} actions={<>
        {order.status === 'draft' && <><Button title={translate('operations.purchasingOperations.editTheSupplierAndLinesOfThisPurchaseDraft')} onClick={() => setEdit(order)}>{t('operations.purchasingOperations.editDraft')}</Button><Button title={translate('operations.purchasingOperations.markThisPurchaseAsOrdered')} onClick={() => setTransition({ order, status: 'ordered' })}>{t('operations.purchasingOperations.markOrdered')}</Button></>}
        {['draft', 'ordered', 'partially_received'].includes(order.status) && <Button title={translate('operations.purchasingOperations.cancelTheRemainingOrderedQuantities')} onClick={() => setTransition({ order, status: 'cancelled' })}>{t('operations.purchasingOperations.cancelRemaining')}</Button>}
        {canOperateWarehouse(user) && <>
          {['ordered', 'partially_received'].includes(order.status) && <Button title={translate('operations.purchasingOperations.recordDeliveredQuantitiesAndGoodsReceipt')} onClick={() => setReceive(order)}>{t('operations.purchasingOperations.receiveDelivery')}</Button>}
          <Button title={translate('operations.purchasingOperations.showOrHideGoodsReceiptsAndTheirDocuments')} onClick={() => setHistory(history === order.id ? null : order.id)}>{t('operations.purchasingOperations.receiptsDocuments')}</Button>
        </>}
       </>} title={<>{order.orderNumber} · {order.vendorName}</>} status={order.status}><Typography>{t('operations.purchasingOperations.orderDate')}: {formatDate(order.orderDate)} · {t('operations.purchasingOperations.expected')}: {formatDate(order.expectedDeliveryDate)}</Typography>
      <Typography>{t('operations.purchasingOperations.createdBy')}: {order.createdByName}</Typography>
      <OperationLines label={t('operations.purchasingOperations.purchaseLines')} headers={[t('common.item'), t('enum.value.ordered'), t('enum.value.received'), t('common.remaining'), t('operations.purchasingOperations.unitPrice')]} rows={order.lines.map(line => ({ id: line.id, cells: [<Link key={line.id} to={`/items/${line.itemId}`}>{line.itemName}</Link>, line.orderedQuantity, line.receivedQuantity, line.remainingQuantity, formatCents(line.unitPriceCents)] }))} />
      {order.notes && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{order.notes}</Typography>}

      {history === order.id && <><ReceiptsPanel purchaseOrderId={order.id} /><DocumentsPanel order={order} /></>}
    </OperationListEntry>)}
    <LoadMore list={orders} />
    {edit && <PurchaseDraft key={edit === 'new' ? 'new' : edit.id} order={edit === 'new' ? undefined : edit} eventId="" onClose={() => setEdit(null)} />}
    {receive && <ReceiveForm order={receive} onClose={() => setReceive(null)} />}
    {transition && <OperationForm title={`${transition.order.orderNumber} · ${formatStatus(transition.status)}`} fields={[]} onClose={() => setTransition(null)} onSave={() => transitionPurchaseOrder(transition.order.id, transition.status)}><Alert severity="info">{transition.status === 'cancelled' ? t('operations.purchasingOperations.receivedStockRemainsInInventoryOnlyTheOutstandingDeliveryIs') : t('operations.purchasingOperations.theOrderWillAppearAsIncomingStockBecomesAvailableThrough')}</Alert></OperationForm>}
  </Stack>;
}

export function PurchaseDraft({ order, selected, selectedRows, eventId, onClose }: { order?: PurchaseOrder; selected?: ProcurementDeficit; selectedRows?: ProcurementDeficit[]; eventId: string; onClose: () => void }) {
  const t = useT(); const events = useEventReports(); const command = useOperationCommand();
  const [header, setHeader] = useState<Values>(() => ({ vendorId: order?.vendorId ?? '', orderNumber: order?.orderNumber ?? '', orderDate: order?.orderDate ?? new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), expectedDeliveryDate: order?.expectedDeliveryDate ?? '', eventOccurrenceId: order?.eventOccurrenceId ?? eventId, notes: order?.notes ?? '' }));
  const [lines, setLines] = useState<Values[]>(order?.lines.map((line) => ({ itemId: line.itemId, orderedQuantity: line.orderedQuantity, price: line.unitPriceCents / 100 })) ?? selectedRows?.map((row) => ({ itemId: row.itemId, orderedQuantity: Math.max(1, row.netDeficit - row.orderedStock), price: 0 })) ?? [{ itemId: selected?.itemId ?? '', orderedQuantity: selected ? Math.max(1, selected.netDeficit - selected.orderedStock) : 1, price: 0 }]);
  const [newVendor, setNewVendor] = useState(false);
  return <Dialog open fullWidth maxWidth="md" onClose={() => { if (!command.isPending) onClose(); }}><Box component="form" onSubmit={(event) => {
    event.preventDefault();
    const data = { ...optionalValues(header), vendorId: String(header.vendorId), orderDate: String(header.orderDate), lines: lines.map((line) => ({ itemId: String(line.itemId), orderedQuantity: Number(line.orderedQuantity), unitPriceCents: Math.round(Number(line.price) * 100) })) };
    command.mutate(() => order ? updatePurchaseOrder(order.id, data) : createPurchaseOrder(data), { onSuccess: onClose });
  }}><DialogTitle>{t('operations.purchasingOperations.purchaseDraft')}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
    {command.error && <Alert severity="error">{command.error.message}</Alert>}
    <Fields values={header} onChange={setHeader} fields={[
      { key: 'vendorId', label: t('common.supplier'), required: true, pagedOptions: { queryKey: ['operations', 'vendors'], getPage: vendorOptions, selectedLabel: order?.vendorName } },
      { key: 'orderNumber', label: t('operations.purchasingOperations.referenceOptional') }, { key: 'orderDate', label: t('operations.purchasingOperations.orderDate'), type: 'date', required: true },
      { key: 'expectedDeliveryDate', label: t('operations.purchasingOperations.expectedDelivery'), type: 'date' }, { key: 'eventOccurrenceId', label: t('operations.purchasingOperations.eventOptional'), options: (events.data ?? []).map((event) => ({ value: event.id, label: `${event.name || event.eventType} · ${formatDate(event.eventDate)}` })) }, { key: 'notes', label: t('common.notes2'), multiline: true },
    ]} />
    <Button title={translate('operations.purchasingOperations.createANewSupplier')} onClick={() => setNewVendor(true)}>{t('operations.purchasingOperations.newSupplier')}</Button>
    {lines.map((line, index) => <Card key={index}><CardContent><Stack spacing={1}><Fields values={line} onChange={(value) => setLines(lines.map((entry, current) => current === index ? value : entry))} fields={[
      { key: 'itemId', label: t('common.item'), type: 'item', required: true }, { key: 'orderedQuantity', label: t('common.quantity'), type: 'number', min: 1, required: true }, { key: 'price', label: t('operations.purchasingOperations.unitPrice2'), type: 'number', min: 0, step: 0.01, required: true },
    ]} /><Button title={translate('operations.purchasingOperations.removeThisLineFromThePurchaseDraft')} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, current) => current !== index))}>{t('operations.purchasingOperations.removeLine')}</Button></Stack></CardContent></Card>)}
    <Button title={translate('operations.purchasingOperations.addAnItemLineToThePurchaseDraft')} onClick={() => setLines([...lines, { itemId: '', orderedQuantity: 1, price: 0 }])}>{t('common.addItem')}</Button>
  </Stack></DialogContent><DialogActions><Button title={translate('common.discardChangesAndClose')} disabled={command.isPending} onClick={onClose}>{t('common.cancel')}</Button><Button title={translate('operations.purchasingOperations.saveThePurchaseDraft')} variant="contained" type="submit" disabled={command.isPending}>{t('operations.purchasingOperations.saveDraft')}</Button></DialogActions></Box>
    {newVendor && <VendorForm onClose={() => setNewVendor(false)} onSaved={(vendor) => setHeader({ ...header, vendorId: vendor.id })} />}
  </Dialog>;
}

/** Choice label of an existing batch: identity, dates and current stock, so a delivery is matched deliberately. */
function lotChoiceLabel(lot: Lot, t: Translator): string {
  const onHand = lot.stock.reduce((sum, row) => sum + row.onHand, 0);
  return [lot.lotNumber, lot.supplierLot && `${t('common.supplier')}: ${lot.supplierLot}`,
    lot.expiryDate && `${t('operations.purchasingOperations.expiry')}: ${formatDate(lot.expiryDate)}`, lot.bestBeforeDate && `${t('operations.purchasingOperations.bestBefore')}: ${formatDate(lot.bestBeforeDate)}`,
    `${t('common.stock')}: ${onHand}`, lot.status !== 'available' && formatStatus(lot.status)].filter(Boolean).join(' · ');
}

function ReceiveForm({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  const t = useT();
  const lines = order.lines.filter(line => line.remainingQuantity > 0);
  const itemIds = [...new Set(lines.map(line => line.itemId))];
  const lookup = useStockLookups(itemIds);
  const trackingOf = (itemId: string) => lookup.items.find(item => item.id === itemId)?.trackingMode;
  const lotItemIds = itemIds.filter(id => trackingOf(id) === 'lot_tracked');
  // Every batch of the delivered lot-tracked items; batches are matched explicitly, never by default.
  const lots = useQuery({ queryKey: queryKeys.operations(`receive-lots:${lotItemIds.join(',')}`), enabled: lookup.complete,
    queryFn: async () => (await Promise.all(lotItemIds.map(itemId => loadAllPages(operationsApi.lots({ itemId }))))).flat() });
  const [key] = useState(() => crypto.randomUUID());
  const createdLots = useRef(new Map<string, string>());
  const [receivedAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const [ready, setReady] = useState(false);
  if (!ready && !lookup.error && !lots.error && lookup.complete && lots.isSuccess) setReady(true);
  if (!ready) return <Dialog open fullWidth onClose={onClose}><DialogTitle>{t('operations.purchasingOperations.receiveDelivery2')}</DialogTitle><DialogContent><QueryFeedback isLoading={!lookup.error && !lots.error} error={lookup.error || lots.error} /></DialogContent><DialogActions><Button onClick={onClose}>{t('common.cancel')}</Button></DialogActions></Dialog>;
  const initial: Values = {
    receivingLocationId: lookup.items.find(item => item.id === lines[0]?.itemId)?.storageLocation || lookup.locationOptions[0]?.value || '',
    receiptNumber: `GR-${key.slice(0, 8).toUpperCase()}`,
    receivedAt,
    notes: '',
  };
  lines.forEach((line, index) => {
    initial[`accepted:${line.id}`] = line.remainingQuantity;
    initial[`damaged:${line.id}`] = 0;
    initial[`rejected:${line.id}`] = 0;
    initial[`notes:${line.id}`] = '';
    initial[`lot:${line.id}`] = '';
    if (trackingOf(line.itemId) === 'serialized') initial[`codes:${line.id}`] = Array.from({ length: line.remainingQuantity }, (_, unit) => `ASSET-${key.slice(0, 8).toUpperCase()}-${index + 1}-${unit + 1}`).join('\n');
  });
  return <OperationForm title={`${t('operations.purchasingOperations.receiveDelivery2')} · ${order.orderNumber}`} initial={initial} onClose={onClose} fields={values => [
    { key: 'receivingLocationId', label: t('operations.purchasingOperations.receivingLocation'), options: lookup.locationOptions, required: true },
    { key: 'receiptNumber', label: t('operations.purchasingOperations.deliveryReference') },
    { key: 'receivedAt', label: t('operations.purchasingOperations.receivedAt'), type: 'datetime-local', required: true },
    ...lines.flatMap((line): Field[] => {
      const tracking = trackingOf(line.itemId);
      const received = Number(values[`accepted:${line.id}`] || 0) + Number(values[`damaged:${line.id}`] || 0);
      const newLot = values[`lot:${line.id}`] === '__new__';
      return [
        { key: `accepted:${line.id}`, label: `${line.itemName} · ${t('operations.purchasingOperations.accepted')}`, type: 'number', min: 0, max: line.remainingQuantity, required: true, help: `${t('operations.purchasingOperations.outstanding')}: ${line.remainingQuantity}` },
        { key: `damaged:${line.id}`, label: t('enum.itemStatus.damaged'), type: 'number', min: 0, max: line.remainingQuantity, required: true },
        { key: `rejected:${line.id}`, label: t('enum.value.rejected'), type: 'number', min: 0, max: line.remainingQuantity, required: true },
        ...(tracking === 'serialized' ? [{ key: `codes:${line.id}`, label: t('operations.purchasingOperations.assetCodesAcceptedFirstDamagedLastOnePerLine'), multiline: true, required: received > 0 }] : []),
        ...(tracking === 'lot_tracked' ? [
          { key: `lot:${line.id}`, label: t('operations.purchasingOperations.batchOfThisDelivery'), required: received > 0,
            help: t('operations.purchasingOperations.recordANewBatchOrExplicitlyChooseTheExistingBatch'),
            options: [{ value: '__new__', label: t('operations.purchasingOperations.recordANewBatch') }, ...(lots.data ?? []).filter(lot => lot.itemId === line.itemId).map(lot => ({ value: lot.id, label: lotChoiceLabel(lot, t) }))] },
          ...(newLot ? [
            { key: `lotNumber:${line.id}`, label: t('operations.purchasingOperations.lotNumber'), required: received > 0 },
            { key: `supplierLot:${line.id}`, label: t('operations.purchasingOperations.supplierLot') },
            { key: `manufactureDate:${line.id}`, label: t('operations.purchasingOperations.manufactured'), type: 'date' as const },
            { key: `expiryDate:${line.id}`, label: t('operations.purchasingOperations.expiryDate'), type: 'date' as const },
            { key: `bestBeforeDate:${line.id}`, label: t('operations.purchasingOperations.bestBefore2'), type: 'date' as const },
          ] : []),
        ] : []),
        { key: `notes:${line.id}`, label: t('operations.purchasingOperations.inspectionNotesOptional') },
      ];
    }), { key: 'notes', label: t('operations.purchasingOperations.notesOptional'), multiline: true },
  ]} onSave={async values => {
    const receiptLines = lines.map(line => ({ purchaseOrderLineId: line.id, acceptedQuantity: Number(values[`accepted:${line.id}`]), damagedQuantity: Number(values[`damaged:${line.id}`]), rejectedQuantity: Number(values[`rejected:${line.id}`]), lotId: trackingOf(line.itemId) === 'lot_tracked' && values[`lot:${line.id}`] !== '__new__' ? String(values[`lot:${line.id}`] || '') || null : null, assetCodes: String(values[`codes:${line.id}`] || '').split(/\r?\n/).map(code => code.trim()).filter(Boolean), receivingNotes: values[`notes:${line.id}`] || null }));
    for (const [index, line] of receiptLines.entries()) {
      if (line.acceptedQuantity + line.damagedQuantity + line.rejectedQuantity > lines[index].remainingQuantity) return Promise.reject(new Error(t('operations.purchasingOperations.theTotalExceedsTheOutstandingOrderQuantity')));
      if (trackingOf(lines[index].itemId) === 'serialized' && line.assetCodes.length !== line.acceptedQuantity + line.damagedQuantity) return Promise.reject(new Error(t('operations.purchasingOperations.enterExactlyOneCodeForEachAcceptedOrDamagedAsset')));
      if (trackingOf(lines[index].itemId) === 'lot_tracked' && line.acceptedQuantity + line.damagedQuantity > 0 && !values[`lot:${lines[index].id}`]) return Promise.reject(new Error(t('operations.purchasingOperations.chooseANewOrAnExistingBatchForEveryDelivered')));
    }
    if (!receiptLines.some(line => line.acceptedQuantity + line.damagedQuantity + line.rejectedQuantity > 0)) return Promise.reject(new Error(t('operations.purchasingOperations.enterAtLeastOneDeliveredQuantity')));
    for (const [index, line] of receiptLines.entries()) {
      const ordered = lines[index];
      if (trackingOf(ordered.itemId) !== 'lot_tracked' || values[`lot:${ordered.id}`] !== '__new__' || line.acceptedQuantity + line.damagedQuantity === 0) continue;
      const lotNumber = String(values[`lotNumber:${ordered.id}`]).trim();
      const cacheKey = `${ordered.itemId}:${lotNumber}`;
      let lotId = createdLots.current.get(cacheKey);
      if (!lotId) {
        const lot = await operationsApi.createLot(lotCreateInput({ itemId: ordered.itemId, lotNumber, status: 'available',
          supplierLot: values[`supplierLot:${ordered.id}`] ?? '', manufactureDate: values[`manufactureDate:${ordered.id}`] ?? '',
          expiryDate: values[`expiryDate:${ordered.id}`] ?? '', bestBeforeDate: values[`bestBeforeDate:${ordered.id}`] ?? '' }));
        lotId = lot.id;
        createdLots.current.set(cacheKey, lotId);
      }
      line.lotId = lotId;
    }
    return operationsApi.receive(receiptInput({ purchaseOrderId: order.id, receivingLocationId: values.receivingLocationId, receiptNumber: values.receiptNumber, receivedAt: new Date(String(values.receivedAt)).toISOString(), notes: values.notes || null, idempotencyKey: key, lines: receiptLines.filter(line => line.acceptedQuantity + line.damagedQuantity + line.rejectedQuantity > 0) }));
  }}>
    <Typography variant="body2" color="text.secondary">{t('operations.purchasingOperations.allOutstandingQuantitiesDefaultToAcceptedAdjustQuantitiesAssetCodes')}</Typography>
  </OperationForm>;
}

export function ReceiptsPanel({ purchaseOrderId }: { purchaseOrderId?: string }) {
  const t = useT(); const receipts = useOperationList(`receipts:${purchaseOrderId ?? ''}`, operationsApi.receipts(purchaseOrderId));
  return <Stack spacing={1}><Typography variant="h6">{t('operations.purchasingOperations.receiptHistory')}</Typography><QueryFeedback isLoading={receipts.isLoading} error={receipts.error} />{receipts.data?.map((receipt) => <OperationListEntry key={receipt.id} title={<>{receipt.receiptNumber} · {formatDateTime(receipt.receivedAt)}</>} status={receipt.status}><OperationLines label={t('operations.purchasingOperations.receiptLines')} headers={[t('common.item'), t('operations.purchasingOperations.accepted'), t('enum.itemStatus.damaged'), t('enum.value.rejected')]} rows={receipt.lines.map(line => ({ id: line.id, cells: [<Stack key={line.id}><Typography>{line.itemName}</Typography>{line.receivingNotes && <Typography variant="caption" color="text.secondary">{line.receivingNotes}</Typography>}</Stack>, line.acceptedQuantity, line.damagedQuantity, line.rejectedQuantity] }))} /></OperationListEntry>)}<LoadMore list={receipts} /></Stack>;
}

export function VendorsPanel() {
  const t = useT(); const vendors = useOperationList('vendors', getVendors); const [edit, setEdit] = useState<Vendor | 'new' | null>(null);
  return <Stack spacing={2}><Button title={translate('operations.purchasingOperations.createANewSupplier')} variant="contained" onClick={() => setEdit('new')}>{t('operations.purchasingOperations.newSupplier2')}</Button>{vendors.error && <Alert severity="error">{vendors.error.message}</Alert>}{vendors.data?.map((vendor) => <OperationListEntry key={vendor.id} actions={<Button title={translate('operations.purchasingOperations.editTheSupplierDetails')} onClick={() => setEdit(vendor)}>{t('common.edit')}</Button>} title={vendor.name} status={vendor.active ? t('enum.value.active') : t('common.inactive')}><Typography>{vendor.contactPerson} · {vendor.email} · {vendor.phone}</Typography><Typography>{vendor.address}</Typography><Typography>{vendor.paymentNotes}</Typography></OperationListEntry>)}<LoadMore list={vendors} />{edit && <VendorForm vendor={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}</Stack>;
}

function VendorForm({ vendor, onClose, onSaved }: { vendor?: Vendor; onClose: () => void; onSaved?: (vendor: Vendor) => void }) {
  const t = useT();
  return <OperationForm title={t('common.supplier')} initial={vendor ? Object.fromEntries(Object.entries(vendor).filter(([, value]) => value != null)) as Values : { active: true, preferredVendor: false }} onClose={onClose} fields={[
    { key: 'name', label: t('profile.name'), required: true }, { key: 'contactPerson', label: t('operations.purchasingOperations.contactPerson') }, { key: 'email', label: 'Email' }, { key: 'phone', label: t('operations.purchasingOperations.phone') }, { key: 'address', label: t('operations.purchasingOperations.address'), multiline: true }, { key: 'website', label: 'Website' }, { key: 'paymentNotes', label: t('operations.purchasingOperations.paymentNotes'), multiline: true }, { key: 'internalNotes', label: t('operations.purchasingOperations.internalNotes'), multiline: true }, { key: 'preferredVendor', label: t('operations.purchasingOperations.preferred'), type: 'checkbox' }, { key: 'active', label: t('enum.value.active'), type: 'checkbox' },
  ]} onSave={async (values) => { const saved = await saveVendor(optionalValues(values), vendor?.id); onSaved?.(saved); return saved; }} />;
}

export function DocumentsPanel({ order }: { order: PurchaseOrder }) {
  const t = useT(); const documents = useOperationList(`documents:${order.id}`, operationsApi.documents(order.id)); const command = useOperationCommand();
  const receipts = useCompleteList(['operations', `document-receipts:${order.id}`], operationsApi.receipts(order.id));
  const [attach, setAttach] = useState(false); const [file, setFile] = useState<File | null>(null);
  return <Stack spacing={1}><Typography variant="h6">{t('operations.purchasingOperations.documents')}</Typography><Button title={translate('operations.purchasingOperations.attachADocumentToThisOrder')} onClick={() => setAttach(true)}>{t('operations.purchasingOperations.attachDocument')}</Button>{(documents.error || command.error) && <Alert severity="error">{(documents.error || command.error)?.message}</Alert>}
    {documents.data?.map((document) => <OperationListEntry key={document.id} actions={<Button title={translate('operations.purchasingOperations.downloadTheSelectedDocument')} disabled={command.isPending} onClick={() => command.mutate(() => operationsApi.downloadDocument(document))}>{t('operations.purchasingOperations.download')}</Button>} title={<>{document.originalFilename} · {document.documentType} · {document.referenceNumber}</>}><Typography>{formatDate(document.documentDate)} {document.totalAmountCents != null ? formatCents(document.totalAmountCents, document.currency || 'EUR') : ''}</Typography></OperationListEntry>)}
    <LoadMore list={documents} />
    {attach && <OperationForm title={t('operations.purchasingOperations.attachDocument')} initial={{ documentType: 'invoice', currency: 'EUR' }} onClose={() => { setAttach(false); setFile(null); }} fields={[
      { key: 'goodsReceiptId', label: t('operations.purchasingOperations.goodsReceiptOptional'), options: (receipts.data ?? []).map((receipt) => ({ value: receipt.id, label: `${receipt.receiptNumber} · ${formatDate(receipt.receivedAt)}` })) },
      { key: 'documentType', label: t('operations.purchasingOperations.documentType'), required: true, options: ['invoice', 'delivery_note', 'quote', 'warranty', 'certificate', 'other'].map((value) => ({ value, label: value })) }, { key: 'documentDate', label: t('common.date'), type: 'date' }, { key: 'referenceNumber', label: t('operations.purchasingOperations.reference') }, { key: 'amount', label: t('operations.purchasingOperations.totalAmount'), type: 'number', min: 0, step: 0.01 }, { key: 'currency', label: t('operations.purchasingOperations.currency') }, { key: 'retentionUntil', label: t('operations.purchasingOperations.retainUntil'), type: 'date' }, { key: 'notes', label: t('common.notes2'), multiline: true },
    ]} onSave={(values) => {
      if (!file) return Promise.reject(new Error(t('operations.purchasingOperations.selectAFile')));
      return operationsApi.attachDocument(file,vendorDocumentInput({ ...optionalValues(values), vendorId: order.vendorId, purchaseOrderId: order.id, totalAmountCents: values.amount === undefined || values.amount === '' ? null : Math.round(Number(values.amount) * 100) }));
    }}><TextField type="file" required slotProps={{ htmlInput: { accept: '.pdf,.png,.jpg,.jpeg,.webp' } }} onChange={(event) => setFile((event.target as HTMLInputElement).files?.[0] ?? null)} /></OperationForm>}
  </Stack>;
}
