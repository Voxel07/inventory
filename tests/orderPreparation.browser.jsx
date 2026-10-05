/* Local fixture preview of order preparation: faction order detail, general orders and the warehouse queue. */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Box, CssBaseline, Stack, ThemeProvider, Typography, createTheme } from '@mui/material';
import { Operations } from '/src/pages/Operations.tsx';
import { Orders } from '/src/pages/Orders.tsx';
import { FactionOrderDetail } from '/src/pages/FactionOrderDetail.tsx';
import { setDevelopmentSession } from '/src/services/authManager.ts';
import { setAppLanguage } from '/src/utils/naming.ts';

const now = '2026-10-02T10:00:00Z';
const locations = [
  { id: 'loc-tech', name: 'Technik-Lager 1', active: true },
  { id: 'loc-hazard', name: 'Gefahrstofflager', active: true },
  { id: 'loc-pallet', name: 'Palettenlager', active: true },
];
const item = (id, name, category, amount, location, extra = {}) => ({ id, name, category, amount, minStock: 1, value: 10, trackingMode: 'bulk', storageLocation: location.id,
  eventTypes: ['LS', 'DE'], status: 'available', created: now, updated: now, expand: { storageLocation: location },
  stock: { onHand: amount, available: amount, remaining: amount, totalOwned: amount, reserved: 0, damaged: 0, inTransit: 0, checkedOut: 0 }, ...extra });
const items = [
  item('seal', 'Siegelaufkleber HPA-Regulator (100 Stück)', 'Verbrauchsmaterial', 15, locations[0]),
  item('fuel', 'Benzinkanister 20l', 'Energie', 4, locations[1]),
  item('generator', 'Benzingenerator 3,5 kW', 'Energie', 4, locations[0]),
  item('fence', 'Bauzaun 3.5m x 2.0m', 'Infrastruktur', 40, locations[2]),
  item('table', 'Biertisch', 'Mobiliar', 15, locations[2]),
];
const assemblies = [{ id: 'power', name: 'Notstrom-Einheit 3,5 kW', description: 'Generator mit Kanister', itemIds: ['generator', 'fuel'], itemQuantities: { generator: 1, fuel: 1 }, eventTypes: ['LS'], created: now, updated: now }];
const events = [
  { id: 'ls-2026', eventType: 'LS', name: 'LightSim 2026', eventDate: '2026-06-13', startDate: '2026-06-13', endDate: '2026-06-14', status: 'completed', itemIds: [], plannedQuantities: {}, usedQuantities: {}, created: now, updated: now },
  { id: 'ls-2027', eventType: 'LS', name: 'LightSim 2027', eventDate: '2027-06-12', startDate: '2027-06-12', endDate: '2027-06-13', status: 'planned', itemIds: [], plannedQuantities: {}, usedQuantities: {}, created: now, updated: now },
  { id: 'de-2026', eventType: 'DE', name: 'Demo DE 2026', eventDate: '2026-09-12', startDate: '2026-09-12', endDate: '2026-09-13', status: 'completed', itemIds: [], plannedQuantities: {}, usedQuantities: {}, created: now, updated: now },
];
const factionOrder = (id, faction, status, extra = {}) => ({
  id, orderCode: `LS27-${faction}-01`, factionKey: `LS:${faction.toLowerCase()}`, eventType: 'LS', faction, eventDate: '2027-06-12', eventOccurrenceId: 'ls-2027',
  requestedPickupDate: '2027-06-10', status, itemIds: ['seal', 'fence'], requestedQuantities: { seal: 2, fence: 6 }, preparedQuantities: {},
  assemblyIds: ['power'], requestedAssemblyQuantities: { power: 1 }, preparedAssemblyQuantities: {}, assetAssignments: {}, reservedQuantities: {},
  notes: 'Bitte Zaunelemente gebündelt bereitstellen.', createdBy: 'preview', history: [], created: now, updated: now,
  // The API expands every line item, including assembly components (generator, fuel).
  expand: { itemIds: items.filter((entry) => ['seal', 'fence', 'generator', 'fuel'].includes(entry.id)), assemblyIds: assemblies }, ...extra,
});
const factionOrders = [factionOrder('order-tera', 'TERA', 'preparing', { preparedQuantities: { seal: 2 } }), factionOrder('order-ucrf', 'UCRF', 'submitted')];
const generalOrders = [
  { id: 'general-1', name: 'Technikzelt LightSim 2027', purpose: 'Strom und Licht im Technikzelt', eventOccurrenceId: 'ls-2027', status: 'submitted', requestedQuantities: { table: 2 }, preparedQuantities: {},
    handedOverQuantities: {}, returnedQuantities: {}, consumedQuantities: {}, damagedQuantities: {}, missingQuantities: {}, writtenOffQuantities: {}, reconciledAssets: {}, assetAssignments: {}, itemNames: { table: 'Biertisch' }, createdBy: 'preview', created: now, updated: now },
  { id: 'general-2', name: 'Catering Demo DE 2026', purpose: 'Feldküche', eventOccurrenceId: 'de-2026', status: 'closed', requestedQuantities: { table: 3 }, preparedQuantities: { table: 3 },
    handedOverQuantities: { table: 3 }, returnedQuantities: { table: 3 }, consumedQuantities: {}, damagedQuantities: {}, missingQuantities: {}, writtenOffQuantities: {}, reconciledAssets: {}, assetAssignments: {}, itemNames: { table: 'Biertisch' }, createdBy: 'preview', created: now, updated: now },
];
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== 'fixture.invalid') return originalFetch(input, init);
  const path = url.pathname;
  if (path === '/api/events/stream') return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"type":"heartbeat"}\n\n')); } }), { headers: { 'Content-Type': 'text/event-stream' } });
  let data = [];
  if (path === '/api/items') data = items;
  else if (path.startsWith('/api/items/') && path.endsWith('/assets')) data = [];
  else if (path === '/api/assemblies') data = assemblies;
  else if (path === '/api/storage-locations') data = locations;
  else if (path === '/api/events') data = events;
  else if (path === '/api/event-types') data = ['LS', 'DE'];
  else if (path === '/api/factions') data = [['LS', 'TERA'], ['LS', 'UCRF'], ['DE', 'KGG']].map(([eventType, name]) => ({ id: name, eventType, name, slug: name.toLowerCase(), active: true }));
  else if (path === '/api/orders') data = factionOrders;
  else if (/^\/api\/orders\/[^/]+$/.test(path)) data = factionOrders.find((order) => order.id === path.split('/')[3]);
  else if (path === '/api/general-orders') data = generalOrders;
  else if (path === '/api/equipment-availability') data = {};
  return Response.json(data);
};
setAppLanguage(new URLSearchParams(location.search).get('lang') === 'de' ? 'de' : 'en');
setDevelopmentSession('dev:preview', { id: 'preview', name: 'Preview user', email: 'preview@example.test', role: 'warehouse_crew', faction: [], created: now, updated: now });
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
createRoot(document.getElementById('root')).render(<ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}><CssBaseline /><QueryClientProvider client={client}><BrowserRouter>
  <Box sx={{ p: 2, maxWidth: 1200 }}>
    <Typography variant="caption" color="text.secondary">Order preparation fixture</Typography>
    <Stack direction="row" spacing={2} sx={{ mb: 2 }}><Link to="/orders/faction/order-tera">Preparing order</Link><Link to="/orders?tab=general">General orders</Link><Link to="/operations">Warehouse tasks</Link></Stack>
    <Routes>
      <Route path="/orders/faction/:orderId" element={<FactionOrderDetail />} />
      <Route path="/orders" element={<Orders />} />
      <Route path="*" element={<Operations />} />
    </Routes>
  </Box>
</BrowserRouter></QueryClientProvider></ThemeProvider>);
