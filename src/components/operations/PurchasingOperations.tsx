import { OperationListEntry } from './OperationListEntry';
import { Button } from '../shared/ActionButtons';
import { lotInput, receiptInput, vendorDocumentInput } from '../../services/operationsInputs';
import { QueryFeedback } from '../common/QueryFeedback';
import { useStockLookups } from '../../hooks/useStockLookups';
import { optionalValues } from '../../utils/operationForm';
import { useRef, useState } from 'react';
import { Alert, Box, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useEventReports } from '../../hooks/useEvents';
import { useOperationCommand, useOperationList } from '../../hooks/useOperations';
import { canOperateWarehouse } from '../../utils/access';
import { translate, useLocalizedText } from '../../utils/naming';
import { createPurchaseOrder, getPurchaseOrders, getVendors, saveVendor, transitionPurchaseOrder, updatePurchaseOrder, type ProcurementDeficit, type PurchaseOrder, type Vendor } from '../../services/procurementService';
import { operationsApi } from '../../services/operationsService';
import { Fields, OperationForm, type Field, type Values } from './OperationForm';

export function PurchasingPanel({ eventId = '', selected = null, onClose = () => {} }: { eventId?: string; selected?: ProcurementDeficit | null; onClose?: () => void }) {
  const t = useLocalizedText(); const { user } = useAuth();
  const orders = useOperationList('purchases', getPurchaseOrders);
  const [edit, setEdit] = useState<PurchaseOrder | 'new' | null>(null);
  const [receive, setReceive] = useState<PurchaseOrder | null>(null);
  const [transition, setTransition] = useState<{ order: PurchaseOrder; status: 'ordered' | 'cancelled' } | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  return <Stack spacing={2}>
    <Button title={translate('Einen neuen Einkaufsentwurf erstellen', 'Create a new purchase draft')} variant="contained" onClick={() => setEdit('new')}>{t('Einkaufsentwurf anlegen', 'New purchase draft')}</Button>
    <QueryFeedback isLoading={orders.isLoading} error={orders.error} isEmpty={!orders.data?.length} emptyMessage={t('Noch keine Einkaufsbestellungen.', 'No purchase orders yet.')} />
    {orders.data?.filter((order) => !eventId || order.eventOccurrenceId === eventId).map((order) => <OperationListEntry key={order.id} title={<>{order.orderNumber} · {order.vendorName} · {order.status}</>}><Typography>{order.status} · {t('Bestelldatum', 'Order date')}: {order.orderDate} · {t('Erwartet', 'Expected')}: {order.expectedDeliveryDate ?? '—'}</Typography>
      <Typography>{t('Erstellt von', 'Created by')}: {order.createdByName}</Typography>
      {order.lines.map((line) => <Box key={line.id}><Typography component={Link} to={`/items/${line.itemId}`}>{line.itemName}</Typography><Typography>{t('Bestellt', 'Ordered')}: {line.orderedQuantity} · {t('Erhalten', 'Received')}: {line.receivedQuantity} · {t('Offen', 'Remaining')}: {line.remainingQuantity} · €{(line.unitPriceCents / 100).toFixed(2)}</Typography></Box>)}
      {order.notes && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{order.notes}</Typography>}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {order.status === 'draft' && <><Button title={translate('Lieferant und Positionen des Einkaufsentwurfs bearbeiten', 'Edit the supplier and lines of this purchase draft')} onClick={() => setEdit(order)}>{t('Entwurf bearbeiten', 'Edit draft')}</Button><Button title={translate('Den Einkauf als bestellt markieren', 'Mark this purchase as ordered')} onClick={() => setTransition({ order, status: 'ordered' })}>{t('Als bestellt markieren', 'Mark ordered')}</Button></>}
        {['draft', 'ordered', 'partially_received'].includes(order.status) && <Button title={translate('Die noch offenen Bestellmengen stornieren', 'Cancel the remaining ordered quantities')} onClick={() => setTransition({ order, status: 'cancelled' })}>{t('Rest stornieren', 'Cancel remaining')}</Button>}
        {canOperateWarehouse(user) && <>
          {['ordered', 'partially_received'].includes(order.status) && <Button title={translate('Gelieferte Mengen und Wareneingang erfassen', 'Record delivered quantities and goods receipt')} onClick={() => setReceive(order)}>{t('Lieferung annehmen', 'Receive delivery')}</Button>}
          <Button title={translate('Wareneingänge und zugehörige Belege ein- oder ausblenden', 'Show or hide goods receipts and their documents')} onClick={() => setHistory(history === order.id ? null : order.id)}>{t('Wareneingänge / Belege', 'Receipts / documents')}</Button>
        </>}
      </Stack>
      {history === order.id && <><ReceiptsPanel purchaseOrderId={order.id} /><DocumentsPanel order={order} /></>}
    </OperationListEntry>)}
    {(edit || selected) && <PurchaseDraft key={selected?.itemId ?? (edit === 'new' ? 'new' : edit?.id)} order={edit && edit !== 'new' ? edit : undefined} selected={selected ?? undefined} eventId={eventId} onClose={() => { setEdit(null); onClose(); }} />}
    {receive && <ReceiveForm order={receive} onClose={() => setReceive(null)} />}
    {transition && <OperationForm title={`${transition.order.orderNumber} · ${transition.status}`} fields={[]} onClose={() => setTransition(null)} onSave={() => transitionPurchaseOrder(transition.order.id, transition.status)}><Alert severity="info">{transition.status === 'cancelled' ? t('Bereits angenommene Ware bleibt im Bestand. Nur die offene Lieferung wird storniert.', 'Received stock remains in inventory. Only the outstanding delivery is cancelled.') : t('Die Bestellung wird als unterwegs angezeigt. Verfügbarer Bestand entsteht erst beim Wareneingang.', 'The order will appear as incoming. Stock becomes available through receiving.')}</Alert></OperationForm>}
  </Stack>;
}

export function PurchaseDraft({ order, selected, selectedRows, eventId, onClose }: { order?: PurchaseOrder; selected?: ProcurementDeficit; selectedRows?: ProcurementDeficit[]; eventId: string; onClose: () => void }) {
  const t = useLocalizedText(); const lookup = useStockLookups(); const vendors = useOperationList('vendors', getVendors); const events = useEventReports(); const command = useOperationCommand();
  const [header, setHeader] = useState<Values>(() => ({ vendorId: order?.vendorId ?? '', orderNumber: order?.orderNumber ?? '', orderDate: order?.orderDate ?? new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), expectedDeliveryDate: order?.expectedDeliveryDate ?? '', eventOccurrenceId: order?.eventOccurrenceId ?? eventId, notes: order?.notes ?? '' }));
  const [lines, setLines] = useState<Values[]>(order?.lines.map((line) => ({ itemId: line.itemId, orderedQuantity: line.orderedQuantity, price: line.unitPriceCents / 100 })) ?? selectedRows?.map((row) => ({ itemId: row.itemId, orderedQuantity: Math.max(1, row.netDeficit - row.orderedStock), price: 0 })) ?? [{ itemId: selected?.itemId ?? '', orderedQuantity: selected ? Math.max(1, selected.netDeficit - selected.orderedStock) : 1, price: 0 }]);
  const [newVendor, setNewVendor] = useState(false);
  return <Dialog open fullWidth maxWidth="md" onClose={() => { if (!command.isPending) onClose(); }}><Box component="form" onSubmit={(event) => {
    event.preventDefault();
    const data = { ...optionalValues(header), vendorId: String(header.vendorId), orderDate: String(header.orderDate), lines: lines.map((line) => ({ itemId: String(line.itemId), orderedQuantity: Number(line.orderedQuantity), unitPriceCents: Math.round(Number(line.price) * 100) })) };
    command.mutate(() => order ? updatePurchaseOrder(order.id, data) : createPurchaseOrder(data), { onSuccess: onClose });
  }}><DialogTitle>{t('Einkaufsentwurf', 'Purchase draft')}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
    {command.error && <Alert severity="error">{command.error.message}</Alert>}
    <Fields values={header} onChange={setHeader} fields={[
      { key: 'vendorId', label: t('Lieferant', 'Supplier'), required: true, options: (vendors.data ?? []).filter((vendor) => vendor.active).map((vendor) => ({ value: vendor.id, label: vendor.name })) },
      { key: 'orderNumber', label: t('Referenz (optional)', 'Reference (optional)') }, { key: 'orderDate', label: t('Bestelldatum', 'Order date'), type: 'date', required: true },
      { key: 'expectedDeliveryDate', label: t('Erwartete Lieferung', 'Expected delivery'), type: 'date' }, { key: 'eventOccurrenceId', label: t('Event (optional)', 'Event (optional)'), options: (events.data ?? []).map((event) => ({ value: event.id, label: `${event.name || event.eventType} · ${event.eventDate}` })) }, { key: 'notes', label: t('Notiz', 'Notes'), multiline: true },
    ]} />
    <Button title={translate('Einen neuen Lieferanten anlegen', 'Create a new supplier')} onClick={() => setNewVendor(true)}>{t('Neuer Lieferant', 'New supplier')}</Button>
    {lines.map((line, index) => <Card key={index}><CardContent><Stack spacing={1}><Fields values={line} onChange={(value) => setLines(lines.map((entry, current) => current === index ? value : entry))} fields={[
      { key: 'itemId', label: t('Artikel', 'Item'), options: lookup.itemOptions, required: true }, { key: 'orderedQuantity', label: t('Menge', 'Quantity'), type: 'number', min: 1, required: true }, { key: 'price', label: t('Einzelpreis (€)', 'Unit price (€)'), type: 'number', min: 0, step: 0.01, required: true },
    ]} /><Button title={translate('Diese Position aus dem Einkaufsentwurf entfernen', 'Remove this line from the purchase draft')} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, current) => current !== index))}>{t('Zeile entfernen', 'Remove line')}</Button></Stack></CardContent></Card>)}
    <Button title={translate('Eine Artikelposition zum Einkaufsentwurf hinzufügen', 'Add an item line to the purchase draft')} onClick={() => setLines([...lines, { itemId: '', orderedQuantity: 1, price: 0 }])}>{t('Artikel hinzufügen', 'Add item')}</Button>
  </Stack></DialogContent><DialogActions><Button title={translate('Änderungen verwerfen und schließen', 'Discard changes and close')} disabled={command.isPending} onClick={onClose}>{t('Abbrechen', 'Cancel')}</Button><Button title={translate('Den Einkaufsentwurf speichern', 'Save the purchase draft')} variant="contained" type="submit" disabled={command.isPending}>{t('Entwurf speichern', 'Save draft')}</Button></DialogActions></Box>
    {newVendor && <VendorForm onClose={() => setNewVendor(false)} onSaved={(vendor) => setHeader({ ...header, vendorId: vendor.id })} />}
  </Dialog>;
}

function ReceiveForm({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  const t = useLocalizedText(); const lookup = useStockLookups();
  const lots = useOperationList('lots', operationsApi.lots());
  const [key] = useState(() => crypto.randomUUID());
  const createdLots = useRef(new Map<string, string>());
  const [receivedAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const [ready, setReady] = useState(false);
  if (!ready && !lookup.error && !lots.error && lookup.complete && lots.isComplete) setReady(true);
  if (!ready && (lookup.error || lots.error || !lookup.complete || !lots.isComplete)) return <Dialog open fullWidth onClose={onClose}><DialogTitle>{t('Wareneingang', 'Receive delivery')}</DialogTitle><DialogContent><QueryFeedback isLoading={!lookup.error && !lots.error} error={lookup.error || lots.error} /></DialogContent><DialogActions><Button onClick={onClose}>{t('Abbrechen', 'Cancel')}</Button></DialogActions></Dialog>;
  const lines = order.lines.filter(line => line.remainingQuantity > 0);
  const initial: Values = {
    receivingLocationId: lookup.items.find(item => item.id === lines[0]?.itemId)?.storageLocation || lookup.locationOptions[0]?.value || '',
    receiptNumber: `GR-${key.slice(0, 8).toUpperCase()}`,
    receivedAt,
    notes: '',
  };
  lines.forEach((line, index) => {
    const item = lookup.items.find(item => item.id === line.itemId);
    initial[`accepted:${line.id}`] = line.remainingQuantity;
    initial[`damaged:${line.id}`] = 0;
    initial[`rejected:${line.id}`] = 0;
    initial[`notes:${line.id}`] = '';
    initial[`lot:${line.id}`] = lots.data?.find(lot => lot.itemId === line.itemId && lot.status === 'available')?.id ?? '__new__';
    initial[`lotNumber:${line.id}`] = `LOT-${key.slice(0, 8).toUpperCase()}-${index + 1}`;
    if (item?.trackingMode === 'serialized') initial[`codes:${line.id}`] = Array.from({ length: line.remainingQuantity }, (_, unit) => `ASSET-${key.slice(0, 8).toUpperCase()}-${index + 1}-${unit + 1}`).join('\n');
  });
  return <OperationForm title={`${t('Wareneingang', 'Receive delivery')} · ${order.orderNumber}`} initial={initial} onClose={onClose} fields={values => [
    { key: 'receivingLocationId', label: t('Empfangsort', 'Receiving location'), options: lookup.locationOptions, required: true },
    { key: 'receiptNumber', label: t('Lieferscheinreferenz', 'Delivery reference') },
    { key: 'receivedAt', label: t('Empfangen am', 'Received at'), type: 'datetime-local', required: true },
    ...lines.flatMap((line): Field[] => {
      const item = lookup.items.find(value => value.id === line.itemId);
      const received = Number(values[`accepted:${line.id}`] || 0) + Number(values[`damaged:${line.id}`] || 0);
      return [
        { key: `accepted:${line.id}`, label: `${line.itemName} · ${t('Angenommen', 'Accepted')}`, type: 'number', min: 0, max: line.remainingQuantity, required: true, help: `${t('Noch offen', 'Outstanding')}: ${line.remainingQuantity}` },
        { key: `damaged:${line.id}`, label: t('Beschädigt', 'Damaged'), type: 'number', min: 0, max: line.remainingQuantity, required: true },
        { key: `rejected:${line.id}`, label: t('Abgelehnt', 'Rejected'), type: 'number', min: 0, max: line.remainingQuantity, required: true },
        ...(item?.trackingMode === 'serialized' ? [{ key: `codes:${line.id}`, label: t('Gerätecodes: zuerst intakte, dann beschädigte (einer pro Zeile)', 'Asset codes: accepted first, damaged last (one per line)'), multiline: true, required: received > 0 }] : []),
        ...(item?.trackingMode === 'lot_tracked' ? [
          { key: `lot:${line.id}`, label: t('Charge', 'Lot'), options: [{ value: '__new__', label: t('Neue Charge', 'New lot') }, ...(lots.data ?? []).filter(lot => lot.itemId === line.itemId && lot.status === 'available').map(lot => ({ value: lot.id, label: lot.lotNumber }))], required: received > 0 },
          ...(values[`lot:${line.id}`] === '__new__' ? [{ key: `lotNumber:${line.id}`, label: t('Chargennummer', 'Lot number'), required: received > 0 }] : []),
        ] : []),
        { key: `notes:${line.id}`, label: t('Prüfnotiz (optional)', 'Inspection notes (optional)') },
      ];
    }), { key: 'notes', label: t('Notiz (optional)', 'Notes (optional)'), multiline: true },
  ]} onSave={async values => {
    const receiptLines = lines.map(line => ({ purchaseOrderLineId: line.id, acceptedQuantity: Number(values[`accepted:${line.id}`]), damagedQuantity: Number(values[`damaged:${line.id}`]), rejectedQuantity: Number(values[`rejected:${line.id}`]), lotId: lookup.items.find(item => item.id === line.itemId)?.trackingMode === 'lot_tracked' && values[`lot:${line.id}`] !== '__new__' ? String(values[`lot:${line.id}`] || '') || null : null, assetCodes: String(values[`codes:${line.id}`] || '').split(/\r?\n/).map(code => code.trim()).filter(Boolean), receivingNotes: values[`notes:${line.id}`] || null }));
    for (const [index, line] of receiptLines.entries()) {
      if (line.acceptedQuantity + line.damagedQuantity + line.rejectedQuantity > lines[index].remainingQuantity) return Promise.reject(new Error(t('Die Summe überschreitet die offene Bestellmenge.', 'The total exceeds the outstanding order quantity.')));
      if (lookup.items.find(item => item.id === lines[index].itemId)?.trackingMode === 'serialized' && line.assetCodes.length !== line.acceptedQuantity + line.damagedQuantity) return Promise.reject(new Error(t('Für jedes angenommene oder beschädigte Gerät genau einen Code eingeben.', 'Enter exactly one code for each accepted or damaged asset.')));
    }
    if (!receiptLines.some(line => line.acceptedQuantity + line.damagedQuantity + line.rejectedQuantity > 0)) return Promise.reject(new Error(t('Mindestens eine Liefermenge eingeben.', 'Enter at least one delivered quantity.')));
    for (const [index, line] of receiptLines.entries()) {
      const ordered = lines[index];
      if (lookup.items.find(item => item.id === ordered.itemId)?.trackingMode !== 'lot_tracked' || values[`lot:${ordered.id}`] !== '__new__' || line.acceptedQuantity + line.damagedQuantity === 0) continue;
      const lotNumber = String(values[`lotNumber:${ordered.id}`]).trim();
      const cacheKey = `${ordered.itemId}:${lotNumber}`;
      let lotId = createdLots.current.get(cacheKey);
      if (!lotId) {
        const lot = await operationsApi.saveLot(lotInput({ itemId: ordered.itemId, lotNumber, status: 'available' }));
        lotId = lot.id;
        createdLots.current.set(cacheKey, lotId);
      }
      line.lotId = lotId;
    }
    return operationsApi.receive(receiptInput({ purchaseOrderId: order.id, receivingLocationId: values.receivingLocationId, receiptNumber: values.receiptNumber, receivedAt: new Date(String(values.receivedAt)).toISOString(), notes: values.notes || null, idempotencyKey: key, lines: receiptLines.filter(line => line.acceptedQuantity + line.damagedQuantity + line.rejectedQuantity > 0) }));
  }}>
    <Typography variant="body2" color="text.secondary">{t('Alle offenen Mengen sind als intakt vorbelegt. Mengen, Codes und Empfangsort bei Abweichungen anpassen.', 'All outstanding quantities default to accepted. Adjust quantities, asset codes and receiving location as needed.')}</Typography>
    {lines.some(line => lookup.items.find(item => item.id === line.itemId)?.trackingMode === 'lot_tracked') && <Typography variant="caption">{t('Neue Chargen werden beim Speichern mit der vorbelegten Chargennummer angelegt.', 'New lots are created on save using the prefilled lot number.')}</Typography>}
  </OperationForm>;
}

export function ReceiptsPanel({ purchaseOrderId }: { purchaseOrderId?: string }) {
  const t = useLocalizedText(); const receipts = useOperationList(`receipts:${purchaseOrderId ?? ''}`, operationsApi.receipts(purchaseOrderId));
  return <Stack spacing={1}><Typography variant="h6">{t('Wareneingänge', 'Receipt history')}</Typography><QueryFeedback isLoading={receipts.isLoading} error={receipts.error} />{receipts.data?.map((receipt) => <OperationListEntry key={receipt.id} title={<>{receipt.receiptNumber} · {new Date(receipt.receivedAt).toLocaleString()} · {receipt.status}</>}>{receipt.lines.map((line) => <Typography key={line.id}>{line.itemName} · {t('Angenommen / beschädigt / abgelehnt', 'Accepted / damaged / rejected')}: {line.acceptedQuantity} / {line.damagedQuantity} / {line.rejectedQuantity} {line.receivingNotes}</Typography>)}</OperationListEntry>)}</Stack>;
}

export function VendorsPanel() {
  const t = useLocalizedText(); const vendors = useOperationList('vendors', getVendors); const [edit, setEdit] = useState<Vendor | 'new' | null>(null);
  return <Stack spacing={2}><Button title={translate('Einen neuen Lieferanten anlegen', 'Create a new supplier')} variant="contained" onClick={() => setEdit('new')}>{t('Lieferant anlegen', 'New supplier')}</Button>{vendors.error && <Alert severity="error">{vendors.error.message}</Alert>}{vendors.data?.map((vendor) => <OperationListEntry key={vendor.id} title={<>{vendor.name} {!vendor.active && t('(inaktiv)', '(inactive)')}</>}><Typography>{vendor.contactPerson} · {vendor.email} · {vendor.phone}</Typography><Typography>{vendor.address}</Typography><Typography>{vendor.paymentNotes}</Typography><Button title={translate('Die Lieferantendaten bearbeiten', 'Edit the supplier details')} onClick={() => setEdit(vendor)}>{t('Bearbeiten', 'Edit')}</Button></OperationListEntry>)}{edit && <VendorForm vendor={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}</Stack>;
}

function VendorForm({ vendor, onClose, onSaved }: { vendor?: Vendor; onClose: () => void; onSaved?: (vendor: Vendor) => void }) {
  const t = useLocalizedText();
  return <OperationForm title={t('Lieferant', 'Supplier')} initial={vendor ? Object.fromEntries(Object.entries(vendor).filter(([, value]) => value != null)) as Values : { active: true, preferredVendor: false }} onClose={onClose} fields={[
    { key: 'name', label: t('Name', 'Name'), required: true }, { key: 'contactPerson', label: t('Kontaktperson', 'Contact person') }, { key: 'email', label: 'Email' }, { key: 'phone', label: t('Telefon', 'Phone') }, { key: 'address', label: t('Adresse', 'Address'), multiline: true }, { key: 'website', label: 'Website' }, { key: 'paymentNotes', label: t('Zahlungsbedingungen', 'Payment notes'), multiline: true }, { key: 'internalNotes', label: t('Interne Notizen', 'Internal notes'), multiline: true }, { key: 'preferredVendor', label: t('Bevorzugt', 'Preferred'), type: 'checkbox' }, { key: 'active', label: t('Aktiv', 'Active'), type: 'checkbox' },
  ]} onSave={async (values) => { const saved = await saveVendor(optionalValues(values), vendor?.id); onSaved?.(saved); return saved; }} />;
}

export function DocumentsPanel({ order }: { order: PurchaseOrder }) {
  const t = useLocalizedText(); const documents = useOperationList(`documents:${order.id}`, operationsApi.documents(order.id)); const command = useOperationCommand();
  const receipts = useOperationList(`document-receipts:${order.id}`, operationsApi.receipts(order.id));
  const [attach, setAttach] = useState(false); const [file, setFile] = useState<File | null>(null);
  return <Stack spacing={1}><Typography variant="h6">{t('Belege', 'Documents')}</Typography><Button title={translate('Einen Beleg zu dieser Bestellung hinzufügen', 'Attach a document to this order')} onClick={() => setAttach(true)}>{t('Beleg anhängen', 'Attach document')}</Button>{(documents.error || command.error) && <Alert severity="error">{(documents.error || command.error)?.message}</Alert>}
    {documents.data?.map((document) => <OperationListEntry key={document.id} title={<>{document.originalFilename} · {document.documentType} · {document.referenceNumber}</>}><Typography>{document.documentDate} {document.totalAmountCents != null ? `${document.totalAmountCents / 100} ${document.currency}` : ''}</Typography><Button title={translate('Den ausgewählten Beleg herunterladen', 'Download the selected document')} disabled={command.isPending} onClick={() => command.mutate(() => operationsApi.downloadDocument(document))}>{t('Herunterladen', 'Download')}</Button></OperationListEntry>)}
    {attach && <OperationForm title={t('Beleg anhängen', 'Attach document')} initial={{ documentType: 'invoice', currency: 'EUR' }} onClose={() => { setAttach(false); setFile(null); }} fields={[
      { key: 'goodsReceiptId', label: t('Wareneingang (optional)', 'Goods receipt (optional)'), options: (receipts.data ?? []).map((receipt) => ({ value: receipt.id, label: `${receipt.receiptNumber} · ${new Date(receipt.receivedAt).toLocaleDateString()}` })) },
      { key: 'documentType', label: t('Belegart', 'Document type'), required: true, options: ['invoice', 'delivery_note', 'quote', 'warranty', 'certificate', 'other'].map((value) => ({ value, label: value })) }, { key: 'documentDate', label: t('Datum', 'Date'), type: 'date' }, { key: 'referenceNumber', label: t('Referenz', 'Reference') }, { key: 'amount', label: t('Gesamtbetrag', 'Total amount'), type: 'number', min: 0, step: 0.01 }, { key: 'currency', label: t('Währung', 'Currency') }, { key: 'retentionUntil', label: t('Aufbewahren bis', 'Retain until'), type: 'date' }, { key: 'notes', label: t('Notiz', 'Notes'), multiline: true },
    ]} onSave={(values) => {
      if (!file) return Promise.reject(new Error(t('Datei auswählen.', 'Select a file.')));
      return operationsApi.attachDocument(file,vendorDocumentInput({ ...optionalValues(values), vendorId: order.vendorId, purchaseOrderId: order.id, totalAmountCents: values.amount === undefined || values.amount === '' ? null : Math.round(Number(values.amount) * 100) }));
    }}><TextField type="file" required slotProps={{ htmlInput: { accept: '.pdf,.png,.jpg,.jpeg,.webp' } }} onChange={(event) => setFile((event.target as HTMLInputElement).files?.[0] ?? null)} /></OperationForm>}
  </Stack>;
}

