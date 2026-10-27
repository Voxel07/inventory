/* Local fixture preview: exercises the actual components without touching live inventory. */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Box, CssBaseline, Stack, ThemeProvider, Typography, createTheme } from '@mui/material';
import { Operations } from '../src/pages/Operations';
import { ItemDetail } from '../src/pages/ItemDetail';
import { Items } from '../src/pages/Items';
import { Assemblies } from '../src/pages/Assemblies';
import { AssemblyDetail } from '../src/pages/AssemblyDetail';
import { StorageLocations } from '../src/pages/StorageLocations';
import { ActionInboxContent } from '../src/components/dialogs/ActionInboxContent';
import { ReturnedItemsPage } from '../src/pages/ReturnedItems';
import { DamageReportsPage } from '../src/pages/DamageReports';
import { UserDashboard } from '../src/pages/UserDashboard';
import { ActionInboxDialogProvider } from '../src/components/dialogs/ActionInboxDialogProvider';
import { useActionInboxDialog } from '../src/hooks/useActionInboxDialog';
import { Button } from '../src/components/shared/ActionButtons';
import { Navigation } from '../src/components/shared/Navigation';
import { setDevelopmentSession } from '../src/services/authManager';
import { setAppLanguage } from '../src/utils/naming';
import { invalidateForApiChange } from '../src/utils/realtimeInvalidation';
import type { ApiChangeDetail } from '../src/services/apiChanges';
import type { AssetInstance, DamageReport, Item, ReturnSubmission, StockTransaction } from '../src/types';
import type { InventoryAccess } from '../src/types/inventoryAccess';
import type { Count, Lot, Position, Receipt, Repair, Schedule, Transfer } from '../src/types/operations';
import type { CheckedOutRow } from '../src/types/custody';
import type { InboxAction } from '../src/types/actionInbox';
import type { Loan } from '../src/types/loan';
import type { EquipmentProfile } from '../src/types/equipment';
import type { OperationalReport } from '../src/types/report';
import type { PurchaseOrder, Vendor } from '../src/services/procurementService';
import { FIXTURE_TIME as now, fixtureAssembly, fixtureItem, fixtureLocation, fixtureStock, fixtureUser } from './fixtures/dto';
import { byIds, installFixtureApi } from './fixtures/api';

const query = new URLSearchParams(location.search);
const locations = [
  fixtureLocation({ id: 'location-a', name: 'Shelf A', code: 'A', fullCode: 'WH-A', hierarchyPath: 'Warehouse / Shelf A' }),
  fixtureLocation({ id: 'location-b', name: 'Shelf B', code: 'B', fullCode: 'WH-B', hierarchyPath: 'Warehouse / Shelf B' }),
  fixtureLocation({ id: 'location-empty', name: 'Empty shelf' }),
];
const items: Item[] = [7, 3].map((quantity, index) => fixtureItem({
  id: `item-${index + 1}`, name: ['Radio', 'Cable'][index], sku: `SKU-${index + 1}`, value: 10, storageLocation: locations[index].id,
  eventTypes: ['DE'], stock: fixtureStock(quantity, { ordered: 5 }), expand: { storageLocation: locations[index] },
}));
items[0].hint = 'Charge radios before use. Return them to the labelled storage shelves.';
const assemblies = [fixtureAssembly({ id: 'assembly-1', name: 'Radio kit', description: 'Two radios and a cable', hint: 'Connect before use',
  itemQuantities: { 'item-1': 2, 'item-2': 1 }, eventTypes: ['DE'] })];
const transaction = (id: string, transactionType: StockTransaction['transactionType'], quantityChanged: number, reason: string, timestamp: number): StockTransaction => ({
  id, itemId: 'item-1', itemName: 'Radio', transactionType, quantityChanged, userId: 'preview', reason, notes: '', timestamp, created: now, updated: now,
});
const transactions = [transaction('tx-initial', 'added', 2, 'Initial stock', 1790848800000), transaction('tx-receipt', 'received', 5, 'Goods receipt', now)];
const counts: Count[] = [{ id: 'count-1', sessionNumber: 'COUNT-PREVIEW', status: 'counting', blindCount: false,
  lines: items.map((item, index) => ({ id: `count-line-${index + 1}`, itemId: item.id, itemName: item.name, locationId: locations[index].id, expectedQuantity: item.stock?.onHand })) }];
const purchases: PurchaseOrder[] = [{ id: 'purchase-1', orderNumber: 'PO-PREVIEW', vendorName: 'Preview supplier', vendorId: 'vendor-1', orderDate: 1790812800000, status: 'ordered',
  createdById: 'preview', createdByName: 'Preview user', lines: [{ id: 'purchase-line-1', itemId: 'item-1', itemName: 'Radio', orderedQuantity: 5, receivedQuantity: 0, remainingQuantity: 5, unitPriceCents: 1000 }] }];
const position = (id: string, item: Item, locationId: string, quantity: number): Position => ({ id, itemId: item.id, itemName: item.name, locationId, quantityOnHand: quantity,
  quantityReserved: 0, quantityDamaged: 0, quantityQuarantined: 0, quantityInTransit: 0, availableQuantity: quantity, transferableQuantity: quantity });
const positions = [position('position-0', items[0], 'location-a', 5), position('position-1', items[1], 'location-b', 3), position('position-radio-b', items[0], 'location-b', 2)];
const inbox: InboxAction[] = [{ key: 'receipt:preview', kind: 'receipt', title: 'Receive radios', detail: 'Five radios from Preview supplier', path: '/operations?tab=purchases', due: 1790899200000 },
  { key: 'count:preview', kind: 'maintenance', title: 'Check radio kit', detail: 'Shelf A · Radio kit', path: '/assemblies/assembly-1' }];
const transfers: Transfer[] = [{ id: 'transfer-demo', transferNumber: 'TR-002', status: 'in_transit', sourceLocationId: 'location-a', destinationLocationId: 'location-b',
  lines: [{ id: 'transfer-line', itemId: 'item-1', itemName: 'Radio', requestedQuantity: 4, pickedQuantity: 4, receivedQuantity: 0, discrepancyQuantity: 0 }] }];
const privateAccess: InventoryAccess = { privateResource: true, ownerId: 'preview', ownerName: 'Preview user', revision: 0, canEdit: true, canManage: true, grants: [],
  audience: [{ kind: 'owner', principalId: 'preview', name: 'Preview user', canEdit: true }],
  sources: [{ kind: 'owner', principalId: 'preview', name: 'Preview user', canEdit: true }] };
items.push({ ...items[0], id: 'private-1', name: 'My private light', access: privateAccess, eventTypes: ['TNO'] });
items.push({ ...items[1], id: 'rental-1', name: 'My checked-out rental', eventTypes: ['LS'] });
const custody: CheckedOutRow[] = [{ key: 'rental:preview', itemId: 'rental-1', personId: 'preview', person: 'Preview user', name: 'My checked-out rental', checkedOut: 1,
  category: 'Equipment', event: 'LightSim', storageLocation: 'Shelf A', eventKey: 'LS', pendingQuantity: 0 }];
const returns: ReturnSubmission[] = [{ id: 'return-1', itemId: 'item-1', itemName: 'Radio', quantity: 1, returnedForUserName: 'Preview user', returnedForUserId: 'preview',
  submittedById: 'preview', submittedByName: 'Preview user', expectedReturnLocationName: 'Shelf A', status: 'pending', created: now, updated: now, reportedDamage: [], tracksRuntime: false,
  notes: 'Left on the labelled return shelf; warehouse acknowledgement outstanding.' }];
const asset = (id: string, itemId: string, availabilityStatus: AssetInstance['availabilityStatus'], extra: Partial<AssetInstance> = {}): AssetInstance => ({
  id, itemId, assetCode: id.toUpperCase(), availabilityStatus, conditionStatus: 'good', serviceStatus: 'certified', active: true, version: 0,
  currentLocationId: 'location-a', createdAt: now, updatedAt: now, ...extra,
});
const assets: AssetInstance[] = [];
if (query.has('storagePreview')) {
  items[1].category = 'Cabling';
  items[1].eventTypes = ['TNO'];
  items.push({ ...items[0], id: 'camera', name: 'Camera', trackingMode: 'serialized', category: 'Optics', eventTypes: ['TNO'], stock: fixtureStock(10, { available: 9 }) });
  items.push({ ...items[0], id: 'offsite', name: 'Checked-out device', trackingMode: 'serialized' });
  items.push({ ...items[0], id: 'inactive', name: 'Inactive device', trackingMode: 'serialized' });
  assets.push(asset('camera-a', 'camera', 'available'), asset('camera-reserved', 'camera', 'reserved'),
    asset('camera-b', 'camera', 'available', { currentLocationId: 'location-b' }), asset('offsite-a', 'offsite', 'in_custody'),
    asset('inactive-a', 'inactive', 'available', { active: false }));
}
const lots: Lot[] = [{ id: 'lot-1', itemId: 'item-1', itemName: 'Radio', itemActive: true, lotNumber: 'LOT-PREVIEW', status: 'available', expiryDate: 1798761600000,
  bestBeforeDate: 1798675200000, storageRequirements: 'Dry storage', notes: 'Fixture lot', empty: false,
  stock: [{ locationId: 'location-a', locationName: 'Shelf A', onHand: 5, available: 5, reserved: 0, damaged: 0, quarantined: 0, inTransit: 0 }] }];
const schedules: Schedule[] = [{ id: 'schedule-1', itemId: 'item-1', itemName: 'Radio', maintenanceType: 'battery_test', intervalType: 'date', intervalValue: 30,
  nextDueAt: 1792022400000, active: true, checkoutBlocking: true }];
const damage: DamageReport[] = [{ id: 'damage-1', itemId: 'item-1', itemName: 'Radio', amount: 1, reportedBy: 'preview', description: 'Battery connector damaged',
  severity: 'medium', status: 'reported', timestamp: now, created: now, updated: now }];
if (query.has('damagePreview')) {
  const base = damage[0];
  damage.splice(0, damage.length, ...Array.from({ length: 21 }, (_, index): DamageReport => ({
    ...base, id: `damage-${index + 1}`, itemName: `Radio ${String(index + 1).padStart(2, '0')}`, amount: index === 0 ? 3 : 1,
    repairedAmount: 0, writtenOffAmount: 0, description: `Connector damage on radio ${index + 1}`,
    expand: { reportedBy: { id: 'preview', name: 'Preview user' } },
  })), ...(['repaired', 'verified', 'returned_to_service', 'written_off', 'resolved'] as const).map((status, index): DamageReport => ({
    ...base, id: `closed-${index}`, itemName: `Completed ${status}`, status, repairedAmount: status === 'written_off' ? 0 : 1,
    writtenOffAmount: status === 'written_off' ? 1 : 0, handledBy: 'preview', resolutionNotes: 'Connector replaced and checked',
    expand: { reportedBy: { id: 'preview', name: 'Preview user' }, handledBy: { id: 'preview', name: 'Preview user' } },
  })));
}
const repairs: Repair[] = [{ id: 'repair-1', damageReportId: 'damage-1', itemId: 'item-1', itemName: 'Radio', damageDescription: 'Battery connector damaged',
  status: 'awaiting_repair', safetyImpact: true, partsAndCostNotes: 'Replacement connector', notes: 'Awaiting workshop' }];
const loans: Loan[] = [{ id: 'loan-1', itemId: 'rental-1', item: 'My checked-out rental', commitmentId: 'commitment-1', providerLocationId: 'location-b', provider: 'Preview supplier',
  contact: 'preview@example.test', kind: 'rental', quantity: 4, collected: 4, returned: 1, collectionDate: 1790812800000, availableUntil: 1791590400000, returnDue: 1791763200000,
  status: 'collected', terms: 'Return to supplier', assetCodes: [], history: [], revision: 0 }];
const receipts: Receipt[] = [{ id: 'receipt-1', receiptNumber: 'GR-PREVIEW', purchaseOrderId: 'purchase-1', receivingLocationId: 'location-a', status: 'accepted', receivedAt: now,
  lines: [{ id: 'receipt-line', itemId: items[0].id, itemName: 'Radio', acceptedQuantity: 5, damagedQuantity: 0, rejectedQuantity: 0 }] }];
const vendors: Vendor[] = [{ id: 'vendor-1', name: 'Preview supplier', active: true }];
const report: OperationalReport = { name: 'stock', definition: 'Fixture operational report', startedAt: now, generatedAt: now, stale: false, total: 1,
  rows: [{ id: 'report-row', item: 'Radio', itemId: 'item-1', quantity: 7 }], monthlyTotals: [],
  job: { state: 'completed', attempts: 1, requestedAt: now, error: null } };
const equipment = (itemId: string): EquipmentProfile => {
  const own = itemId === 'private-1';
  return { itemId, ownershipType: own ? 'private_owner' : 'organization', ownerName: own ? 'Preview user' : 'Warehouse team', keeperName: 'Radio keeper',
    keeperContact: 'radio@example.test', availabilityPolicy: 'available', commitments: [], revision: 0 };
};

type CountSubmit = { lines: { lineId: string; quantity: number }[] };
type TransferCreate = { sourceLocationId: string; destinationLocationId: string; lines: { itemId: string; quantity: number }[] };
const param = (url: URL, name: string) => url.searchParams.get(name);
let positionFailures = query.has('storageError') ? 1 : 0;
let damageFailures = query.has('damageFailure') ? 1 : 0;
installFixtureApi(({ path, url, method, body }) => {
  if (path === '/api/inventory-positions' && positionFailures > 0) {
    positionFailures -= 1;
    return Response.json({ message: 'Fixture inventory temporarily unavailable' }, { status: 503 });
  }
  if (path === '/api/items') return byIds(items, url).filter((item) => !param(url, 'search') || item.name.toLowerCase().includes(param(url, 'search')!.toLowerCase()));
  if (path === '/api/item-categories') return [...new Set(items.map((item) => item.category))].sort();
  if (path.startsWith('/api/items/')) {
    const id = path.split('/')[3];
    if (path.endsWith('/responsibility/people')) return [{ id: 'preview', name: 'Preview user' }];
    if (path.endsWith('/responsibility')) return { responsiblePersonId: 'preview', responsiblePersonName: 'Preview user' };
    if (path.endsWith('/assets')) return assets.filter((row) => row.itemId === id);
    if (path.endsWith('/equipment')) return equipment(id);
    return items.find((item) => item.id === id);
  }
  if (path === '/api/storage-locations') return locations;
  if (path === '/api/assemblies') return byIds(assemblies, url);
  if (path === '/api/assemblies/assembly-1') return { ...assemblies[0], expand: { itemIds: items.map((item) => ({ ...item, stock: null })) } };
  if (path === '/api/transactions') return transactions.filter((row) => !param(url, 'itemId') || row.itemId === param(url, 'itemId'));
  if (path === '/api/inventory-positions') return positions.filter((row) => (!param(url, 'itemId') || row.itemId === param(url, 'itemId')) && (!param(url, 'locationId') || row.locationId === param(url, 'locationId')));
  if (path === '/api/inventory-assets') return assets.filter((row) => (!param(url, 'itemId') || row.itemId === param(url, 'itemId')) && (!param(url, 'locationId') || row.currentLocationId === param(url, 'locationId')));
  if (path === '/api/purchase-orders') return purchases;
  if (path === '/api/inventory-counts') return counts;
  if (path === '/api/inventory-counts/count-1/submit') {
    for (const row of (body as CountSubmit).lines) {
      const line = counts[0].lines.find((entry) => entry.id === row.lineId);
      if (line) line.countedQuantity = row.quantity;
    }
    if (counts[0].lines.every((line) => line.countedQuantity !== undefined)) counts[0].status = 'awaiting_approval';
    return counts[0];
  }
  if (path === '/api/transfers' && method === 'POST') {
    const input = body as TransferCreate;
    const created: Transfer = { id: 'transfer-1', transferNumber: 'TR-PREVIEW', status: 'requested', sourceLocationId: input.sourceLocationId, destinationLocationId: input.destinationLocationId,
      lines: input.lines.map((line, index) => ({ id: `transfer-line-${index}`, itemId: line.itemId, itemName: items.find((item) => item.id === line.itemId)?.name ?? line.itemId,
        requestedQuantity: line.quantity, pickedQuantity: 0, receivedQuantity: 0, discrepancyQuantity: 0 })) };
    transfers.push(created);
    return created;
  }
  if (path === '/api/transfers') return transfers;
  if (path === '/api/member/custody') return custody;
  if (path === '/api/returns') return returns.filter((row) => !param(url, 'status') || row.status === param(url, 'status'));
  if (path.startsWith('/api/returns/') && method === 'POST') {
    returns[0].status = path.endsWith('/reject') ? 'rejected' : 'accepted';
    returns[0].acknowledgementNotes = (body as { notes?: string }).notes;
    return returns[0];
  }
  if (path === '/api/action-inbox') return inbox;
  if (path === '/api/vendors') return vendors;
  if (path === '/api/inventory-lots') return lots;
  if (path === '/api/maintenance-schedules') return schedules;
  if (path === '/api/damage-reports') {
    const statuses = url.searchParams.getAll('status');
    const search = (param(url, 'search') ?? '').toLowerCase();
    return damage.filter((row) => (!statuses.length || statuses.includes(row.status))
      && (!search || [row.itemName, row.assemblyName, row.assetCode, row.description].some((value) => value?.toLowerCase().includes(search))));
  }
  if (path.startsWith('/api/damage-reports/') && method === 'PATCH') {
    if (damageFailures > 0) {
      damageFailures -= 1;
      return Response.json({ message: 'Fixture repair temporarily unavailable' }, { status: 503 });
    }
    const row = damage.find((entry) => entry.id === path.split('/')[3])!;
    const input = body as { status?: 'repaired' | 'written_off'; amount: number; notes: string; description?: string; severity?: DamageReport['severity'] };
    if (input.status) {
      if (input.status === 'repaired') row.repairedAmount = (row.repairedAmount ?? 0) + input.amount;
      else row.writtenOffAmount = (row.writtenOffAmount ?? 0) + input.amount;
      row.status = (row.repairedAmount ?? 0) + (row.writtenOffAmount ?? 0) < row.amount ? 'in_review'
        : row.repairedAmount === row.amount ? 'repaired' : row.writtenOffAmount === row.amount ? 'written_off' : 'resolved';
      row.resolutionNotes = [row.resolutionNotes, input.notes].filter(Boolean).join('\n');
      row.handledBy = 'preview';
      row.expand = { ...row.expand, handledBy: { id: 'preview', name: 'Preview user' } };
    }
    if (input.description) row.description = input.description;
    if (input.severity) row.severity = input.severity;
    return row;
  }
  if (path === '/api/repairs') return repairs;
  if (path === '/api/loans') return loans;
  if (path === '/api/goods-receipts' && method === 'POST') { purchases[0].status = 'received'; return receipts[0]; }
  if (path === '/api/goods-receipts') return receipts;
  if (path === '/api/reports') return { events: 'Fixture event report' };
  if (path.startsWith('/api/reports/')) return report;
  if (path === '/api/outbox/status') return { counts: { delivered: 12 } };
  if (path === '/api/notifications/unread-count') return { count: 0 };
  return [];
});
setAppLanguage('en');
setDevelopmentSession('dev:preview', fixtureUser('admin'));
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
window.addEventListener('ash-api-change', (event) => invalidateForApiChange(client, (event as CustomEvent<ApiChangeDetail | undefined>).detail));
export function InboxLauncher() {
  const { openActionInbox } = useActionInboxDialog();
  return <Button title="Open the action inbox" onClick={openActionInbox}>Open notification modal</Button>;
}
const mobile = query.has('mobile');
const dark = !query.has('light');
const theme = createTheme({ palette: { mode: dark ? 'dark' : 'light', primary: { main: '#e30613' }, background: { default: dark ? '#121315' : '#f4f5f6', paper: dark ? '#1c1d20' : '#fff' }, divider: dark ? '#2c2d31' : '#e2e4e9' }, typography: { fontFamily: '"Titillium Web", Arial, sans-serif' } });
const root = createRoot(document.getElementById('root')!);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
root.render(<ThemeProvider theme={theme}><CssBaseline /><QueryClientProvider client={client}><BrowserRouter><ActionInboxDialogProvider>
  {!mobile && <Navigation />}
  <Box sx={{ ml: mobile ? 0 : { md: '260px' }, p: 2, width: mobile ? 390 : undefined, maxWidth: '100%', minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary">Local regression preview · fixture inventory</Typography>
    <Stack direction="row" spacing={2} sx={{ mb: 2 }}><Link to="/operations">Operations</Link><Link to="/items">Items</Link><Link to="/assemblies">Assemblies</Link><Link to="/inbox">Actions & reminders</Link></Stack>
    <InboxLauncher />
    <Routes><Route path="/tests/ui-cleanup.browser.html" element={query.has('damagePreview') ? <DamageReportsPage /> : query.has('storagePreview') ? <StorageLocations /> : <Operations />} /><Route path="/" element={<UserDashboard />} /><Route path="/returns" element={<ReturnedItemsPage />} /><Route path="/damage-reports" element={<DamageReportsPage />} /><Route path="/operations" element={<Operations />} /><Route path="/items" element={<Items />} /><Route path="/items/:itemId" element={<ItemDetail />} /><Route path="/storage-locations" element={<StorageLocations />} /><Route path="/assemblies" element={<Assemblies />} /><Route path="/assemblies/:assemblyId" element={<AssemblyDetail />} /><Route path="/inbox" element={<ActionInboxContent onOpenTask={() => {}} />} /><Route path="*" element={<Operations />} /></Routes>
  </Box>
</ActionInboxDialogProvider></BrowserRouter></QueryClientProvider></ThemeProvider>);
