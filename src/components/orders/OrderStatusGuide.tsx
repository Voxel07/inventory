import { Alert } from '@mui/material';
import type { FactionOrderStatus } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { canOperateWarehouse, canTakeOut } from '../../utils/access';
import { useT } from '../../utils/naming';

export function OrderStatusGuide({ status, canEdit }: { status: FactionOrderStatus; canEdit: boolean }) {
  const t = useT();
  const { user } = useAuth();
  const warehouse = canOperateWarehouse(user);
  const messages = {
    draft: canEdit ? t('ordering.draftHelp') : t('ordering.draftReadOnlyHelp'),
    submitted: warehouse ? t('ordering.submittedWarehouseHelp') : t('ordering.submittedHelp'),
    preparing: warehouse ? t('ordering.preparingWarehouseHelp') : t('ordering.preparingHelp'),
    ready: canTakeOut(user) ? t('ordering.readyHelp') : t('ordering.readyReadOnlyHelp'),
    picked_up: warehouse ? t('ordering.returnWarehouseHelp') : t('ordering.pickedUpHelp'),
    partially_returned: t('ordering.partialReturnHelp'),
    returned: warehouse ? t('ordering.returnedWarehouseHelp') : t('ordering.returnedHelp'),
    closed: t('ordering.closedHelp'),
    cancelled: t('ordering.cancelledHelp'),
  };
  return <Alert severity={status === 'ready' ? 'success' : 'info'} sx={{ mb: 2 }}>{messages[status]}</Alert>;
}
