import { Tab } from '../components/shared/ActionButtons';
import { Box, Paper, Tabs } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { GeneralOrders } from '../components/orders/GeneralOrders';
import { FactionOrders } from './FactionOrders';
import { translate, useLocalizedText } from '../utils/naming';

type OrderTab = 'general' | 'faction';

export function Orders() {
  const t = useLocalizedText();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: OrderTab = searchParams.get('tab') === 'general' ? 'general' : 'faction';

  return (
    <Box>
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_event, value: OrderTab) => setSearchParams({ tab: value })}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab title={translate('Allgemeine Bestellungen anzeigen', 'Display general orders')} value="general" label={t('Allgemeine Bestellungen', 'General orders')} />
          <Tab title={translate('Fraktionsbestellungen anzeigen', 'Display faction orders')} value="faction" label={t('Fraktionsbestellungen', 'Faction orders')} />
        </Tabs>
      </Paper>
      {tab === 'general' ? <GeneralOrders /> : <FactionOrders />}
    </Box>
  );
}
