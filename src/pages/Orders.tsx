import { Box, Paper, ToggleButtonGroup } from '@mui/material';
import { Button, ToggleButton } from '../components/shared/ActionButtons';
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
  // The order kind switch sits in the page header beside the "new" action instead of a tab row of its own.
  const kindSwitch = showGeneralOrders && <ToggleButtonGroup exclusive size="small" value={tab} aria-label={t('pages.orders.orderTypes')}
    onChange={(_event, value: OrderTab | null) => { if (value) setSearchParams({ tab: value }); }}
    sx={{ '& .MuiToggleButton-root': { whiteSpace: 'nowrap', px: 1.25 } }}>
    <ToggleButton value="general">{t('pages.orders.general')}</ToggleButton>
    <ToggleButton value="faction">{t('pages.orders.factions')}</ToggleButton>
  </ToggleButtonGroup>;

  return (
    <Box>
      {pickupOrder && (pickupKind === 'faction' || showGeneralOrders) && <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 3 }}>
        <OrderPickupGroups key={`${pickupKind}:${pickupOrder}`} kind={pickupKind} orderId={pickupOrder} />
        <Button onClick={() => setSearchParams({ tab: pickupKind })}>{t('pages.orders.backToOrderOverview')}</Button>
      </Paper>}
      {tab === 'general' ? <GeneralOrders kindSwitch={kindSwitch} /> : <FactionOrders kindSwitch={kindSwitch} />}
    </Box>
  );
}
