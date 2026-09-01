import { useEffect } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import {
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import type { MapBounds } from '../../types';
import { useTranslate } from '../../utils/naming';

const DEFAULT_CENTER = [52.375953, 11.826278] as const;
const DEFAULT_ZOOM = 19;
type Coordinate = [number, number];

function ViewSync({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, map, zoom]);
  return null;
}

function ClickHandler({ onSelect }: { onSelect?: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click: (event) => onSelect?.(event.latlng.lat, event.latlng.lng),
  });
  return null;
}

function derivedBounds(center: Coordinate): MapBounds {
  const span = 0.0015;
  return [
    [center[0] - span, center[1] - span],
    [center[0] + span, center[1] + span],
  ];
}

interface Props {
  latitude?: number;
  longitude?: number;
  zoom?: number;
  overlayUrl?: string;
  overlayBounds?: MapBounds;
  editable?: boolean;
  onCenterChange?: (latitude: number, longitude: number) => void;
}

export function StorageLocationMap({
  latitude,
  longitude,
  zoom = DEFAULT_ZOOM,
  overlayUrl,
  overlayBounds,
  editable = false,
  onCenterChange,
}: Props) {
  const t = useTranslate();
  const center: Coordinate = [latitude ?? DEFAULT_CENTER[0], longitude ?? DEFAULT_CENTER[1]];
  const bounds = (overlayBounds ?? derivedBounds(center)) as LatLngBoundsExpression;
  const effectiveZoom = Math.max(zoom, DEFAULT_ZOOM);

  return (
    <Stack spacing={1.5}>
      {editable && (
        <Typography variant="body2" color="text.secondary">
          {t('Klicken Sie auf die Karte, um den Lagerort zu setzen.', 'Click the map to set the storage location.')}
        </Typography>
      )}
      <Box sx={{ height: { xs: 320, md: 420 }, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
        <MapContainer center={center} zoom={effectiveZoom} style={{ width: '100%', height: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ViewSync center={center} zoom={effectiveZoom} />
          <ClickHandler onSelect={editable ? onCenterChange : undefined} />
          {overlayUrl && <ImageOverlay url={overlayUrl} bounds={bounds} opacity={0.62} />}
          <CircleMarker center={center} radius={9} pathOptions={{ color: '#ffffff', fillColor: '#e30613', fillOpacity: 1, weight: 2 }}>
            <Popup>{t('Lagerort', 'Storage location')}</Popup>
          </CircleMarker>
        </MapContainer>
      </Box>
    </Stack>
  );
}
