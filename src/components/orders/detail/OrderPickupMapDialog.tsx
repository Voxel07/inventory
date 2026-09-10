import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { StorageLocationMap } from '../../maps/StorageLocationMap';
import type { StorageLocation } from '../../../types';
import { useLocalizedText } from '../../../utils/naming';
import { apiFileUrl } from '../../../services/apiClient';

export interface OrderPickupMapDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm?: (args: {
    pickupLocation: string;
    pickupLatitude?: number;
    pickupLongitude?: number;
    notes?: string;
  }) => void;
  initialLocationId?: string;
  initialLatitude?: number;
  initialLongitude?: number;
  storageLocations: StorageLocation[];
  isTransitionMode?: boolean;
  isConfirming?: boolean;
}

export function OrderPickupMapDialog({
  open,
  onClose,
  onConfirm,
  initialLocationId = '',
  initialLatitude,
  initialLongitude,
  storageLocations,
  isTransitionMode = false,
  isConfirming = false,
}: OrderPickupMapDialogProps) {
  const t = useLocalizedText();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [locationId, setLocationId] = useState(initialLocationId);
  const [latitude, setLatitude] = useState<number | undefined>(initialLatitude);
  const [longitude, setLongitude] = useState<number | undefined>(initialLongitude);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setLocationId(initialLocationId);
    setLatitude(initialLatitude);
    setLongitude(initialLongitude);
    setNotes('');
  }, [initialLocationId, initialLatitude, initialLongitude, open]);

  const selectedLocation = storageLocations.find((loc) => loc.id === locationId);

  const handleSelectLocation = (id: string) => {
    setLocationId(id);
    const found = storageLocations.find((loc) => loc.id === id);
    if (found?.latitude != null && found?.longitude != null) {
      setLatitude(found.latitude);
      setLongitude(found.longitude);
    }
  };


  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LocationOnIcon color="primary" />
        {isTransitionMode
          ? t('Bereitstellung abschließen & Abholort festlegen', 'Complete preparation & set pickup location')
          : t('Abholort auf der Karte', 'Pickup location on map')}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {isTransitionMode && (
          <FormControl fullWidth>
            <InputLabel id="pickup-loc-select-label">
              {t('Übergabeort / Lagerort auswählen', 'Select handover / storage location')}
            </InputLabel>
            <Select
              labelId="pickup-loc-select-label"
              value={locationId}
              label={t('Übergabeort / Lagerort auswählen', 'Select handover / storage location')}
              onChange={(e) => handleSelectLocation(e.target.value)}
            >
              <MenuItem value="">
                <em>{t('Kein fester Lagerort gewählt', 'No fixed location selected')}</em>
              </MenuItem>
              {storageLocations.map((loc) => (
                <MenuItem key={loc.id} value={loc.id}>
                  {[loc.name, loc.area, loc.location, loc.position].filter(Boolean).join(' · ')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <Box sx={{ height: 350, width: '100%', borderRadius: 1, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
          <StorageLocationMap
            latitude={latitude ?? selectedLocation?.latitude}
            longitude={longitude ?? selectedLocation?.longitude}
            zoom={selectedLocation?.mapZoom ?? 16}
            overlayUrl={selectedLocation?.mapOverlay ? apiFileUrl(selectedLocation.mapOverlay) : undefined}
            overlayBounds={selectedLocation?.overlayBounds}
            onCenterChange={isTransitionMode ? (lat, lng) => { setLatitude(lat); setLongitude(lng); } : undefined}
            editable={isTransitionMode}
            kind="pickup"
          />
        </Box>

        {latitude != null && longitude != null && (
          <Typography variant="caption" color="text.secondary">
            {t('Ausgewählte GPS-Koordinaten', 'Selected GPS coordinates')}: {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </Typography>
        )}

        {isTransitionMode && (
          <TextField
            label={t('Hinweis zur Übergabe / Bereitstellung (optional)', 'Handover / staging notes (optional)')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
            fullWidth
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Schließen', 'Close')}</Button>
        {isTransitionMode && onConfirm && (
          <Button
            variant="contained"
            color="success"
            disabled={isConfirming}
            onClick={() =>
              onConfirm({
                pickupLocation: locationId,
                pickupLatitude: latitude,
                pickupLongitude: longitude,
                notes: notes.trim() || undefined,
              })
            }
          >
            {t('Bereit melden', 'Mark ready')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
