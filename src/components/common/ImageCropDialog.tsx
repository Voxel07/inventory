import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Slider, Stack, TextField, Typography } from '@mui/material';
import { calculateImageCrop, decodeImage, prepareItemImage } from '../../utils/prepareItemImage';
import { useTranslate } from '../../utils/naming';

export function ImageCropDialog({ file, onClose, onApply }: { file: File; onClose: () => void; onApply: (file: File) => void }) {
  const t = useTranslate();
  const titleId = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap>();
  const [aspect, setAspect] = useState('original');
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  const [maxDimension, setMaxDimension] = useState(2048);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const loadFailure = t('Bild konnte nicht geladen werden.', 'Could not load image.');
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const ratio = aspect === 'original' ? (bitmap ? bitmap.width / bitmap.height : 1) : Number(aspect);
  const crop = bitmap ? calculateImageCrop(bitmap.width, bitmap.height, ratio, zoom, position.x, position.y) : undefined;

  useEffect(() => {
    let cancelled = false;
    let decoded: ImageBitmap | undefined;
    void decodeImage(file).then((image) => {
      decoded = image;
      if (cancelled) image.close();
      else setBitmap(image);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : loadFailure);
    });
    return () => { cancelled = true; decoded?.close(); };
  }, [file, loadFailure]);

  useEffect(() => {
    if (!bitmap || !canvas.current) return;
    const region = calculateImageCrop(bitmap.width, bitmap.height, ratio, zoom, position.x, position.y);
    const preview = canvas.current;
    const scale = Math.min(560 / region.width, 320 / region.height);
    preview.width = Math.max(1, Math.round(region.width * scale));
    preview.height = Math.max(1, Math.round(region.height * scale));
    preview.getContext('2d')?.drawImage(bitmap, region.x, region.y, region.width, region.height, 0, 0, preview.width, preview.height);
  }, [bitmap, ratio, zoom, position]);

  async function apply() {
    if (!crop) return;
    setSaving(true);
    setError('');
    try { onApply(await prepareItemImage(file, { crop, maxDimension })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('Bild konnte nicht gespeichert werden.', 'Could not save image.')); }
    finally { setSaving(false); }
  }

  const scale = crop ? Math.min(1, maxDimension / Math.max(crop.width, crop.height)) : 1;
  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby={titleId}>
      <DialogTitle id={titleId}>{t('Bild anpassen', 'Adjust image')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2">{t('Wählen Sie den sichtbaren Ausschnitt. Ziehen Sie das Bild oder nutzen Sie die Regler.', 'Choose the visible area. Drag the image or use the sliders.')}</Typography>
          {!bitmap && !error && <CircularProgress aria-label={t('Bild wird geladen', 'Loading image')} />}
          <Box sx={{ display: 'grid', placeItems: 'center', bgcolor: 'grey.100', minHeight: 120, borderRadius: 1, overflow: 'hidden' }}>
            <canvas ref={canvas} aria-label={t('Vorschau des Bildausschnitts', 'Image crop preview')}
              style={{ display: bitmap ? 'block' : 'none', maxWidth: '100%', height: 'auto', cursor: zoom > 1 ? 'grab' : 'move', touchAction: 'none' }}
              onPointerDown={(event) => {
                if (saving) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { x: event.clientX, y: event.clientY, left: position.x, top: position.y };
              }}
              onPointerMove={(event) => {
                if (!drag.current || !crop || !bitmap) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const clamp = (value: number) => Math.max(0, Math.min(1, value));
                setPosition({
                  x: bitmap.width > crop.width ? clamp(drag.current.left - (event.clientX - drag.current.x) / bounds.width * crop.width / (bitmap.width - crop.width)) : 0.5,
                  y: bitmap.height > crop.height ? clamp(drag.current.top - (event.clientY - drag.current.y) / bounds.height * crop.height / (bitmap.height - crop.height)) : 0.5,
                });
              }}
              onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
          </Box>
          <Stack direction="row" spacing={2}>
            <TextField select fullWidth label={t('Seitenverhältnis', 'Aspect ratio')} value={aspect} disabled={saving} onChange={(event) => setAspect(event.target.value)}>
              <MenuItem value="original">{t('Original', 'Original')}</MenuItem>
              <MenuItem value="1">1:1</MenuItem><MenuItem value={String(4 / 3)}>4:3</MenuItem>
              <MenuItem value={String(16 / 9)}>16:9</MenuItem><MenuItem value={String(3 / 4)}>3:4</MenuItem>
            </TextField>
            <TextField select fullWidth label={t('Maximale Größe', 'Maximum size')} value={maxDimension} disabled={saving} onChange={(event) => setMaxDimension(Number(event.target.value))}>
              {[512, 1024, 2048].map((size) => <MenuItem key={size} value={size}>{size} px</MenuItem>)}
            </TextField>
          </Stack>
          <Box><Typography>{t('Zoom', 'Zoom')}: {zoom.toFixed(1)}×</Typography>
            <Slider aria-label={t('Zoom', 'Zoom')} min={1} max={4} step={0.05} value={zoom} disabled={saving || !bitmap} onChange={(_, value) => setZoom(Number(value))} /></Box>
          <Box><Typography>{t('Horizontaler Ausschnitt', 'Horizontal position')}</Typography>
            <Slider aria-label={t('Horizontaler Ausschnitt', 'Horizontal position')} min={0} max={1} step={0.01} value={position.x} disabled={saving || !crop || crop.width >= (bitmap?.width ?? 0)} onChange={(_, value) => setPosition((current) => ({ ...current, x: Number(value) }))} /></Box>
          <Box><Typography>{t('Vertikaler Ausschnitt', 'Vertical position')}</Typography>
            <Slider aria-label={t('Vertikaler Ausschnitt', 'Vertical position')} min={0} max={1} step={0.01} value={position.y} disabled={saving || !crop || crop.height >= (bitmap?.height ?? 0)} onChange={(_, value) => setPosition((current) => ({ ...current, y: Number(value) }))} /></Box>
          {crop && <Typography variant="caption">{t('Ausgabe', 'Output')}: {Math.max(1, Math.round(crop.width * scale))} × {Math.max(1, Math.round(crop.height * scale))} px · WebP</Typography>}
          <Typography variant="caption" color="text.secondary">{t('Der Ausschnitt wird beim Speichern angewendet. Abgeschnittene Bereiche können danach nur durch erneutes Hochladen wiederhergestellt werden.', 'The crop is applied when saved. To restore cropped-out areas later, upload the original again.')}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={() => { setAspect('original'); setZoom(1); setPosition({ x: 0.5, y: 0.5 }); setMaxDimension(2048); }}>{t('Zurücksetzen', 'Reset')}</Button>
        <Button disabled={saving} onClick={onClose}>{t('Abbrechen', 'Cancel')}</Button>
        <Button disabled={saving || !bitmap} variant="contained" onClick={() => void apply()}>{saving ? t('Wird verarbeitet…', 'Processing…') : t('Anwenden', 'Apply')}</Button>
      </DialogActions>
    </Dialog>
  );
}
