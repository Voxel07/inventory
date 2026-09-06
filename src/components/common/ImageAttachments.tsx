import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import CropIcon from '@mui/icons-material/Crop';
import DeleteIcon from '@mui/icons-material/Delete';
import { apiFileUrl, fetchMedia, isApiMediaUrl } from '../../services/apiClient';
import { useTranslate } from '../../utils/naming';
import { ImageCropDialog } from './ImageCropDialog';
import { MediaImage } from './MediaImage';

export interface ImageAttachmentState {
  files: File[];
  removed: string[];
  replacements: Record<string, File>;
}

function FilePreview({ file, alt }: { file: File; alt: string }) {
  const [preview, setPreview] = useState<{ file: File; url: string }>();
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <MediaImage src={preview?.file === file ? preview.url : undefined} alt={alt} sx={{ width: '100%', height: 100, objectFit: 'contain', display: 'block' }} />;
}

export function ImageAttachments({ existing = [], value, onChange, maxImages = 8, disabled = false }: {
  existing?: string[];
  value: ImageAttachmentState;
  onChange: (value: ImageAttachmentState) => void;
  maxImages?: number;
  disabled?: boolean;
}) {
  const t = useTranslate();
  const [editing, setEditing] = useState<{ file: File; index?: number; key?: string }>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);
  const retained = existing.filter((key) => !value.removed.includes(key));
  const remaining = maxImages - retained.length - value.files.length;
  const busy = disabled || loading;

  async function editExisting(key: string) {
    if (value.replacements[key]) { setEditing({ key, file: value.replacements[key] }); return; }
    const url = apiFileUrl(key);
    if (!url) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError('');
    try {
      let blob: Blob;
      if (isApiMediaUrl(url)) blob = await fetchMedia(url, controller.signal);
      else {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(t('Bild konnte nicht geladen werden.', 'Could not load image.'));
        blob = await response.blob();
      }
      if (!controller.signal.aborted) {
        const extension = new URL(url).pathname.toLowerCase();
        const type = ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ? blob.type
          : extension.endsWith('.png') ? 'image/png' : extension.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        setEditing({ key, file: new File([blob], 'image', { type }) });
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t('Bild konnte nicht geladen werden.', 'Could not load image.'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }


  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{maxImages === 1 ? t('Bild', 'Image') : t('Bilder', 'Images')}</Typography>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      <Box>
        <Button component="label" disabled={busy || remaining <= 0} variant="outlined" startIcon={<AddPhotoAlternateIcon />}>
          {maxImages === 1 ? t('Bild hinzufügen', 'Add image') : t('Bilder hinzufügen', 'Add images')}
          <input hidden type="file" accept="image/jpeg,image/png,image/webp" multiple={maxImages > 1} disabled={busy || remaining <= 0}
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (!selected.length) return;
              if (selected.length > remaining) { setError(t(`Es sind noch ${remaining} Bilder möglich.`, `You can add ${remaining} more images.`)); return; }
              if (selected.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024)) {
                setError(t('Bitte JPEG, PNG oder WebP bis 20 MB auswählen.', 'Please select JPEG, PNG or WebP images up to 20 MB.')); return;
              }
              setError('');
              onChange({ ...value, files: [...value.files, ...selected] });
              if (selected.length === 1) setEditing({ file: selected[0], index: value.files.length });
            }} />
        </Button>
      </Box>
      <Typography variant="caption" color="text.secondary">{t('JPEG, PNG oder WebP. Ausschnitt, Zoom und Größe sind anpassbar; gespeichert als WebP ohne Metadaten.', 'JPEG, PNG or WebP. Adjust crop, zoom and size; saved as WebP without metadata.')}</Typography>
      {loading && <Typography variant="caption">{t('Bild wird geladen…', 'Loading image…')}</Typography>}
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
        {retained.map((key, index) => (
          <Box key={key} sx={{ width: 180, border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
            {value.replacements[key] ? <FilePreview file={value.replacements[key]} alt={`${t('Bild', 'Image')} ${index + 1}`} />
              : <MediaImage src={apiFileUrl(key)} alt={`${t('Bild', 'Image')} ${index + 1}`} sx={{ width: '100%', height: 100, objectFit: 'contain', display: 'block' }} />}
            <ImageControls label={String(index + 1)} disabled={busy} onEdit={() => void editExisting(key)} onRemove={() => onChange({ ...value, removed: [...value.removed, key] })} />
          </Box>
        ))}
        {value.files.map((file, index) => (
          <Box key={index} sx={{ width: 180, border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
            <FilePreview file={file} alt={`${t('Neues Bild', 'New image')} ${index + 1}`} />
            <ImageControls label={`${t('neu', 'new')} ${index + 1}`} disabled={busy} onEdit={() => setEditing({ file, index })} onRemove={() => onChange({ ...value, files: value.files.filter((_, position) => index !== position) })} />
          </Box>
        ))}
      </Stack>
      {editing && <ImageCropDialog file={editing.file} onClose={() => setEditing(undefined)} onApply={(file) => {
        if (editing.key) onChange({ ...value, replacements: { ...value.replacements, [editing.key]: file } });
        else onChange({ ...value, files: value.files.map((current, index) => index === editing.index ? file : current) });
        setEditing(undefined);
      }} />}
    </Stack>
  );
}

function ImageControls({ label, disabled, onEdit, onRemove }: { label: string; disabled: boolean; onEdit: () => void; onRemove: () => void }) {
  const t = useTranslate();
  return (
    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
      <Button size="small" disabled={disabled} startIcon={<CropIcon />} aria-label={`${t('Bild anpassen', 'Adjust image')} ${label}`} onClick={onEdit}>{t('Anpassen', 'Adjust')}</Button>
      <Button size="small" disabled={disabled} color="error" aria-label={`${t('Bild entfernen', 'Remove image')} ${label}`} onClick={onRemove}><DeleteIcon fontSize="small" /></Button>
    </Stack>
  );
}
