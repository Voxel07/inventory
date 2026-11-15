import { Button } from '../shared/ActionButtons';
import { useEffect, useRef, useState } from 'react';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import { Box, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import CheckIcon from '@mui/icons-material/Check';
import { CircleMarker, ImageOverlay, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { DomEvent, divIcon, latLngBounds, type LatLngBoundsExpression } from 'leaflet';
import type { MapBounds } from '../../types';
import { translate, useT } from '../../utils/naming';
import { SITE_CENTER, SITE_ZOOM } from './storageMapDefaults';

type Coordinate = [number, number];
const OUTLINE_CLOSE_RADIUS_PX = 12;
export interface StorageMapFeature {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  mapOutline?: Coordinate[];
}
const handleIcon = divIcon({ className: '', html: '<div style="width:14px;height:14px;background:white;border:3px solid #1976d2;border-radius:50%;box-sizing:border-box;box-shadow:0 1px 4px #0005"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });

function MapControls({ latitude, longitude, zoom, canDrag, onZoomChange }: {
  latitude: number; longitude: number; zoom: number; canDrag: boolean; onZoomChange?: (zoom: number) => void;
}) {
  const map = useMap();
  useEffect(() => { map.panTo([latitude, longitude], { animate: false }); }, [latitude, longitude, map]);
  useEffect(() => { if (map.getZoom() !== zoom) map.setZoom(zoom, { animate: false }); }, [map, zoom]);
  useEffect(() => {
    if (canDrag) map.dragging.enable(); else map.dragging.disable();
  }, [canDrag, map]);
  useEffect(() => {
    const container = map.getContainer();
    // Capture Ctrl+wheel before the browser turns it into page zoom. Normal wheel scrolls the form.
    let wheelDelta = 0;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaMode === 1 ? event.deltaY * 20 : event.deltaY;
      wheelDelta += delta;
      if (Math.abs(wheelDelta) < 40) return;
      map.setZoomAround(map.mouseEventToContainerPoint(event),
        Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() - Math.sign(wheelDelta))), { animate: false });
      wheelDelta = 0;
    };
    container.addEventListener('wheel', wheel, { passive: false, capture: true });
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => { container.removeEventListener('wheel', wheel, true); observer.disconnect(); };
  }, [map]);
  useMapEvents({ zoomend: () => onZoomChange?.(map.getZoom()) });
  return null;
}

function MapActions({ features }: { features: StorageMapFeature[] }) {
  const map = useMap();
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (containerRef.current) DomEvent.disableClickPropagation(containerRef.current);
  }, []);
  return <Box ref={containerRef} sx={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', gap: 1 }}>
    <Button size="small" variant="contained" onClick={() => {
      const points = features.flatMap((feature) => feature.mapOutline?.length ? feature.mapOutline
        : feature.latitude != null && feature.longitude != null ? [[feature.latitude, feature.longitude] as Coordinate] : []);
      if (points.length) map.fitBounds(latLngBounds(points), { padding: [32, 32], maxZoom: 20 });
      else map.setView(SITE_CENTER, SITE_ZOOM);
    }}>{t('maps.storageLocationMap.showAll')}</Button>
    <Button size="small" variant="contained" onClick={() => map.setZoom(20)}>{t('maps.storageLocationMap.closeView')}</Button>
  </Box>;
}

function ClickHandler({ onSelect, outlineStart, onCloseOutline }: {
  onSelect?: (latitude: number, longitude: number) => void;
  outlineStart?: Coordinate;
  onCloseOutline?: () => void;
}) {
  const map = useMap();
  useMapEvents({ click: (event) => {
    // Screen distance keeps snapping equally easy at every zoom level.
    if (outlineStart && onCloseOutline
      && map.latLngToContainerPoint(outlineStart).distanceTo(event.containerPoint) <= OUTLINE_CLOSE_RADIUS_PX) {
      onCloseOutline();
      return;
    }
    onSelect?.(event.latlng.lat, event.latlng.lng);
  } });
  return null;
}

interface Props {
  latitude?: number;
  longitude?: number;
  zoom?: number;
  overlayUrl?: string;
  overlayBounds?: MapBounds;
  editable?: boolean;
  onCenterChange?: (latitude: number, longitude: number) => void;
  onZoomChange?: (zoom: number) => void;
  outline?: Coordinate[];
  onOutlineChange?: (outline: Coordinate[] | undefined) => void;
  features?: StorageMapFeature[];
  selectedId?: string;
  onFeatureSelect?: (id: string) => void;
  kind?: 'storage' | 'pickup';
  compact?: boolean;
  tall?: boolean;
  showPoint?: boolean;
  onDrawingChange?: (drawing: boolean) => void;
}

export function StorageLocationMap({ latitude, longitude, zoom = SITE_ZOOM, overlayUrl, overlayBounds, editable = false,
  onCenterChange, onZoomChange, outline, onOutlineChange, features = [], selectedId, onFeatureSelect, kind = 'storage', compact = false, tall = false, showPoint = true, onDrawingChange }: Props) {
  const t = useT();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [touchActive, setTouchActive] = useState(false);
  const [tool, setTool] = useState<'pan' | 'point' | 'outline'>('pan');
  const [draft, setDraft] = useState<Coordinate[]>([]);
  const resolvedOverlayUrl = useMediaUrl(overlayUrl);
  const center: Coordinate = [latitude ?? SITE_CENTER[0], longitude ?? SITE_CENTER[1]];
  const bounds = (overlayBounds ?? [[center[0] - 0.0015, center[1] - 0.0015], [center[0] + 0.0015, center[1] + 0.0015]]) as LatLngBoundsExpression;
  const canDrag = editable || !isMobile || touchActive;
  const canOutline = Boolean(onOutlineChange);
  const hasPoint = showPoint && latitude != null && longitude != null;
  const chooseTool = (next: 'pan' | 'point' | 'outline') => { setTool(next); setDraft([]); onDrawingChange?.(next === 'outline'); };
  const chooseFeature = (id: string) => { chooseTool('pan'); onFeatureSelect?.(id); };

  function finishOutline() {
    if (draft.length < 3) return;
    onOutlineChange?.(draft);
    const bounds = latLngBounds(draft);
    const middle = bounds.getCenter();
    onCenterChange?.(middle.lat, middle.lng);
    chooseTool('pan');
  }

  return <Stack spacing={1} onKeyDown={(event) => {
    if (event.key === 'Escape' && tool !== 'pan') { event.stopPropagation(); chooseTool('pan'); }
  }}>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
      {editable && <>
        <Button size="small" variant={tool === 'pan' ? 'contained' : 'outlined'} onClick={() => chooseTool('pan')}>{t('maps.storageLocationMap.pan')}</Button>
        <Button size="small" variant={tool === 'point' ? 'contained' : 'outlined'} onClick={() => chooseTool('point')}>{t('maps.storageLocationMap.placePin')}</Button>
        {canOutline && <Button size="small" variant={tool === 'outline' ? 'contained' : 'outlined'} onClick={() => chooseTool('outline')}>{t('maps.storageLocationMap.drawBuilding')}</Button>}
        {tool === 'outline' && <>
          <Button size="small" disabled={draft.length < 3} onClick={finishOutline}>{t('maps.storageLocationMap.finishOutline', { count: draft.length })}</Button>
          <Button size="small" disabled={!draft.length} onClick={() => setDraft((points) => points.slice(0, -1))}>{t('maps.storageLocationMap.undoCorner')}</Button>
        </>}
        {Boolean(outline?.length) && canOutline && <Button size="small" color="error" onClick={() => onOutlineChange?.(undefined)}>{t('maps.storageLocationMap.removeOutline')}</Button>}
      </>}
      <Typography variant="caption" color="text.secondary">{t('maps.storageLocationMap.zoomHelp')}</Typography>
    </Stack>
    {editable && <Typography variant="body2" color="text.secondary">
      {tool === 'outline' ? t('maps.storageLocationMap.outlineHelp') : tool === 'point'
        ? kind === 'pickup' ? t('maps.storageLocationMap.clickTheMapToSetTheExactPickupPoint') : t('maps.storageLocationMap.clickTheMapToSetTheStorageLocation')
        : t('maps.storageLocationMap.editHelp')}
    </Typography>}
    <Box sx={{ position: 'relative', height: tall ? { xs: 420, md: 'min(65vh, 760px)' } : compact ? { xs: 240, md: 300 } : { xs: 340, md: 440 }, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', '& .leaflet-container': { cursor: editable && tool !== 'pan' ? 'crosshair' : undefined } }}>
      <MapContainer center={center} zoom={zoom} minZoom={3} maxZoom={22} zoomSnap={1} zoomDelta={1}
        scrollWheelZoom={false} dragging={canDrag} style={{ width: '100%', height: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxNativeZoom={19} maxZoom={22} />
        <MapControls latitude={center[0]} longitude={center[1]} zoom={zoom} canDrag={canDrag} onZoomChange={onZoomChange} />
        <MapActions features={[...features, { id: 'selected', name: '', latitude: hasPoint ? latitude : undefined, longitude: hasPoint ? longitude : undefined, mapOutline: outline }]} />
        <ClickHandler outlineStart={editable && tool === 'outline' && draft.length >= 3 ? draft[0] : undefined}
          onCloseOutline={finishOutline} onSelect={editable && tool !== 'pan' ? (lat, lng) => {
          if (tool === 'outline') setDraft((points) => points.length < 200 ? [...points, [lat, lng]] : points);
          else onCenterChange?.(lat, lng);
        } : undefined} />
        {resolvedOverlayUrl && <ImageOverlay url={resolvedOverlayUrl} bounds={bounds} opacity={0.62} />}
        {features.filter((feature) => feature.id !== selectedId).map((feature) => <MapFeature key={feature.id} feature={feature} interactive={tool === 'pan'} onSelect={onFeatureSelect ? () => chooseFeature(feature.id) : undefined} />)}
        {outline && outline.length >= 3 && <Polygon positions={outline} pathOptions={{ color: theme.palette.primary.main, weight: 3, fillOpacity: 0.2 }} interactive={false} />}
        {editable && tool !== 'outline' && outline?.map((point, index) => <Marker key={index} position={point} icon={handleIcon} draggable
          eventHandlers={{ dragend: (event) => {
            const next = event.target.getLatLng();
            onOutlineChange?.(outline.map((value, i) => i === index ? [next.lat, next.lng] : value));
          }, dblclick: () => { if (outline.length > 3) onOutlineChange?.(outline.filter((_, i) => i !== index)); } }} />)}
        {draft.length > 0 && <>
          <Polyline positions={draft} pathOptions={{ color: theme.palette.warning.main, dashArray: '6 6' }} interactive={false} />
          {draft.map((point, index) => <CircleMarker key={index} center={point} radius={5} interactive={index === 0 && draft.length >= 3}
            bubblingMouseEvents={false} eventHandlers={{ click: finishOutline }} pathOptions={{ color: theme.palette.warning.main, fillOpacity: 1 }} />)}
        </>}
        {hasPoint && tool !== 'outline' && (editable ? <Marker position={center} icon={handleIcon} draggable eventHandlers={{ dragend: (event) => {
          const point = event.target.getLatLng(); onCenterChange?.(point.lat, point.lng);
        } }} /> : <CircleMarker center={center} radius={8} pathOptions={{ color: theme.palette.background.paper, fillColor: theme.palette.primary.main, fillOpacity: 1, weight: 2 }}>
          <Popup>{kind === 'pickup' ? t('maps.storageLocationMap.pickupPoint') : t('common.storageLocation')}</Popup>
        </CircleMarker>)}
      </MapContainer>
      {isMobile && !editable && <Button title={translate('maps.storageLocationMap.enableOrDisableMapInteraction')} size="small" variant="contained"
        startIcon={touchActive ? <CheckIcon /> : <TouchAppIcon />} onClick={() => setTouchActive((value) => !value)}
        sx={{ position: 'absolute', bottom: 24, left: 8, zIndex: 1000 }}>
        {touchActive ? t('maps.storageLocationMap.mapActive') : t('maps.storageLocationMap.interact')}
      </Button>}
    </Box>
  </Stack>;
}

function MapFeature({ feature, onSelect, interactive }: { feature: StorageMapFeature; onSelect?: () => void; interactive: boolean }) {
  const options = { color: '#526b79', fillOpacity: 0.18, weight: 2 };
  const label = <Tooltip sticky>{feature.name}</Tooltip>;
  return <>
    {feature.mapOutline && <Polygon positions={feature.mapOutline} pathOptions={options} interactive={interactive} bubblingMouseEvents={false} eventHandlers={onSelect ? { click: onSelect } : undefined}>{label}</Polygon>}
    {feature.latitude != null && feature.longitude != null && <CircleMarker center={[feature.latitude, feature.longitude]} radius={6} interactive={interactive} pathOptions={{ ...options, fillOpacity: 0.85 }}
      bubblingMouseEvents={false} eventHandlers={onSelect ? { click: onSelect } : undefined}>{label}</CircleMarker>}
  </>;
}
