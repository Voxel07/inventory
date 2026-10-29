/* Local fixture preview of order preparation: faction order detail, general orders and the warehouse queue. */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { Box, CssBaseline, Stack, ThemeProvider, Typography } from '@mui/material';
import { buildTheme } from '../src/theme';
import { Operations } from '../src/pages/Operations';
import { Orders } from '../src/pages/Orders';
import { FactionOrderDetail } from '../src/pages/FactionOrderDetail';
import { setDevelopmentSession } from '../src/services/authManager';
import { setAppLanguage } from '../src/utils/naming';
import { ROLE_LADDER, type EventReport, type Faction, type FactionOrder, type FactionOrderFormData, type FactionOrderStatus, type GeneralOrder, type GeneralOrderFormData, type StorageLocation } from '../src/types';
import { canOperateWarehouse, canUseGeneralOrders, canViewFaction, canViewGeneralOrders, canWriteFaction } from '../src/utils/access';
import type { PickupAssignment, PickupGroup, PickupPlan } from '../src/services/orderPickupService';
import { FIXTURE_TIME, fixtureAssembly, fixtureItem, fixtureLocation, fixtureStock, fixtureUser } from './fixtures/dto';
import { byIds, installFixtureApi } from './fixtures/api';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { subscribeToApiChanges } from '../src/services/apiClient';
import { invalidateForApiChange } from '../src/utils/realtimeInvalidation';
import { initializeI18n } from '../src/i18n';
import 'dayjs/locale/en-gb';
import 'dayjs/locale/de';

const params = new URLSearchParams(location.search);
const role = ROLE_LADDER.find(value => value === params.get('role')) ?? 'warehouse_crew';
const previewUser = { ...fixtureUser(role), faction: ['LS:tera'] };
const initialView = params.get('view') ?? '/orders/faction/order-tera';
const visibleFaction = (order: FactionOrder) => canViewFaction(previewUser, order.factionKey);
const matchesOrder = (order: { status: string; eventOccurrenceId?: string; name?: string }, url: URL) => {
  const statuses = url.searchParams.getAll('status');
  return (!statuses.length || statuses.includes(order.status))
    && (!url.searchParams.get('eventId') || order.eventOccurrenceId === url.searchParams.get('eventId'))
    && (!url.searchParams.get('search') || order.name?.toLowerCase().includes(url.searchParams.get('search')!.toLowerCase()));
};

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
  // Consumable: consumed at pickup; unused stickers can be restocked even after the order is closed.
  { ...item('seal', 'Siegelaufkleber HPA-Regulator (100 Stück)', 'Verbrauchsmaterial', 15, locations[0]), isConsumable: true, inventoryRole: 'consumable' as const },
  item('fuel', 'Benzinkanister 20l', 'Energie', 4, locations[1]),
  item('generator', 'Benzingenerator 3,5 kW', 'Energie', 4, locations[0]),
  item('fence', 'Bauzaun 3.5m x 2.0m', 'Infrastruktur', 40, locations[2]),
  item('table', 'Biertisch', 'Mobiliar', 15, locations[2]),
];
const assemblies = [fixtureAssembly({ id: 'power', name: 'Notstrom-Einheit 3,5 kW', description: 'Generator mit Kanister', itemQuantities: { generator: 1, fuel: 1 }, eventTypes: ['LS'] })];
const event = (id: string, eventType: string, name: string, date: number, endDate: number, status: EventReport['status']): EventReport => ({
  id, eventType, name, eventDate: date, startDate: date, endDate, status, itemIds: [], plannedQuantities: {}, usedQuantities: {}, created: FIXTURE_TIME, updated: FIXTURE_TIME,
});
const events = [
  event('ls-2026', 'LS', 'LightSim 2026', 1781308800000, 1781395200000, 'completed'),
  event('ls-2027', 'LS', 'LightSim 2027', 1812758400000, 1812844800000, 'planned'),
  event('de-2026', 'DE', 'Demo DE 2026', 1789171200000, 1789257600000, 'completed'),
];
const factionOrder = (id: string, faction: string, status: FactionOrderStatus, extra: Partial<FactionOrder> = {}): FactionOrder => ({
  kind: 'faction', id, orderCode: `LS27-${faction}-01`, factionKey: `LS:${faction.toLowerCase()}`, eventType: 'LS', faction, eventDate: 1812758400000, eventOccurrenceId: 'ls-2027',
  requestedPickupDate: 1812585600000, status, itemIds: ['seal', 'fence'], requestedQuantities: { seal: 2, fence: 6 }, preparedQuantities: {},
  assemblyIds: ['power'], requestedAssemblyQuantities: { power: 1 }, preparedAssemblyQuantities: {}, assetAssignments: {}, reservedQuantities: {},
  notes: 'Bitte Zaunelemente gebündelt bereitstellen.', itemRequests: [], createdBy: 'preview', history: [], created: FIXTURE_TIME, updated: FIXTURE_TIME,
  // The API expands every line item, including assembly components (generator, fuel).
  expand: { itemIds: items.filter((entry) => ['seal', 'fence', 'generator', 'fuel'].includes(entry.id)), assemblyIds: assemblies }, ...extra,
});
const factionOrders = [
  factionOrder('order-tera', 'TERA', 'preparing', { preparedQuantities: { seal: 2 } }),
  factionOrder('order-ucrf', 'UCRF', 'submitted'),
  factionOrder('order-draft', 'TERA', 'draft', { orderCode: 'LS27-TERA-02' }),
  factionOrder('order-returned', 'TERA', 'returned', { orderCode: 'LS27-TERA-03', preparedQuantities: { seal: 2, fence: 6 }, preparedAssemblyQuantities: { power: 1 } }),
  factionOrder('order-tera-2026', 'TERA', 'closed', { orderCode: 'LS26-TERA-01', eventOccurrenceId: 'ls-2026', eventDate: 1781308800000, requestedQuantities: { seal: 1, fence: 4 }, preparedQuantities: { seal: 1, fence: 4 }, handedOverQuantities: { seal: 1, fence: 4 }, consumedQuantities: { seal: 1 }, preparedAssemblyQuantities: { power: 1 } }),
];
const generalOrder = (id: string, name: string, purpose: string, eventOccurrenceId: string, status: GeneralOrder['status'], extra: Partial<GeneralOrder>): GeneralOrder => ({
  kind: 'general', id, name, purpose, eventOccurrenceId, status, requestedQuantities: {}, preparedQuantities: {}, handedOverQuantities: {}, returnedQuantities: {},
  consumedQuantities: {}, damagedQuantities: {}, missingQuantities: {}, writtenOffQuantities: {}, reconciledAssets: {}, assetAssignments: {},
  itemNames: { table: 'Biertisch' }, itemRequests: [], history: [], createdBy: 'preview', created: FIXTURE_TIME, updated: FIXTURE_TIME, ...extra,
});
const generalOrders = [
  generalOrder('general-1', 'Technikzelt LightSim 2027', 'Strom und Licht im Technikzelt', 'ls-2027', 'submitted', { requestedQuantities: { table: 2 } }),
  generalOrder('general-2', 'Catering Demo DE 2026', 'Feldküche', 'de-2026', 'closed', { requestedQuantities: { table: 3 }, preparedQuantities: { table: 3 }, handedOverQuantities: { table: 3 }, returnedQuantities: { table: 3 } }),
  generalOrder('general-draft', 'Catering draft', 'Tables for the catering tent', 'ls-2027', 'draft', { requestedQuantities: { table: 4 } }),
  generalOrder('general-other', 'Another crew member’s draft', 'Stage tables', 'ls-2027', 'draft', { requestedQuantities: { table: 2 }, createdBy: 'someone-else' }),
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
  const faction = factionOrders.find(value => value.id === order.id);
  const general = generalOrders.find(value => value.id === order.id);
  return { orderName: order.orderCode || order.name || order.id, status: order.status,
    canEdit: ['draft', 'submitted', 'preparing', 'ready'].includes(order.status) && (canOperateWarehouse(previewUser)
      || (faction?.createdBy === previewUser.id && canWriteFaction(previewUser, faction.factionKey))
      || (general?.createdBy === previewUser.id && canUseGeneralOrders(previewUser))),
    pickupPointsComplete: Boolean(pickupAssignments[order.id]),
    groups: [...groups.values()].sort((a, b) => (a.responsiblePersonName ?? '').localeCompare(b.responsiblePersonName ?? '')) };
}

installFixtureApi(({ path, url, method, body }) => {
  if (path === '/api/orders/general' && method === 'POST') {
    const input = body as GeneralOrderFormData;
    const order = generalOrder(crypto.randomUUID(), input.name, input.purpose, input.eventOccurrenceId ?? '', 'draft',
      { requestedQuantities: input.requestedQuantities, itemRequests: (input.itemRequests ?? []).map(request => ({ ...request, id: request.id ?? crypto.randomUUID(), status: 'open' })) });
    generalOrders.push(order);
    return order;
  }
  if (path === '/api/orders/faction' && method === 'POST') {
    const input = body as FactionOrderFormData;
    const order = factionOrder(crypto.randomUUID(), input.faction, 'draft', { ...input, eventOccurrenceId: input.eventOccurrenceId,
      itemRequests: (input.itemRequests ?? []).map(request => ({ ...request, id: request.id ?? crypto.randomUUID(), status: 'open' })) });
    factionOrders.push(order);
    return order;
  }
  const transition = /^\/api\/orders\/(faction|general)\/([^/]+)\/transitions\/([^/]+)$/.exec(path);
  if (transition && method === 'POST') {
    const order = (transition[1] === 'faction' ? factionOrders : generalOrders).find(order => order.id === transition[2]);
    if (!order) return Response.json({ message: 'Unknown fixture order' }, { status: 404 });
    order.status = transition[3] as FactionOrderStatus;
    return order;
  }
  const pickup = /^\/api\/orders\/(faction|general)\/([^/]+)\/pickup-groups$/.exec(path);
  if (pickup) {
    const order: PlannedOrder | undefined = pickup[1] === 'general'
      ? generalOrders.find((entry) => entry.id === pickup[2]) : factionOrders.find((entry) => entry.id === pickup[2]);
    if (!order) return Response.json({ message: 'Unknown order' }, { status: 404 });
    if (method === 'PATCH') pickupAssignments[order.id] = (body as { assignments: Record<string, PickupAssignment> }).assignments;
    return pickupPlan(order);
  }
  if (path.endsWith('/pickup-groups/notify')) return 2;
  if (path === '/api/users/assignable') return Object.entries(people).map(([id, name]) => ({ id, name }));
  if (path === '/api/items') return byIds(items, url).filter(item =>
    (!url.searchParams.get('search') || item.name.toLowerCase().includes(url.searchParams.get('search')!.toLowerCase()))
    && (!url.searchParams.get('category') || item.category === url.searchParams.get('category')));
  if (path === '/api/item-categories') return [...new Set(items.map(item => item.category))];
  if (path.startsWith('/api/items/') && path.endsWith('/assets')) return [];
  if (path === '/api/assemblies') return byIds(assemblies, url);
  if (path === '/api/storage-locations') return locations;
  if (path === '/api/events') return events;
  if (path === '/api/event-types') return ['LS', 'DE'];
  if (path === '/api/factions') return factions;
  if (path === '/api/orders/faction') return factionOrders.filter(order => visibleFaction(order) && matchesOrder(order, url));
  if (path === '/api/orders/faction/previous') return null;
  if (path === '/api/orders/general') return canViewGeneralOrders(previewUser) ? generalOrders.filter(order => matchesOrder(order, url)) : [];
  if (/^\/api\/orders\/faction\/[^/]+$/.test(path)) return factionOrders.find((order) => visibleFaction(order) && order.id === path.split('/')[4])
    ?? Response.json({ message: 'Order not visible to this role' }, { status: 403 });
  if (/^\/api\/orders\/general\/[^/]+$/.test(path)) return canViewGeneralOrders(previewUser) ? generalOrders.find(order => order.id === path.split('/')[4]) : Response.json({ message: 'Forbidden' }, { status: 403 });
  if (path === '/api/equipment-availability') return {};
  return [];
});
await initializeI18n();
setAppLanguage(params.get('lang') === 'de' ? 'de' : 'en');
setDevelopmentSession('dev:preview', previewUser);
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
subscribeToApiChanges(change => invalidateForApiChange(client, change));
createRoot(document.getElementById('root')!).render(<ThemeProvider theme={buildTheme('dark')}><CssBaseline /><LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={params.get('lang') === 'de' ? 'de' : 'en-gb'}><QueryClientProvider client={client}><MemoryRouter initialEntries={[initialView]}>
  <Box sx={{ p: 2, maxWidth: 1200 }}>
    <Typography variant="caption" color="text.secondary">Order preparation fixture</Typography>
    <Box component="label" sx={{ display: 'block', mb: 1 }}>Preview role: <select defaultValue={role} onChange={event => {
      const next = new URL(location.href); next.searchParams.set('role', event.target.value); location.assign(next.href);
    }}>{ROLE_LADDER.map(role => <option key={role} value={role}>{role}</option>)}</select></Box>
    <Stack direction="row" useFlexGap sx={{ mb: 2, gap: 2, flexWrap: 'wrap' }}><Link to="/orders/faction/order-tera">Preparing order</Link><Link to="/orders/faction/order-draft">Draft order</Link><Link to="/orders?tab=faction">Faction orders</Link><Link to="/orders?tab=general">General orders</Link><Link to="/operations">Warehouse tasks</Link></Stack>
    <Routes>
      <Route path="/orders/faction/:orderId" element={<FactionOrderDetail />} />
      <Route path="/orders" element={<Orders />} />
      <Route path="*" element={<Operations />} />
    </Routes>
  </Box>
</MemoryRouter></QueryClientProvider></LocalizationProvider></ThemeProvider>);
