import { Box, Paper, Tab, Tabs } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { GeneralOrders } from '../components/orders/GeneralOrders';
import { FactionOrders } from './FactionOrders';
import { useTranslate } from '../utils/naming';

type OrderTab = 'general' | 'faction';

export function Orders() {
  const t = useTranslate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: OrderTab = searchParams.get('tab') === 'faction' ? 'faction' : 'general';

  return (
    <Box>
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_event, value: OrderTab) => setSearchParams(value === 'general' ? {} : { tab: value })}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab value="general" label={t('Allgemeine Bestellungen', 'General orders')} />
          <Tab value="faction" label={t('Fraktionsbestellungen', 'Faction orders')} />
        </Tabs>
      </Paper>
      {tab === 'general' ? <GeneralOrders /> : <FactionOrders />}
    </Box>
  );
}
