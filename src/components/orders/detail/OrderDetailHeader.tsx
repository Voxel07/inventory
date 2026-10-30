import { formatDate } from '../../../utils/dateFormat';
import { Button } from '../../shared/ActionButtons';
import { ActionBar, type Action } from '../../shared/ActionBar';
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
import { OrderStatusGuide } from '../OrderStatusGuide';

interface OrderDetailHeaderProps {
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
  /** Unused consumables back to stock; offered while some are still booked as consumed, also on completed orders. */
  onOpenRestock?: () => void;
  onCancel: () => void;
  onCloseOrder: () => void;
  isClosing: boolean;
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
  onOpenRestock,
  onCancel,
  onCloseOrder,
  isClosing,
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
  const workflowActions: (Action | false)[] = [
    canEditOrder && order.status === 'draft' && {
      key: 'submit', label: t('orders.detail.orderDetailHeader.requestComplete'), title: translate('orders.detail.orderDetailHeader.submitTheRequestAsComplete'),
      icon: <CheckCircleIcon />, variant: 'contained', pinned: true, disabled: isSubmitting, onClick: onSubmit,
    },
    warehouse && order.status === 'submitted' && {
      key: 'prepare', label: t('orders.detail.orderDetailHeader.startPreparation'), title: translate('orders.detail.orderDetailHeader.startPreparingThisOrderList'),
      icon: <PlayArrowIcon />, variant: 'contained', pinned: true, disabled: isStartingPreparation, onClick: onStartPreparation,
    },
    ...(warehouse && order.status === 'preparing' ? [
      { key: 'fill', label: t('orders.detail.orderDetailHeader.fillAvailable'), title: translate('orders.detail.orderDetailHeader.fillPreparedQuantitiesUsingAvailableStock'),
        icon: <InventoryIcon />, onClick: onFillAvailable },
      { key: 'save', label: t('common.save'), title: translate('orders.detail.orderDetailHeader.saveThePreparedQuantities'),
        icon: <SaveIcon />, variant: 'contained', pinned: true, disabled: isSavingPreparation, onClick: onSavePrepared },
      { key: 'ready', label: t('orders.detail.orderDetailHeader.markReady'), title: translate('orders.detail.orderDetailHeader.chooseAPickupLocationAndMarkThisListReady'),
        icon: <CheckCircleIcon />, variant: 'contained', color: 'success', disabled: !preparationComplete, onClick: onMarkReady },
    ] satisfies Action[] : []),
    ...(takeout && order.status === 'ready' ? [
      ...(warehouse ? [{ key: 'reopen', label: t('orders.detail.orderDetailHeader.backToPreparation'), title: translate('orders.detail.orderDetailHeader.reopenThisListForPreparation'),
        icon: <ReplayIcon />, disabled: isReopeningPreparation, onClick: onReopenPreparation }] : []),
      { key: 'pickup', label: t('orders.detail.orderDetailHeader.pickUpCompleteList'), title: translate('orders.detail.orderDetailHeader.recordPickupOfTheCompleteList'),
        icon: <LocalShippingIcon />, variant: 'contained', color: 'success', pinned: true, onClick: onPickUp },
    ] satisfies Action[] : []),
    custody && ['picked_up', 'partially_returned'].includes(order.status) && {
      key: 'return', label: t('orders.detail.orderDetailHeader.reconcileComponentReturn'), title: translate('orders.detail.orderDetailHeader.reviewReturnsForEachComponent'),
      icon: <ReplayIcon />, variant: 'contained', pinned: true, onClick: onOpenReturn,
    },
    custody && order.status === 'returned' && {
      key: 'close', label: t('ordering.closeOrder'), title: t('ordering.closeOrder'),
      icon: <CheckCircleIcon />, variant: 'contained', pinned: true, disabled: isClosing, onClick: onCloseOrder,
    },
    warehouse && !!onOpenRestock && ['picked_up', 'partially_returned', 'returned', 'closed'].includes(order.status) && {
      key: 'restock', label: t('orders.restockUnused.openRestock'), title: translate('orders.restockUnused.openRestockTitle'),
      icon: <ReplayIcon />, onClick: onOpenRestock,
    },
    canCancel && {
      key: 'cancel', label: t('orders.detail.orderDetailHeader.cancel'), title: translate('orders.detail.orderDetailHeader.reviewCancellationOfThisOrderList'),
      icon: <CancelIcon />, variant: 'text', color: 'error', onClick: onCancel,
    },
  ];

  return (
    <>
      <Button title={translate('orders.detail.orderDetailHeader.returnToTheFactionOrderList')} size="small" startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 0.5 }}>
        {t('orders.detail.orderDetailHeader.allFactionLists')}
      </Button>

      {/* On phones the document actions collapse next to the title instead of taking a row of their own. */}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ flex: '1 1 0', minWidth: 0 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>{order.eventType} · {order.faction}</Typography>
            <Chip size="small" color={statusColor(order.status)} label={statusLabel(order.status)} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{order.orderCode}</Box>
            {' · '}{formatDate(order.eventDate)} · {orderItemsCount + orderAssembliesCount} {t('orders.detail.orderDetailHeader.lines')} · {requestedTotal} {t('orders.detail.orderDetailHeader.listUnits')}
            {order.requestedPickupDate != null && <> · <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{t('common.requestedPickup')}: {formatDate(order.requestedPickupDate)}</Box></>}
            {order.status !== 'ready' && (order.pickupLocation || order.pickupLatitude != null) && <> · {t('common.pickupLocation')}: {pickupLocationLabel}</>}
          </Typography>
        </Box>
        <ActionBar size="small" align="end" sx={{ flex: { xs: '0 0 40px', md: '0 1 auto' } }} actions={[
          { key: 'qr', label: t('orders.detail.orderDetailHeader.qR'), title: translate('orders.detail.orderDetailHeader.displayTheQRCodeForThisOrderList'), icon: <QrCode2Icon />, onClick: onOpenQr },
          { key: 'slip', label: t('orders.detail.orderDetailHeader.packingSlip'), title: translate('orders.detail.orderDetailHeader.downloadThePackingSlipAsPDF'), icon: <PrintIcon />, onClick: onPrintSlip },
          canEditOrderContents && { key: 'edit', label: t('common.edit'), title: translate('orders.detail.orderDetailHeader.editTheItemsAndQuantitiesInThisOrderList'), icon: <EditIcon />, onClick: onEdit },
        ]} />
      </Stack>

      <OrderStatusGuide status={order.status} canEdit={canEditOrder} />
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
          <ActionBar size="small" actions={workflowActions} />
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
