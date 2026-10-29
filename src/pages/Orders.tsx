import { Tab } from '../components/shared/ActionButtons';
import { Box, Paper, Tabs } from '@mui/material';
import { Button } from '../components/shared/ActionButtons';
import { OrderPickupGroups } from '../components/orders/OrderPickupGroups';
import { useSearchParams } from 'react-router-dom';
import { GeneralOrders } from '../components/orders/GeneralOrders';
import { FactionOrders } from './FactionOrders';
import { useT } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canViewGeneralOrders } from '../utils/access';

type OrderTab = 'general' | 'faction';

export function Orders() {
  const t = useT();
  const { user } = useAuth();
  const showGeneralOrders = canViewGeneralOrders(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: OrderTab = showGeneralOrders && searchParams.get('tab') === 'general' ? 'general' : 'faction';
  const pickupOrder = searchParams.get('pickupOrder');
  const pickupKind = searchParams.get('pickupKind') === 'general' ? 'general' : 'faction';

  return (
    <Box>
      {pickupOrder && (pickupKind === 'faction' || showGeneralOrders) && <Paper sx={{ p: 2, mb: 3 }}>
        <OrderPickupGroups key={`${pickupKind}:${pickupOrder}`} kind={pickupKind} orderId={pickupOrder} />
        <Button onClick={() => setSearchParams({ tab: pickupKind })}>{t('pages.orders.backToOrderOverview')}</Button>
      </Paper>}
      <Paper sx={{ mb: 3, px: 1 }}>
        <Tabs
          value={tab}
          onChange={(_event, value: OrderTab) => setSearchParams({ tab: value })}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label={t('pages.orders.orderTypes')}
        >
          {showGeneralOrders && <Tab value="general" label={t('common.generalOrders')} id="orders-tab-general" aria-controls="orders-panel" />}
          <Tab value="faction" label={t('pages.orders.factionOrders')} id="orders-tab-faction" aria-controls="orders-panel" />
        </Tabs>
      </Paper>
      <Box id="orders-panel" role="tabpanel" aria-labelledby={`orders-tab-${tab}`}>
        {tab === 'general' ? <GeneralOrders /> : <FactionOrders />}
      </Box>
    </Box>
  );
}
