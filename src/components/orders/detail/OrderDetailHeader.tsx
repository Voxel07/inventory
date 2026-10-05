import { formatDate } from '../../../utils/dateFormat';
import { Button } from '../../shared/ActionButtons';
import { useAuth } from '../../../hooks/useAuth';
import { canOperateWarehouse, canPerformCustody, canAccessProcurement } from '../../../utils/access';
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
import { translate, useLocalizedText } from '../../../utils/naming';
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
  const planner = canAccessProcurement(user);
  const t = useLocalizedText();

  function statusLabel(status: FactionOrderStatus) {
    switch (status) {
      case 'draft': return t('Entwurf', 'Draft');
      case 'submitted': return t('Eingereicht', 'Submitted');
      case 'preparing': return t('In Vorbereitung', 'Preparing');
      case 'ready': return t('Abholbereit', 'Ready for pickup');
      case 'picked_up': return t('Abgeholt', 'Picked up');
      case 'partially_returned': return t('Teilweise zurückgegeben', 'Partially returned');
      case 'returned': return t('Zurückgegeben', 'Returned');
      case 'closed': return t('Abgeschlossen', 'Closed');
      case 'cancelled': return t('Storniert', 'Cancelled');
      default: return status;
    }
  }

  const usedLabel = ['picked_up', 'partially_returned', 'returned', 'closed'].includes(order.status);
  const workflowActions = <>
    {canEditOrder && order.status === 'draft' && (
      <Button title={translate('Den Bedarf als vollständig einreichen', 'Submit the request as complete')}
        size="small" variant="contained" startIcon={<CheckCircleIcon />} onClick={onSubmit} disabled={isSubmitting}>
        {t('Bedarf vollständig', 'Request complete')}
      </Button>
    )}
    {warehouse && order.status === 'submitted' && (
      <Button title={translate('Mit der Vorbereitung dieser Bestellliste beginnen', 'Start preparing this order list')}
        size="small" variant="contained" startIcon={<PlayArrowIcon />} onClick={onStartPreparation} disabled={isStartingPreparation}>
        {t('Vorbereitung starten', 'Start preparation')}
      </Button>
    )}
    {warehouse && order.status === 'preparing' && (
      <>
        <Button title={translate('Vorbereitete Mengen mit verfügbarem Bestand auffüllen', 'Fill prepared quantities using available stock')}
          size="small" variant="outlined" startIcon={<InventoryIcon />} onClick={onFillAvailable}>
          {t('Verfügbare füllen', 'Fill available')}
        </Button>
        <Button title={translate('Die vorbereiteten Mengen speichern', 'Save the prepared quantities')}
          size="small" variant="contained" startIcon={<SaveIcon />} onClick={onSavePrepared} disabled={isSavingPreparation}>
          {t('Speichern', 'Save')}
        </Button>
        <Button title={translate('Abholort wählen und die Liste abholbereit melden', 'Choose a pickup location and mark this list ready')}
          size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />} disabled={!preparationComplete} onClick={onMarkReady}>
          {t('Abholbereit', 'Mark ready')}
        </Button>
      </>
    )}
    {(warehouse || custody) && order.status === 'ready' && (
      <>
        <Button title={translate('Die Liste erneut zur Vorbereitung öffnen', 'Reopen this list for preparation')}
          size="small" variant="outlined" startIcon={<ReplayIcon />} onClick={onReopenPreparation} disabled={isReopeningPreparation || !warehouse}>
          {t('Zurück in Vorbereitung', 'Back to preparation')}
        </Button>
        <Button title={translate('Die vollständige Liste als abgeholt buchen', 'Record pickup of the complete list')}
          size="small" variant="contained" color="success" startIcon={<LocalShippingIcon />} onClick={onPickUp} disabled={!custody}>
          {t('Komplette Liste abholen', 'Pick up complete list')}
        </Button>
      </>
    )}
    {custody && ['picked_up', 'partially_returned'].includes(order.status) && (
      <Button title={translate('Die Rückgaben der einzelnen Komponenten prüfen', 'Review returns for each component')}
        size="small" variant="contained" startIcon={<ReplayIcon />} onClick={onOpenReturn}>
        {t('Komponenten-Rückgabe prüfen', 'Reconcile component return')}
      </Button>
    )}
    {planner && ['draft', 'submitted', 'preparing', 'ready'].includes(order.status) && (
      <Button title={translate('Die Stornierung dieser Bestellliste bestätigen', 'Review cancellation of this order list')}
        size="small" color="error" startIcon={<CancelIcon />} onClick={onCancel}>
        {t('Stornieren', 'Cancel')}
      </Button>
    )}
  </>;

  return (
    <>
      <Button title={translate('Zur Übersicht der Fraktionslisten zurückkehren', 'Return to the faction order list')} size="small" startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 0.5 }}>
        {t('Alle Fraktionslisten', 'All faction lists')}
      </Button>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: { md: 'flex-start' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>{order.eventType === 'LS' ? 'LightSim' : order.eventType} · {order.faction}</Typography>
            <Chip size="small" color={statusColor(order.status)} label={statusLabel(order.status)} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{order.orderCode}</Box>
            {' · '}{formatDate(order.eventDate)} · {orderItemsCount + orderAssembliesCount} {t('Positionen', 'lines')} · {requestedTotal} {t('Listeneinheiten', 'list units')}
            {order.requestedPickupDate && <> · <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{t('Gewünschte Abholung', 'Requested pickup')}: {formatDate(order.requestedPickupDate)}</Box></>}
            {order.status !== 'ready' && (order.pickupLocation || order.pickupLatitude != null) && <> · {t('Abholort', 'Pickup location')}: {pickupLocationLabel}</>}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', flexShrink: 0 }}>
          <Button title={translate('Den QR-Code dieser Bestellliste anzeigen', 'Display the QR code for this order list')} size="small" variant="outlined" startIcon={<QrCode2Icon />} onClick={onOpenQr}>{t('QR', 'QR')}</Button>
          <Button title={translate('Den Kommissionierschein als PDF herunterladen', 'Download the packing slip as PDF')} size="small" variant="outlined" startIcon={<PrintIcon />} onClick={onPrintSlip}>{t('Kommissionierschein', 'Packing slip')}</Button>
          {canEditOrderContents && <Button title={translate('Artikel und Mengen dieser Bestellliste bearbeiten', 'Edit the items and quantities in this order list')} size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>{t('Bearbeiten', 'Edit')}</Button>}
        </Stack>
      </Stack>

      {/* Progress and the next workflow steps share one panel. */}
      <Paper variant="outlined" sx={{ px: 1.5, py: 1, mb: 1.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1, md: 2 }} sx={{ alignItems: { md: 'center' } }}>
          <Stack direction="row" spacing={1.5} sx={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
              {usedLabel ? t('Verwendet', 'Used') : t('Vorbereitet', 'Prepared')} {preparedTotal}/{requestedTotal}
            </Typography>
            <LinearProgress variant="determinate" value={progress} color={preparationComplete ? 'success' : 'primary'}
              aria-label={t('Vorbereitungsfortschritt', 'Preparation progress')} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
          </Stack>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', flexShrink: 0 }}>{workflowActions}</Stack>
        </Stack>
        {order.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>{order.notes}</Typography>}
      </Paper>

      {order.status === 'ready' && (
        <Alert severity="success" icon={<LocationOnIcon />} sx={{ mb: 1.5, py: 0.25 }}>
          <strong>{t('Abholbereit', 'Ready for pickup')}</strong> · {t('Abholort', 'Pickup location')}: <strong>{pickupLocationLabel}</strong>
        </Alert>
      )}

      {order.pickupLatitude != null && order.pickupLongitude != null && (
        <Paper sx={{ p: 1.5, mb: 2 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('Genauer Abholpunkt', 'Exact pickup point')}</Typography>
            <Button title={translate('Den Abholort in Google Maps öffnen', 'Open the pickup location in Google Maps')}
              size="small"
              variant="outlined"
              startIcon={<OpenInNewIcon fontSize="small" />}
              href={`https://www.google.com/maps?q=${order.pickupLatitude},${order.pickupLongitude}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('In Google Maps öffnen', 'Open in Google Maps')}
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
