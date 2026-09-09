import React from 'react';
import { createRoot } from 'react-dom/client';
import { Box, CssBaseline, ThemeProvider, Typography, createTheme } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import { CheckedOutList } from '/src/components/lists/CheckedOutList.tsx';
import { AssembliesList } from '/src/components/lists/AssembliesList.tsx';

const now = new Date().toISOString();
const componentNames = [
  'Bauzaunfuß Beton / Recycling 26kg',
  'Bauzaunschelle Verbindungsklammer Stahl',
  'Bauzaunbanner / Sichtschutz 3.5m x 2.0m blickdicht',
  'Mobilbauzaun 3.5m x 2.0m Stahl',
];
const items = componentNames.map((name, index) => ({
  id: `item-${index + 1}`,
  name,
  category: 'Infrastruktur',
  amount: [40, 20, 20, 20][index],
  minStock: 2,
  value: 12.5,
  storageLocation: 'Palettenlager',
  status: 'available',
  created: now,
  updated: now,
}));
const assembly = {
  id: 'assembly-1',
  name: 'Bauzaun',
  description: 'Komplettes Bauzaun-Set für die äußere Absperrung',
  itemIds: items.map((item) => item.id),
  itemQuantities: Object.fromEntries(items.map((item, index) => [item.id, [2, 1, 1, 1][index]])),
  created: now,
  updated: now,
};
const rows = items.map((item, index) => ({
  key: `${item.id}:person-1:order-1`,
  itemId: item.id,
  name: item.name,
  category: item.category,
  storageLocation: item.storageLocation,
  checkedOut: [40, 20, 20, 20][index],
  personId: 'person-1',
  person: 'matze',
  eventKey: 'LS:UCRF',
  event: 'LS · UCRF · LS26-UCRF-01',
  factionOrderId: 'order-1',
}));
const transactions = items.map((item) => ({
  id: `stock-${item.id}`,
  itemId: item.id,
  transactionType: 'added',
  quantityChanged: item.amount,
  userId: 'person-1',
  reason: 'Initial stock',
  notes: '',
  timestamp: now,
  created: now,
  updated: now,
}));
const theme = createTheme({
  components: {
    MuiTableCell: {
      styleOverrides: {
        head: { backgroundColor: '#0e0e0f', color: '#fff', fontWeight: 700 },
      },
    },
  },
});

createRoot(document.getElementById('root')).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <BrowserRouter>
      <Box sx={{ p: 2, width: '100%' }}>
        <Typography variant="h5" sx={{ mb: 1 }}>Checked-out layout</Typography>
        <CheckedOutList rows={rows} assemblies={[assembly]} showPerson linkToItem onQuickReturn={() => {}} />
        <Typography variant="h5" sx={{ mt: 4, mb: 1 }}>Assembly stock layout</Typography>
        <AssembliesList
          assemblies={[assembly]}
          items={items}
          transactions={transactions}
          damageReports={[]}
          isLoading={false}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </Box>
    </BrowserRouter>
  </ThemeProvider>,
);
