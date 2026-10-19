/* Local fixture preview of the grouped custody and assembly stock layouts. */
import { createRoot } from 'react-dom/client';
import { Box, CssBaseline, ThemeProvider, Typography, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { CheckedOutList } from '../src/components/lists/CheckedOutList';
import { AssembliesList } from '../src/components/lists/AssembliesList';
import { setDevelopmentSession } from '../src/services/authManager';
import type { MemberCustody } from '../src/types/member';
import { fixtureAssembly, fixtureItem, fixtureLocation, fixtureStock, fixtureUser } from './fixtures/dto';
import { byIds, installFixtureApi } from './fixtures/api';

const pallets = fixtureLocation({ id: 'pallets', name: 'Palettenlager' });
const componentNames = [
  'Bauzaunfuß Beton / Recycling 26kg',
  'Bauzaunschelle Verbindungsklammer Stahl',
  'Bauzaunbanner / Sichtschutz 3.5m x 2.0m blickdicht',
  'Mobilbauzaun 3.5m x 2.0m Stahl',
];
const quantities = [40, 20, 20, 20];
const items = componentNames.map((name, index) => fixtureItem({
  id: `item-${index + 1}`, name, category: 'Infrastruktur', minStock: 2, value: 12.5,
  storageLocation: pallets.id, expand: { storageLocation: pallets }, stock: fixtureStock(quantities[index]),
}));
const assembly = fixtureAssembly({
  id: 'assembly-1', name: 'Bauzaun', description: 'Komplettes Bauzaun-Set für die äußere Absperrung',
  itemQuantities: Object.fromEntries(items.map((item, index) => [item.id, [2, 1, 1, 1][index]])),
});
const rows: MemberCustody[] = items.map((item, index) => ({
  key: `${item.id}:person-1:order-1`, itemId: item.id, name: item.name, category: item.category, storageLocation: pallets.name,
  checkedOut: quantities[index], personId: 'person-1', person: 'matze', eventKey: 'LS:UCRF', event: 'LS · UCRF · LS26-UCRF-01',
  orderId: 'order-1', orderKind: 'faction',
}));

installFixtureApi(({ path, url }) => {
  if (path === '/api/items') return byIds(items, url);
  if (path === '/api/storage-locations') return [pallets];
  return [];
});
setDevelopmentSession('dev:preview', fixtureUser('admin'));
const theme = createTheme({
  components: { MuiTableCell: { styleOverrides: { head: { backgroundColor: '#0e0e0f', color: '#fff', fontWeight: 700 } } } },
});
const noMorePages = { hasNextPage: false, isFetchingNextPage: false, fetchNextPage: () => undefined };

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BrowserRouter>
        <Box sx={{ p: 2, width: '100%' }}>
          <Typography variant="h5" sx={{ mb: 1 }}>Checked-out layout</Typography>
          <CheckedOutList rows={rows} assemblies={[assembly]} showPerson linkToItem onQuickReturn={() => {}} />
          <Typography variant="h5" sx={{ mt: 4, mb: 1 }}>Assembly stock layout</Typography>
          <AssembliesList assemblies={[assembly]} search="" onSearch={() => {}} list={noMorePages} isLoading={false}
            onEdit={() => {}} onDelete={() => {}} onDeleteMany={() => {}} />
        </Box>
      </BrowserRouter>
    </QueryClientProvider>
  </ThemeProvider>,
);
