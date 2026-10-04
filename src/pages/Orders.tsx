import { Tab } from '../components/shared/ActionButtons';
import { Box, Paper, Tabs } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { GeneralOrders } from '../components/orders/GeneralOrders';
import { FactionOrders } from './FactionOrders';
import { useLocalizedText } from '../utils/naming';

type OrderTab = 'general' | 'faction';

export function Orders() {
  const t = useLocalizedText();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: OrderTab = searchParams.get('tab') === 'general' ? 'general' : 'faction';

  return (
    <Box>
      <Paper sx={{ mb: 3, px: 1 }}>
        <Tabs
          value={tab}
          onChange={(_event, value: OrderTab) => setSearchParams({ tab: value })}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label={t('Bestellarten', 'Order types')}
        >
          <Tab value="general" label={t('Allgemeine Bestellungen', 'General orders')} id="orders-tab-general" aria-controls="orders-panel" />
          <Tab value="faction" label={t('Fraktionsbestellungen', 'Faction orders')} id="orders-tab-faction" aria-controls="orders-panel" />
        </Tabs>
      </Paper>
      <Box id="orders-panel" role="tabpanel" aria-labelledby={`orders-tab-${tab}`}>
        {tab === 'general' ? <GeneralOrders /> : <FactionOrders />}
      </Box>
    </Box>
  );
}
