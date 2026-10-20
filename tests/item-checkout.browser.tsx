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

const location = fixtureLocation({ id: 'screws-location', name: 'Screws shelf' });
const item = fixtureItem({ id: 'screws', name: 'Screws', containerSize: 200, containerCount: 5,
  containerRemainingCount: 37, stock: fixtureStock(1037), storageLocation: location.id });
installFixtureApi(({ path }) => {
  if (path === '/api/items') return [item];
  if (path === '/api/storage-locations') return [location];
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
      <Box component="pre" aria-label="Submitted payload" sx={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</Box>
    </Stack>
    <Dialog open={creating} fullWidth maxWidth="sm" onClose={() => setCreating(false)}>
      <ItemForm title="New item" categories={['Hardware']} storageLocations={[location]}
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
