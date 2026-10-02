/* Local fixture preview: exercises the actual components without touching live inventory. */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Box, CssBaseline, Stack, ThemeProvider, Typography, createTheme } from '@mui/material';
import { Operations } from '/src/pages/Operations.tsx';
import { ItemDetail } from '/src/pages/ItemDetail.tsx';
import { AssemblyDetail } from '/src/pages/AssemblyDetail.tsx';
import { StorageLocations } from '/src/pages/StorageLocations.tsx';
import { ItemsList } from '/src/components/lists/ItemsList.tsx';
import { AssembliesList } from '/src/components/lists/AssembliesList.tsx';
import { ActionInboxContent } from '/src/components/dialogs/ActionInboxContent.tsx';
import { ReturnedItemsPage } from '/src/pages/ReturnedItems.tsx';
import { UserDashboard } from '/src/pages/UserDashboard.tsx';
import { ActionInboxDialogProvider } from '/src/components/dialogs/ActionInboxDialogProvider.tsx';
import { useActionInboxDialog } from '/src/hooks/useActionInboxDialog.ts';
import { Button } from '/src/components/shared/ActionButtons.tsx';
import { Navigation } from '/src/components/shared/Navigation.tsx';
import { setDevelopmentSession } from '/src/services/authManager.ts';
import { setAppLanguage } from '/src/utils/naming.ts';
import { useItems } from '/src/hooks/useItems.ts';
import { useAssemblies } from '/src/hooks/useAssemblies.ts';
import { invalidateForApiChange } from '/src/utils/realtimeInvalidation.ts';

const now = '2026-10-02T10:00:00Z';
const locations = [
  { id: 'location-a', name: 'Shelf A', position: 'Left', location: 'Warehouse', active: true },
  { id: 'location-b', name: 'Shelf B', position: 'Right', location: 'Warehouse', active: true },
  { id: 'location-empty', name: 'Empty shelf', active: true },
];
const items = [7, 3].map((amount, index) => ({ id: `item-${index + 1}`, name: ['Radio', 'Cable'][index], sku: `SKU-${index + 1}`, trackingMode: 'bulk', category: 'Equipment', amount: 2, value: 10, storageLocation: locations[index].id, eventTypes: ['DE'], status: 'available', created: now, updated: now,
  stock: { onHand: amount, available: amount, totalOwned: amount, reserved: 0, damaged: 0, inTransit: 0, checkedOut: 0, ordered: 5 }, expand: { storageLocation: locations[index] } }));
items[0].hint = 'Charge radios before use. Return them to the labelled storage shelves.';
const assemblies = [{ id: 'assembly-1', name: 'Radio kit', description: 'Two radios and a cable', hint: 'Connect before use', itemIds: items.map(item => item.id), itemQuantities: { 'item-1': 2, 'item-2': 1 }, eventTypes: ['DE'], created: now, updated: now }];
const transactions = [
  { id: 'tx-initial', itemId: 'item-1', transactionType: 'added', quantityChanged: 2, userId: 'preview', reason: 'Initial stock', notes: '', timestamp: '2026-10-01T10:00:00Z', created: now, updated: now },
  { id: 'tx-receipt', itemId: 'item-1', transactionType: 'received', quantityChanged: 5, userId: 'preview', reason: 'Goods receipt', notes: '', timestamp: now, created: now, updated: now },
];
const counts = [{ id: 'count-1', sessionNumber: 'COUNT-PREVIEW', status: 'counting', blindCount: false, lines: items.map((item, index) => ({ id: `count-line-${index + 1}`, itemId: item.id, itemName: item.name, locationId: locations[index].id, expectedQuantity: item.stock.onHand, countedQuantity: null, recountedQuantity: null })) }];
const purchases = [{ id: 'purchase-1', orderNumber: 'PO-PREVIEW', vendorName: 'Preview supplier', vendorId: 'vendor-1', orderDate: '2026-10-01', status: 'ordered', createdByName: 'Preview user', lines: [{ id: 'purchase-line-1', itemId: 'item-1', itemName: 'Radio', orderedQuantity: 5, receivedQuantity: 0, remainingQuantity: 5, unitPriceCents: 1000 }] }];
const positions = items.map((item, index) => ({ id: `position-${index}`, itemId: item.id, locationId: locations[index].id, quantityOnHand: item.stock.onHand, quantityReserved: 0, quantityDamaged: 0, quantityQuarantined: 0, quantityInTransit: 0, availableQuantity: item.stock.available, transferableQuantity: item.stock.available }));
positions[0] = { ...positions[0], quantityOnHand: 5, availableQuantity: 5, transferableQuantity: 5 };
positions.push({ ...positions[0], id: 'position-radio-b', locationId: locations[1].id, quantityOnHand: 2, availableQuantity: 2, transferableQuantity: 2 });
const inbox = [{ key: 'receipt:preview', kind: 'receipt', title: 'Receive radios', detail: 'Five radios from Preview supplier', path: '/operations?tab=purchases', due: '2026-10-02' }, { key: 'count:preview', kind: 'maintenance', title: 'Check radio kit', detail: 'Shelf A · Radio kit', path: '/assemblies/assembly-1' }];
const transfers = [{ id: 'transfer-demo', transferNumber: 'TR-002', status: 'in_transit', sourceLocationId: 'location-a', destinationLocationId: 'location-b', lines: [{ id: 'transfer-line', itemId: 'item-1', itemName: 'Radio', requestedQuantity: 4, pickedQuantity: 4, receivedQuantity: 0, discrepancyQuantity: 0 }] }];
const privateAccess = { privateResource: true, ownerId: 'preview', ownerName: 'Preview user', revision: 0, canEdit: true, canManage: true, grants: [], sources: [{ kind: 'owner', principalId: 'preview', name: 'Preview user', canEdit: true }] };
items.push({ ...items[0], id: 'private-1', name: 'My private light', access: privateAccess, eventTypes: ['TNO'] });
items.push({ ...items[1], id: 'rental-1', name: 'My checked-out rental', eventTypes: ['LS'] });
const custody = [{ key: 'rental:preview', itemId: 'rental-1', personId: 'preview', person: 'Preview user', name: 'My checked-out rental', checkedOut: 1, category: 'Equipment', event: 'LightSim', storageLocation: 'Shelf A', eventKey: 'LS', pendingQuantity: 0 }];
const returns = [{ id: 'return-1', itemId: 'item-1', itemName: 'Radio', quantity: 1, returnedForUserName: 'Preview user', returnedForUserId: 'preview', expectedReturnLocationName: 'Shelf A', status: 'pending', created: now, submittedByName: 'Preview user', notes: 'Left on the labelled return shelf; warehouse acknowledgement outstanding.' }];
const assets = [];
if (new URLSearchParams(location.search).has('storagePreview')) {
  items[1].category = 'Cabling';
  items[1].eventTypes = ['TNO'];
  items.push({ ...items[0], id: 'camera', name: 'Camera', trackingMode: 'serialized', category: 'Optics', eventTypes: ['TNO'], stock: { ...items[0].stock, available: 9, totalOwned: 10 } });
  items.push({ ...items[0], id: 'offsite', name: 'Checked-out device', trackingMode: 'serialized' });
  items.push({ ...items[0], id: 'inactive', name: 'Inactive device', trackingMode: 'serialized' });
  assets.push(...[
    { id: 'camera-a', itemId: 'camera', availabilityStatus: 'available' },
    { id: 'camera-reserved', itemId: 'camera', availabilityStatus: 'reserved' },
    { id: 'camera-b', itemId: 'camera', availabilityStatus: 'available', currentLocationId: 'location-b' },
    { id: 'offsite-a', itemId: 'offsite', availabilityStatus: 'in_custody' },
    { id: 'inactive-a', itemId: 'inactive', availabilityStatus: 'available', active: false },
  ].map(row => ({ active: true, currentLocationId: 'location-a', conditionStatus: 'good', ...row })));
}

const originalFetch = window.fetch.bind(window);
let positionFailures = new URLSearchParams(location.search).has('storageError') ? 1 : 0;
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== 'fixture.invalid') return originalFetch(input, init);
  const path = url.pathname;
  if (path === '/api/inventory-positions' && positionFailures > 0) {
    positionFailures -= 1;
    return Response.json({ message: 'Fixture inventory temporarily unavailable' }, { status: 503 });
  }
  if (path === '/api/events/stream') return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"type":"heartbeat"}\n\n')); } }), { headers: { 'Content-Type': 'text/event-stream' } });
  const body = init.body ? JSON.parse(init.body) : {};
  let data = [];
  if (path === '/api/items') data = items;
  else if (path.startsWith('/api/items/')) data = path.endsWith('/assets') ? [] : path.endsWith('/equipment') ? { itemId: path.split('/')[3], ownershipType: path.includes('private-1') ? 'private_owner' : 'organization', ownerName: path.includes('private-1') ? 'Preview user' : 'Warehouse team', keeperName: 'Radio keeper', keeperContact: 'radio@example.test', availabilityPolicy: path.includes('private-1') ? 'commitment_required' : 'available', commitments: [], revision: 0 } : items.find(item => path === `/api/items/${item.id}`);
  else if (path === '/api/storage-locations') data = locations;
  else if (path === '/api/assemblies') data = assemblies;
  else if (path === '/api/assemblies/assembly-1') data = { ...assemblies[0], expand: { itemIds: items.map(item => ({ ...item, stock: null, amount: 999 })) } };
  else if (path === '/api/transactions') data = transactions.filter(row => !url.searchParams.get('itemId') || row.itemId === url.searchParams.get('itemId'));
  else if (path === '/api/inventory-positions') data = positions.filter(row => (!url.searchParams.get('itemId') || row.itemId === url.searchParams.get('itemId')) && (!url.searchParams.get('locationId') || row.locationId === url.searchParams.get('locationId')));
  else if (path === '/api/inventory-assets') data = assets.filter(row => (!url.searchParams.get('itemId') || row.itemId === url.searchParams.get('itemId')) && (!url.searchParams.get('locationId') || row.currentLocationId === url.searchParams.get('locationId')));
  else if (path === '/api/purchase-orders') data = purchases;
  else if (path === '/api/inventory-counts') data = counts;
  else if (path === '/api/inventory-counts/count-1/submit') {
    body.lines.forEach(row => { counts[0].lines.find(line => line.id === row.lineId).countedQuantity = row.quantity; });
    if (counts[0].lines.every(line => line.countedQuantity !== null)) counts[0].status = 'awaiting_approval';
    data = counts[0];
  } else if (path === '/api/transfers') { if (init.method === 'POST') transfers.push({ id: 'transfer-1', transferNumber: 'TR-PREVIEW', status: 'requested', ...body, lines: body.lines.map((line, index) => ({ ...line, id: `transfer-line-${index}`, itemName: items.find(item => item.id === line.itemId).name, requestedQuantity: line.quantity, receivedQuantity: 0, discrepancyQuantity: 0 })) }); data = init.method === 'POST' ? transfers.at(-1) : transfers; }
  else if (path === '/api/member/custody') data = custody;
  else if (path === '/api/returns') data = returns.filter(row => !url.searchParams.get('status') || row.status === url.searchParams.get('status'));
  else if (path.startsWith('/api/returns/') && init.method === 'POST') { returns[0].status = path.endsWith('/reject') ? 'rejected' : 'accepted'; returns[0].acknowledgementNotes = body.notes; data = returns[0]; }
  else if (path === '/api/action-inbox') data = inbox;
  else if (path === '/api/vendors') data = [{ id: 'vendor-1', name: 'Preview supplier', active: true }];
  else if (path === '/api/inventory-lots') data = [{ id: 'lot-1', itemId: 'item-1', lotNumber: 'LOT-PREVIEW', status: 'available', expiryDate: '2027-01-01', bestBeforeDate: '2026-12-31', storageRequirements: 'Dry storage', notes: 'Fixture lot' }];
  else if (path === '/api/maintenance-schedules') data = [{ id: 'schedule-1', itemId: 'item-1', maintenanceType: 'battery_test', intervalType: 'date', intervalValue: 30, nextDueAt: '2026-10-15', active: true, checkoutBlocking: true }];
  else if (path === '/api/damage-reports') data = [{ id: 'damage-1', itemId: 'item-1', description: 'Battery connector damaged', status: 'reported' }];
  else if (path === '/api/repairs') data = [{ id: 'repair-1', damageReportId: 'damage-1', status: 'awaiting_repair', safetyImpact: true, partsAndCostNotes: 'Replacement connector', notes: 'Awaiting workshop' }];
  else if (path === '/api/loans') data = [{ id: 'loan-1', itemId: 'rental-1', item: 'My checked-out rental', provider: 'Preview supplier', contact: 'preview@example.test', kind: 'rental', quantity: 4, collected: 4, returned: 1, collectionDate: '2026-10-01', availableUntil: '2026-10-10', returnDue: '2026-10-12', status: 'collected', terms: 'Return to supplier', assetCodes: [], history: [], revision: 0 }];
  else if (path === '/api/goods-receipts' && init.method !== 'POST') data = [{ id: 'receipt-1', receiptNumber: 'GR-PREVIEW', status: 'accepted', receivedAt: now, lines: [{ id: 'receipt-line', itemName: 'Radio', acceptedQuantity: 5, damagedQuantity: 0, rejectedQuantity: 0 }] }];
  else if (path === '/api/reports') data = { events: 'Fixture event report' };
  else if (path.startsWith('/api/reports/')) data = { rows: [{ id: 'report-row', item: 'Radio', itemId: 'item-1', quantity: 7 }], monthlyTotals: [], total: 1, generatedAt: now, stale: false, definition: 'Fixture operational report' };
  else if (path === '/api/outbox/status') data = { counts: { delivered: 12 } };
  else if (path === '/api/goods-receipts' && init.method === 'POST') { purchases[0].status = 'received'; data = { id: 'receipt-1', ...body }; }
  return Response.json(data);
};
setAppLanguage('en');
setDevelopmentSession('dev:preview', { id: 'preview', name: 'Preview user', email: 'preview@example.test', role: 'hq_admin', faction: [], created: now, updated: now });
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
window.addEventListener('ash-api-change', event => invalidateForApiChange(client, event.detail));
function Catalog({ assembly = false }) {
  const itemQuery = useItems(); const assemblyQuery = useAssemblies();
  return assembly ? <AssembliesList items={itemQuery.data} assemblies={assemblyQuery.data} isLoading={itemQuery.isLoading || assemblyQuery.isLoading} /> : <ItemsList items={itemQuery.data} isLoading={itemQuery.isLoading} />;
}
function InboxLauncher() { const { openActionInbox } = useActionInboxDialog(); return <Button onClick={openActionInbox}>Open notification modal</Button>; }
const mobile = new URLSearchParams(location.search).has('mobile');
const dark = !new URLSearchParams(location.search).has('light');
const theme = createTheme({ palette: { mode: dark ? 'dark' : 'light', primary: { main: '#e30613' }, background: { default: dark ? '#121315' : '#f4f5f6', paper: dark ? '#1c1d20' : '#fff' }, divider: dark ? '#2c2d31' : '#e2e4e9' }, typography: { fontFamily: '"Titillium Web", Arial, sans-serif' } });
const root = createRoot(document.getElementById('root'));
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
root.render(<ThemeProvider theme={theme}><CssBaseline /><QueryClientProvider client={client}><BrowserRouter><ActionInboxDialogProvider>
  {!mobile && <Navigation />}
  <Box sx={{ ml: mobile ? 0 : { md: '260px' }, p: 2, width: mobile ? 390 : undefined, maxWidth: '100%', minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary">Local regression preview · {'fixture inventory'}</Typography>
    <Stack direction="row" spacing={2} sx={{ mb: 2 }}><Link to="/operations">Operations</Link><Link to="/items">Items</Link><Link to="/assemblies">Assemblies</Link><Link to="/inbox">Actions & reminders</Link></Stack>
    <InboxLauncher />
    <Routes><Route path="/tests/ui-cleanup.browser.html" element={new URLSearchParams(location.search).has('storagePreview') ? <StorageLocations /> : <Operations />} /><Route path="/" element={<UserDashboard />} /><Route path="/returns" element={<ReturnedItemsPage />} /><Route path="/operations" element={<Operations />} /><Route path="/items" element={<Catalog />} /><Route path="/items/:itemId" element={<ItemDetail />} /><Route path="/storage-locations" element={<StorageLocations />} /><Route path="/assemblies" element={<Catalog assembly />} /><Route path="/assemblies/:assemblyId" element={<AssemblyDetail />} /><Route path="/inbox" element={<ActionInboxContent onOpenTask={() => {}} />} /><Route path="*" element={<Operations />} /></Routes>
  </Box>
</ActionInboxDialogProvider></BrowserRouter></QueryClientProvider></ThemeProvider>);

