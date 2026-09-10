import {
  Alert,
  Box,
  Button,
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
import { useAppLanguage, useLocalizedText } from '../../../utils/naming';
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
  isManager,
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
  const t = useLocalizedText();
  const language = useAppLanguage();

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

  return (
    <>
      <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 1 }}>
        {t('Alle Fraktionslisten', 'All faction lists')}
      </Button>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2, justifyContent: 'space-between' }}>
        <Box>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h4">{order.eventType === 'LS' ? 'LightSim' : order.eventType} · {order.faction}</Typography>
            <Chip color={statusColor(order.status)} label={statusLabel(order.status)} />
          </Stack>
          <Typography color="text.secondary">
            {new Date(order.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')} · {orderItemsCount + orderAssembliesCount} {t('Positionen', 'lines')} · {requestedTotal} {t('Listeneinheiten', 'list units')}
          </Typography>
          {order.requestedPickupDate && (
            <Typography sx={{ fontWeight: 700, mt: 0.5 }}>
              {t('Gewünschte Abholung', 'Requested pickup')}: {new Date(order.requestedPickupDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}
            </Typography>
          )}
          <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, mt: 0.5 }}>{order.orderCode}</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignSelf: { xs: 'stretch', md: 'flex-start' } }}>
          <Button variant="outlined" startIcon={<QrCode2Icon />} onClick={onOpenQr}>{t('Listen-QR', 'List QR')}</Button>
          <Button variant="outlined" startIcon={<PrintIcon />} onClick={onPrintSlip}>{t('Kommissionierschein PDF', 'Packing slip PDF')}</Button>
          {canEditOrderContents && <Button variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>{t('Bearbeiten', 'Edit')}</Button>}
        </Stack>
      </Stack>

      {/* Action Buttons Panel */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {canEditOrder && order.status === 'draft' && (
            <Button
              variant="contained"
              startIcon={<CheckCircleIcon />}
              onClick={onSubmit}
              disabled={isSubmitting}
            >
              {t('Bedarf vollständig', 'Request complete')}
            </Button>
          )}
          {isManager && order.status === 'submitted' && (
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={onStartPreparation}
              disabled={isStartingPreparation}
            >
              {t('Vorbereitung starten', 'Start preparation')}
            </Button>
          )}
          {isManager && order.status === 'preparing' && (
            <>
              <Button variant="outlined" startIcon={<InventoryIcon />} onClick={onFillAvailable}>
                {t('Verfügbare Mengen füllen', 'Fill available amounts')}
              </Button>
              <Button variant="contained" startIcon={<SaveIcon />} onClick={onSavePrepared} disabled={isSavingPreparation}>
                {t('Fortschritt speichern', 'Save progress')}
              </Button>
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleIcon />}
                disabled={!preparationComplete}
                onClick={onMarkReady}
              >
                {t('Abholbereit', 'Mark ready')}
              </Button>
            </>
          )}
          {isManager && order.status === 'ready' && (
            <>
              <Button
                variant="outlined"
                startIcon={<ReplayIcon />}
                onClick={onReopenPreparation}
                disabled={isReopeningPreparation}
              >
                {t('Zurück in Vorbereitung', 'Back to preparation')}
              </Button>
              <Button variant="contained" color="success" size="large" startIcon={<LocalShippingIcon />} onClick={onPickUp}>
                {t('Komplette Liste abholen', 'Pick up complete list')}
              </Button>
            </>
          )}
          {isManager && ['picked_up', 'partially_returned'].includes(order.status) && (
            <Button variant="contained" size="large" startIcon={<ReplayIcon />} onClick={onOpenReturn}>
              {t('Komponenten-Rückgabe prüfen', 'Reconcile component return')}
            </Button>
          )}
          {isManager && ['draft', 'submitted', 'preparing', 'ready'].includes(order.status) && (
            <Button color="error" startIcon={<CancelIcon />} onClick={onCancel} sx={{ ml: { sm: 'auto' } }}>
              {t('Stornieren', 'Cancel')}
            </Button>
          )}
        </Stack>
      </Paper>

      {order.status === 'ready' && (
        <Alert severity="success" icon={<LocationOnIcon />} sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 800 }}>{t('Diese Bestellung kann abgeholt werden.', 'This order is ready for pickup.')}</Typography>
          <Typography variant="body2">{t('Abholort', 'Pickup location')}: <strong>{pickupLocationLabel}</strong></Typography>
        </Alert>
      )}

      {order.status !== 'ready' && (order.pickupLocation || order.pickupLatitude != null) && (
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {t('Abholort', 'Pickup location')}: <strong>{pickupLocationLabel}</strong>
        </Typography>
      )}

      {order.pickupLatitude != null && order.pickupLongitude != null && (
        <Paper sx={{ p: 1.5, mb: 2 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="h6">{t('Genauer Abholpunkt', 'Exact pickup point')}</Typography>
            <Button
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

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" sx={{ mb: 1, justifyContent: 'space-between' }}>
          <Typography sx={{ fontWeight: 700 }}>
            {['picked_up', 'returned'].includes(order.status) ? t('Tatsächlich verwendet', 'Actually used') : t('Vorbereitung', 'Preparation')}
          </Typography>
          <Typography>{preparedTotal}/{requestedTotal}</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={progress} color={preparationComplete ? 'success' : 'primary'} sx={{ height: 10, borderRadius: 5 }} />
        {order.notes && <Typography sx={{ mt: 2 }}>{order.notes}</Typography>}
      </Paper>
    </>
  );
}
