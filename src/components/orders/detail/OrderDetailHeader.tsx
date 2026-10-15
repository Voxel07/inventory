import { formatDate } from '../../../utils/dateFormat';
import { Button } from '../../shared/ActionButtons';
import { useAuth } from '../../../hooks/useAuth';
import { canOperateWarehouse, canPerformCustody, canTakeOut } from '../../../utils/access';
import {
  Alert,
  Box,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PrintIcon from '@mui/icons-material/Print';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ReplayIcon from '@mui/icons-material/Replay';
import SaveIcon from '@mui/icons-material/Save';
import { StorageLocationMap } from '../../maps/StorageLocationMap';
import type { FactionOrder, FactionOrderStatus, StorageLocation } from '../../../types';
import { translate, useT } from '../../../utils/naming';
import { apiFileUrl } from '../../../services/apiClient';

export interface OrderDetailHeaderProps {
  order: FactionOrder;
  orderItemsCount: number;
  orderAssembliesCount: number;
  requestedTotal: number;
  preparedTotal: number;
  progress: number;
  preparationComplete: boolean;
  pickupLocation?: StorageLocation;
  pickupLocationLabel: string;
  canEditOrder: boolean;
  canEditOrderContents: boolean;
  isManager: boolean;
  onBack: () => void;
  onEdit: () => void;
  onOpenQr: () => void;
  onPrintSlip: () => void;
  onSubmit: () => void;
  onStartPreparation: () => void;
  onFillAvailable: () => void;
  onSavePrepared: () => void;
  onMarkReady: () => void;
  onReopenPreparation: () => void;
  onPickUp: () => void;
  onOpenReturn: () => void;
  onCancel: () => void;
  isSavingPreparation: boolean;
  isSubmitting: boolean;
  isStartingPreparation: boolean;
  isReopeningPreparation: boolean;
}

function statusColor(status: FactionOrderStatus): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' {
  switch (status) {
    case 'draft': return 'default';
    case 'submitted': return 'info';
    case 'preparing': return 'warning';
    case 'ready': return 'primary';
    case 'picked_up': return 'secondary';
    case 'partially_returned': return 'warning';
    case 'returned':
    case 'closed': return 'success';
    case 'cancelled': return 'error';
    default: return 'default';
  }
}

export function OrderDetailHeader({
  order,
  orderItemsCount,
  orderAssembliesCount,
  requestedTotal,
  preparedTotal,
  progress,
  preparationComplete,
  pickupLocation,
  pickupLocationLabel,
  canEditOrder,
  canEditOrderContents,
  onBack,
  onEdit,
  onOpenQr,
  onPrintSlip,
  onSubmit,
  onStartPreparation,
  onFillAvailable,
  onSavePrepared,
  onMarkReady,
  onReopenPreparation,
  onPickUp,
  onOpenReturn,
  onCancel,
  isSavingPreparation,
  isSubmitting,
  isStartingPreparation,
  isReopeningPreparation,
}: OrderDetailHeaderProps) {
  const { user } = useAuth();
  const warehouse = canOperateWarehouse(user);
  const custody = canPerformCustody(user);
  const takeout = canTakeOut(user);
  // Faction leaders withdraw their lists before preparation starts; afterwards only the warehouse cancels.
  const canCancel = (canEditOrder && ['draft', 'submitted'].includes(order.status))
    || (warehouse && ['draft', 'submitted', 'preparing', 'ready'].includes(order.status));
  const t = useT();

  function statusLabel(status: FactionOrderStatus) {
    switch (status) {
      case 'draft': return t('enum.value.draft');
      case 'submitted': return t('enum.value.submitted');
      case 'preparing': return t('enum.value.preparing');
      case 'ready': return t('orders.detail.orderDetailHeader.readyForPickup');
      case 'picked_up': return t('enum.value.picked_up');
      case 'partially_returned': return t('enum.value.partially_returned');
      case 'returned': return t('enum.value.returned');
      case 'closed': return t('enum.value.closed');
      case 'cancelled': return t('enum.value.cancelled');
      default: return status;
    }
  }

  const usedLabel = ['picked_up', 'partially_returned', 'returned', 'closed'].includes(order.status);
  const workflowActions = <>
    {canEditOrder && order.status === 'draft' && (
      <Button title={translate('orders.detail.orderDetailHeader.submitTheRequestAsComplete')}
        size="small" variant="contained" startIcon={<CheckCircleIcon />} onClick={onSubmit} disabled={isSubmitting}>
        {t('orders.detail.orderDetailHeader.requestComplete')}
      </Button>
    )}
    {warehouse && order.status === 'submitted' && (
      <Button title={translate('orders.detail.orderDetailHeader.startPreparingThisOrderList')}
        size="small" variant="contained" startIcon={<PlayArrowIcon />} onClick={onStartPreparation} disabled={isStartingPreparation}>
        {t('orders.detail.orderDetailHeader.startPreparation')}
      </Button>
    )}
    {warehouse && order.status === 'preparing' && (
      <>
        <Button title={translate('orders.detail.orderDetailHeader.fillPreparedQuantitiesUsingAvailableStock')}
          size="small" variant="outlined" startIcon={<InventoryIcon />} onClick={onFillAvailable}>
          {t('orders.detail.orderDetailHeader.fillAvailable')}
        </Button>
        <Button title={translate('orders.detail.orderDetailHeader.saveThePreparedQuantities')}
          size="small" variant="contained" startIcon={<SaveIcon />} onClick={onSavePrepared} disabled={isSavingPreparation}>
          {t('common.save')}
        </Button>
        <Button title={translate('orders.detail.orderDetailHeader.chooseAPickupLocationAndMarkThisListReady')}
          size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />} disabled={!preparationComplete} onClick={onMarkReady}>
          {t('orders.detail.orderDetailHeader.markReady')}
        </Button>
      </>
    )}
    {takeout && order.status === 'ready' && (
      <>
        <Button title={translate('orders.detail.orderDetailHeader.reopenThisListForPreparation')}
          size="small" variant="outlined" startIcon={<ReplayIcon />} onClick={onReopenPreparation} disabled={isReopeningPreparation || !warehouse}>
          {t('orders.detail.orderDetailHeader.backToPreparation')}
        </Button>
        <Button title={translate('orders.detail.orderDetailHeader.recordPickupOfTheCompleteList')}
          size="small" variant="contained" color="success" startIcon={<LocalShippingIcon />} onClick={onPickUp}>
          {t('orders.detail.orderDetailHeader.pickUpCompleteList')}
        </Button>
      </>
    )}
    {custody && ['picked_up', 'partially_returned'].includes(order.status) && (
      <Button title={translate('orders.detail.orderDetailHeader.reviewReturnsForEachComponent')}
        size="small" variant="contained" startIcon={<ReplayIcon />} onClick={onOpenReturn}>
        {t('orders.detail.orderDetailHeader.reconcileComponentReturn')}
      </Button>
    )}
    {canCancel && (
      <Button title={translate('orders.detail.orderDetailHeader.reviewCancellationOfThisOrderList')}
        size="small" color="error" startIcon={<CancelIcon />} onClick={onCancel}>
        {t('orders.detail.orderDetailHeader.cancel')}
      </Button>
    )}
  </>;

  return (
    <>
      <Button title={translate('orders.detail.orderDetailHeader.returnToTheFactionOrderList')} size="small" startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 0.5 }}>
        {t('orders.detail.orderDetailHeader.allFactionLists')}
      </Button>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: { md: 'flex-start' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>{order.eventType === 'LS' ? 'LightSim' : order.eventType} · {order.faction}</Typography>
            <Chip size="small" color={statusColor(order.status)} label={statusLabel(order.status)} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{order.orderCode}</Box>
            {' · '}{formatDate(order.eventDate)} · {orderItemsCount + orderAssembliesCount} {t('orders.detail.orderDetailHeader.lines')} · {requestedTotal} {t('orders.detail.orderDetailHeader.listUnits')}
            {order.requestedPickupDate && <> · <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{t('common.requestedPickup')}: {formatDate(order.requestedPickupDate)}</Box></>}
            {order.status !== 'ready' && (order.pickupLocation || order.pickupLatitude != null) && <> · {t('common.pickupLocation')}: {pickupLocationLabel}</>}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', flexShrink: 0 }}>
          <Button title={translate('orders.detail.orderDetailHeader.displayTheQRCodeForThisOrderList')} size="small" variant="outlined" startIcon={<QrCode2Icon />} onClick={onOpenQr}>{t('orders.detail.orderDetailHeader.qR')}</Button>
          <Button title={translate('orders.detail.orderDetailHeader.downloadThePackingSlipAsPDF')} size="small" variant="outlined" startIcon={<PrintIcon />} onClick={onPrintSlip}>{t('orders.detail.orderDetailHeader.packingSlip')}</Button>
          {canEditOrderContents && <Button title={translate('orders.detail.orderDetailHeader.editTheItemsAndQuantitiesInThisOrderList')} size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>{t('common.edit')}</Button>}
        </Stack>
      </Stack>

      {/* Progress and the next workflow steps share one panel. */}
      <Paper variant="outlined" sx={{ px: 1.5, py: 1, mb: 1.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1, md: 2 }} sx={{ alignItems: { md: 'center' } }}>
          <Stack direction="row" spacing={1.5} sx={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
              {usedLabel ? t('common.used') : t('common.prepared')} {preparedTotal}/{requestedTotal}
            </Typography>
            <LinearProgress variant="determinate" value={progress} color={preparationComplete ? 'success' : 'primary'}
              aria-label={t('orders.detail.orderDetailHeader.preparationProgress')} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
          </Stack>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', flexShrink: 0 }}>{workflowActions}</Stack>
        </Stack>
        {order.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>{order.notes}</Typography>}
      </Paper>

      {order.status === 'ready' && (
        <Alert severity="success" icon={<LocationOnIcon />} sx={{ mb: 1.5, py: 0.25 }}>
          <strong>{t('orders.detail.orderDetailHeader.readyForPickup')}</strong> · {t('common.pickupLocation')}: <strong>{pickupLocationLabel}</strong>
        </Alert>
      )}

      {order.pickupLatitude != null && order.pickupLongitude != null && (
        <Paper sx={{ p: 1.5, mb: 2 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('orders.detail.orderDetailHeader.exactPickupPoint')}</Typography>
            <Button title={translate('orders.detail.orderDetailHeader.openThePickupLocationInGoogleMaps')}
              size="small"
              variant="outlined"
              startIcon={<OpenInNewIcon fontSize="small" />}
              href={`https://www.google.com/maps?q=${order.pickupLatitude},${order.pickupLongitude}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('orders.detail.orderDetailHeader.openInGoogleMaps')}
            </Button>
          </Stack>
          <StorageLocationMap
            compact
            kind="pickup"
            latitude={order.pickupLatitude}
            longitude={order.pickupLongitude}
            zoom={pickupLocation?.mapZoom}
            overlayBounds={pickupLocation?.overlayBounds}
            overlayUrl={apiFileUrl(pickupLocation?.mapOverlay)}
          />
        </Paper>
      )}
    </>
  );
}
