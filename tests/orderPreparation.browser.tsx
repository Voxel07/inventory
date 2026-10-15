/* Local fixture preview of order preparation: faction order detail, general orders and the warehouse queue. */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Box, CssBaseline, Stack, ThemeProvider, Typography, createTheme } from '@mui/material';
import { Operations } from '../src/pages/Operations';
import { Orders } from '../src/pages/Orders';
import { FactionOrderDetail } from '../src/pages/FactionOrderDetail';
import { setDevelopmentSession } from '../src/services/authManager';
import { setAppLanguage } from '../src/utils/naming';
import type { EventReport, Faction, FactionOrder, FactionOrderStatus, GeneralOrder, StorageLocation } from '../src/types';
import type { PickupAssignment, PickupGroup, PickupPlan } from '../src/services/orderPickupService';
import { FIXTURE_TIME, fixtureAssembly, fixtureItem, fixtureLocation, fixtureStock, fixtureUser } from './fixtures/dto';
import { byIds, installFixtureApi } from './fixtures/api';

const locations = [
  fixtureLocation({ id: 'loc-tech', name: 'Technik-Lager 1' }),
  fixtureLocation({ id: 'loc-hazard', name: 'Gefahrstofflager' }),
  fixtureLocation({ id: 'loc-pallet', name: 'Palettenlager' }),
];
const item = (id: string, name: string, category: string, quantity: number, location: StorageLocation) => fixtureItem({
  id, name, category, minStock: 1, value: 10, storageLocation: location.id, eventTypes: ['LS', 'DE'],
  expand: { storageLocation: location }, stock: fixtureStock(quantity),
});
const items = [
  item('seal', 'Siegelaufkleber HPA-Regulator (100 Stück)', 'Verbrauchsmaterial', 15, locations[0]),
  item('fuel', 'Benzinkanister 20l', 'Energie', 4, locations[1]),
  item('generator', 'Benzingenerator 3,5 kW', 'Energie', 4, locations[0]),
  item('fence', 'Bauzaun 3.5m x 2.0m', 'Infrastruktur', 40, locations[2]),
  item('table', 'Biertisch', 'Mobiliar', 15, locations[2]),
];
const assemblies = [fixtureAssembly({ id: 'power', name: 'Notstrom-Einheit 3,5 kW', description: 'Generator mit Kanister', itemQuantities: { generator: 1, fuel: 1 }, eventTypes: ['LS'] })];
const event = (id: string, eventType: string, name: string, date: string, endDate: string, status: EventReport['status']): EventReport => ({
  id, eventType, name, eventDate: date, startDate: date, endDate, status, itemIds: [], plannedQuantities: {}, usedQuantities: {}, created: FIXTURE_TIME, updated: FIXTURE_TIME,
});
const events = [
  event('ls-2026', 'LS', 'LightSim 2026', '2026-06-13', '2026-06-14', 'completed'),
  event('ls-2027', 'LS', 'LightSim 2027', '2027-06-12', '2027-06-13', 'planned'),
  event('de-2026', 'DE', 'Demo DE 2026', '2026-09-12', '2026-09-13', 'completed'),
];
const factionOrder = (id: string, faction: string, status: FactionOrderStatus, extra: Partial<FactionOrder> = {}): FactionOrder => ({
  kind: 'faction', id, orderCode: `LS27-${faction}-01`, factionKey: `LS:${faction.toLowerCase()}`, eventType: 'LS', faction, eventDate: '2027-06-12', eventOccurrenceId: 'ls-2027',
  requestedPickupDate: '2027-06-10', status, itemIds: ['seal', 'fence'], requestedQuantities: { seal: 2, fence: 6 }, preparedQuantities: {},
  assemblyIds: ['power'], requestedAssemblyQuantities: { power: 1 }, preparedAssemblyQuantities: {}, assetAssignments: {}, reservedQuantities: {},
  notes: 'Bitte Zaunelemente gebündelt bereitstellen.', createdBy: 'preview', history: [], created: FIXTURE_TIME, updated: FIXTURE_TIME,
  // The API expands every line item, including assembly components (generator, fuel).
  expand: { itemIds: items.filter((entry) => ['seal', 'fence', 'generator', 'fuel'].includes(entry.id)), assemblyIds: assemblies }, ...extra,
});
const factionOrders = [
  factionOrder('order-tera', 'TERA', 'preparing', { preparedQuantities: { seal: 2 } }),
  factionOrder('order-ucrf', 'UCRF', 'submitted'),
  factionOrder('order-tera-2026', 'TERA', 'closed', { orderCode: 'LS26-TERA-01', eventOccurrenceId: 'ls-2026', eventDate: '2026-06-13', requestedQuantities: { seal: 1, fence: 4 }, preparedQuantities: { seal: 1, fence: 4 }, handedOverQuantities: { seal: 1, fence: 4 }, preparedAssemblyQuantities: { power: 1 } }),
];
const generalOrder = (id: string, name: string, purpose: string, eventOccurrenceId: string, status: GeneralOrder['status'], extra: Partial<GeneralOrder>): GeneralOrder => ({
  kind: 'general', id, name, purpose, eventOccurrenceId, status, requestedQuantities: {}, preparedQuantities: {}, handedOverQuantities: {}, returnedQuantities: {},
  consumedQuantities: {}, damagedQuantities: {}, missingQuantities: {}, writtenOffQuantities: {}, reconciledAssets: {}, assetAssignments: {},
  itemNames: { table: 'Biertisch' }, history: [], createdBy: 'preview', created: FIXTURE_TIME, updated: FIXTURE_TIME, ...extra,
});
const generalOrders = [
  generalOrder('general-1', 'Technikzelt LightSim 2027', 'Strom und Licht im Technikzelt', 'ls-2027', 'submitted', { requestedQuantities: { table: 2 } }),
  generalOrder('general-2', 'Catering Demo DE 2026', 'Feldküche', 'de-2026', 'closed', { requestedQuantities: { table: 3 }, preparedQuantities: { table: 3 }, handedOverQuantities: { table: 3 }, returnedQuantities: { table: 3 } }),
];
const factions: Faction[] = [['LS', 'TERA'], ['LS', 'UCRF'], ['DE', 'KGG']].map(([eventType, name]) => ({ id: name, eventType, name, slug: name.toLowerCase(), active: true }));
const people: Record<string, string> = { alex: 'Alex · Lighting', sam: 'Sam · Event equipment' };
const pickupAssignments: Record<string, Record<string, PickupAssignment>> = {};

type PlannedOrder = { id: string; status: string; orderCode?: string; name?: string; requestedQuantities: Record<string, number>; preparedQuantities: Record<string, number>;
  requestedAssemblyQuantities?: Record<string, number>; preparedAssemblyQuantities?: Record<string, number> };
function pickupPlan(order: PlannedOrder): PickupPlan {
  const requested = { ...order.requestedQuantities };
  const prepared = { ...order.preparedQuantities };
  for (const assembly of assemblies) for (const [id, quantity] of Object.entries(assembly.itemQuantities)) {
    const ordered = order.requestedAssemblyQuantities?.[assembly.id] ?? 0;
    if (ordered <= 0) continue;
    requested[id] = (requested[id] ?? 0) + ordered * quantity;
    prepared[id] = (prepared[id] ?? 0) + (order.preparedAssemblyQuantities?.[assembly.id] ?? 0) * quantity;
  }
  const groups = new Map<string, PickupGroup>();
  for (const [id, quantity] of Object.entries(requested)) {
    const line = items.find((entry) => entry.id === id)!;
    const assignment = pickupAssignments[order.id]?.[id]
      ?? { responsiblePersonId: ['generator', 'fuel'].includes(id) ? 'alex' : 'sam', groupName: line.category, pickupLocationId: line.storageLocation };
    const key = `${assignment.responsiblePersonId}:${assignment.groupName}:${assignment.pickupLocationId}`;
    const group = groups.get(key) ?? { key, name: assignment.groupName, responsiblePersonId: assignment.responsiblePersonId ?? undefined,
      responsiblePersonName: people[assignment.responsiblePersonId ?? ''], pickupLocationId: assignment.pickupLocationId ?? undefined,
      pickupLocationName: locations.find((location) => location.id === assignment.pickupLocationId)?.name, items: [] };
    group.items.push({ itemId: id, name: line.name, ordered: quantity, prepared: prepared[id] ?? 0 });
    groups.set(key, group);
  }
  return { orderName: order.orderCode || order.name || order.id, status: order.status, canEdit: !['closed', 'cancelled'].includes(order.status),
    pickupPointsComplete: Boolean(pickupAssignments[order.id]),
    groups: [...groups.values()].sort((a, b) => (a.responsiblePersonName ?? '').localeCompare(b.responsiblePersonName ?? '')) };
}

installFixtureApi(({ path, url, method, body }) => {
  const pickup = /^\/api\/(orders|general-orders)\/([^/]+)\/pickup-groups$/.exec(path);
  if (pickup) {
    const order: PlannedOrder | undefined = pickup[1] === 'general-orders'
      ? generalOrders.find((entry) => entry.id === pickup[2]) : factionOrders.find((entry) => entry.id === pickup[2]);
    if (!order) return Response.json({ message: 'Unknown order' }, { status: 404 });
    if (method === 'PATCH') pickupAssignments[order.id] = (body as { assignments: Record<string, PickupAssignment> }).assignments;
    return pickupPlan(order);
  }
  if (path.endsWith('/pickup-groups/notify')) return 2;
  if (path === '/api/users/assignable') return Object.entries(people).map(([id, name]) => ({ id, name }));
  if (path === '/api/items') return byIds(items, url);
  if (path.startsWith('/api/items/') && path.endsWith('/assets')) return [];
  if (path === '/api/assemblies') return byIds(assemblies, url);
  if (path === '/api/storage-locations') return locations;
  if (path === '/api/events') return events;
  if (path === '/api/event-types') return ['LS', 'DE'];
  if (path === '/api/factions') return factions;
  if (path === '/api/orders/faction') return factionOrders;
  if (/^\/api\/orders\/[^/]+$/.test(path)) return factionOrders.find((order) => order.id === path.split('/')[3]);
  if (path === '/api/orders/general') return generalOrders;
  if (path === '/api/equipment-availability') return {};
  return [];
});
setAppLanguage(new URLSearchParams(location.search).get('lang') === 'de' ? 'de' : 'en');
setDevelopmentSession('dev:preview', fixtureUser('warehouse_crew'));
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
createRoot(document.getElementById('root')!).render(<ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}><CssBaseline /><QueryClientProvider client={client}><BrowserRouter>
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
