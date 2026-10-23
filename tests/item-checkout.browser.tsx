/* Interactive regression fixture: real item/checkout forms, unit payloads and assigned-person label. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Button, CssBaseline, Dialog, Stack, ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ItemForm } from '../src/components/forms/ItemForm';
import { TransactionForm } from '../src/components/forms/TransactionForm';
import { ItemResponsiblePerson } from '../src/components/items/ItemResponsiblePerson';
import { setDevelopmentSession } from '../src/services/authManager';
import { useNames } from '../src/utils/naming';
import { fixtureItem, fixtureLocation, fixtureStock, fixtureUser } from './fixtures/dto';
import { installFixtureApi } from './fixtures/api';
import '../src/i18n';

const depot = fixtureLocation({ id: 'depot', name: 'Depot', depth: 0 });
const location = fixtureLocation({ id: 'screws-location', name: 'Screws shelf', parentLocationId: depot.id, rootLocationId: depot.id, rootLocationName: depot.name });
// Checkout lists only the shelves holding the item: the empty shelf stays out.
const overflow = fixtureLocation({ id: 'overflow-location', name: 'Overflow shelf', parentLocationId: depot.id, rootLocationId: depot.id, rootLocationName: depot.name });
const empty = fixtureLocation({ id: 'empty-location', name: 'Empty shelf', parentLocationId: depot.id, rootLocationId: depot.id, rootLocationName: depot.name });
const locations = [depot, location, overflow, empty];
const position = (id: string, locationId: string, quantity: number) => ({ id, itemId: 'screws', itemName: 'Screws', locationId, quantityOnHand: quantity,
  quantityReserved: 0, quantityDamaged: 0, quantityQuarantined: 0, quantityInTransit: 0, availableQuantity: quantity, transferableQuantity: quantity });
const item = fixtureItem({ id: 'screws', name: 'Screws', containerSize: 200, containerCount: 5,
  containerRemainingCount: 37, stock: fixtureStock(1037), storageLocation: location.id });
// Ten full canisters; one earlier four-canister checkout can take unused contents back in 1% steps.
const diesel = fixtureItem({ id: 'diesel', name: 'Diesel', isConsumable: true, inventoryRole: 'consumable', unit: 'L', unitCapacity: 10, quantityDecimals: 2,
  stock: fixtureStock(1000), storageLocation: location.id });
installFixtureApi(({ url, path, method, body }) => {
  if (path === '/api/items') return [item, diesel];
  if (path === '/api/transactions/restockable') return [{ checkoutId: 'checkout-1', occurredAt: '2026-10-18T08:00:00Z', person: 'Matthias Schneider',
    event: 'Herbstspiel', faction: 'Logistik', issued: 400, restocked: 0 }];
  if (path === '/api/transactions/checkout-1/restock' && method === 'POST') return { id: 'restock-1', ...(body as object) };
  if (path === '/api/storage-locations') return locations;
  if (path === '/api/inventory-positions') return [position('p1', location.id, 1000), position('p2', overflow.id, 37),
    { ...position('p3', location.id, 1000), itemId: 'diesel', itemName: 'Diesel' }].filter((row) => row.itemId === url.searchParams.get('itemId'));
  // Structure save: a new top-level location with one section, as the server returns the saved tree.
  if (path === '/api/storage-locations/structure' && method === 'PUT') {
    const input = body as { name: string; sections: { name: string }[] };
    const root = fixtureLocation({ id: 'new-root', name: input.name, depth: 0 });
    return [root, ...input.sections.map((section, index) => fixtureLocation({ id: `new-section-${index}`, name: section.name,
      parentLocationId: root.id, rootLocationId: root.id, rootLocationName: root.name }))];
  }
  if (path === '/api/event-types') return ['LS'];
  if (path === '/api/equipment/availability') return {};
  if (path.includes('responsibility')) return { responsiblePersonId: 'preview', responsiblePersonName: 'Matthias Schneider' };
  if (path === '/api/users/assignable') return [{ ...fixtureUser('admin'), name: 'Matthias Schneider' }];
  return [];
});
setDevelopmentSession('dev:preview', fixtureUser('admin'));

export function Preview() {
  const names = useNames();
  const [creating, setCreating] = useState(true);
  const [result, setResult] = useState<unknown>(null);
  return <Box sx={{ p: 3 }}>
    <Stack spacing={2} sx={{ maxWidth: 600 }}>
      <Button onClick={() => setCreating(true)}>New item</Button>
      <ItemResponsiblePerson itemId="screws" canEdit />
      <TransactionForm items={[item]} preselectedItemId="screws"
        initialData={{ itemId: 'screws', transactionType: 'checkout', quantityChanged: 1, reason: names.reason.testing, notes: '', locationId: location.id }}
        onSubmit={setResult} />
      <TransactionForm items={[diesel]} preselectedItemId="diesel"
        initialData={{ itemId: 'diesel', transactionType: 'checkout', quantityChanged: 100, reason: names.reason.testing, notes: '' }}
        onSubmit={setResult} onRestock={setResult} />
      <Box component="pre" aria-label="Submitted payload" sx={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</Box>
    </Stack>
    <Dialog open={creating} fullWidth maxWidth="sm" onClose={() => setCreating(false)}>
      <ItemForm title="New item" categories={['Hardware']} storageLocations={locations}
        onCancel={() => setCreating(false)} onSubmit={data => { setResult(data); setCreating(false); }} />
    </Dialog>
  </Box>;
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}><CssBaseline />
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Preview />
    </QueryClientProvider>
  </ThemeProvider>,
);
