import { Button } from '../shared/ActionButtons';
import { useObjectUrl } from '../../hooks/useObjectUrl';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Alert, Box, Stack, Typography } from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import CropIcon from '@mui/icons-material/Crop';
import DeleteIcon from '@mui/icons-material/Delete';
import { apiFileUrl, fetchMedia, isApiMediaUrl } from '../../services/apiClient';
import { releaseStagedImage, stageImage } from '../../services/stagedImageService';
import { translate, useT } from '../../utils/naming';
import { ImageCropDialog } from './ImageCropDialog';
import { MediaImage } from './MediaImage';

export interface ImageAttachmentState {
  files: File[];
  removed: string[];
  replacements: Record<string, File>;
}

function FilePreview({ file, alt }: { file: File; alt: string }) {
  const preview = useObjectUrl(file);
  return <MediaImage src={preview} alt={alt} sx={{ width: '100%', height: 100, objectFit: 'contain', display: 'block' }} />;
}

export function ImageAttachments({ existing = [], value, onChange, maxImages = 8, disabled = false }: {
  existing?: string[];
  value: ImageAttachmentState;
  onChange: Dispatch<SetStateAction<ImageAttachmentState>>;
  maxImages?: number;
  disabled?: boolean;
}) {
  const t = useT();
  const [editing, setEditing] = useState<{ file: File; index?: number; key?: string }>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadsInProgress, setUploadsInProgress] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const stagedFiles = useRef(new Set<File>());
  useEffect(() => {
    const files = stagedFiles.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
      files.forEach(releaseStagedImage);
      files.clear();
    };
  }, []);
  const retained = existing.filter((key) => !value.removed.includes(key));
  const remaining = maxImages - retained.length - value.files.length;
  const busy = disabled || loading;

  function beginUpload(file: File) {
    stagedFiles.current.add(file);
    setError('');
    setUploadsInProgress((count) => count + 1);
    void stageImage(file)
      .catch((reason) => {
        if (mounted.current) setError(reason instanceof Error ? reason.message : t('common.imageAttachments.couldNotUploadImage'));
      })
      .finally(() => {
        if (mounted.current) setUploadsInProgress((count) => Math.max(0, count - 1));
      });
  }

  function releaseImage(file: File) {
    stagedFiles.current.delete(file);
    releaseStagedImage(file);
  }

  function removeExisting(key: string) {
    const replacement = value.replacements[key];
    if (replacement) releaseImage(replacement);
    onChange((current) => {
      const replacements = { ...current.replacements };
      delete replacements[key];
      return {
        ...current,
        removed: current.removed.includes(key) ? current.removed : [...current.removed, key],
        replacements,
      };
    });
  }

  function removeNew(file: File) {
    releaseImage(file);
    onChange((current) => ({ ...current, files: current.files.filter((candidate) => candidate !== file) }));
  }

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
        if (!response.ok) throw new Error(t('common.imageAttachments.couldNotLoadImage'));
        blob = await response.blob();
      }
      if (!controller.signal.aborted) {
        const extension = new URL(url).pathname.toLowerCase();
        const type = ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ? blob.type
          : extension.endsWith('.png') ? 'image/png' : extension.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        setEditing({ key, file: new File([blob], 'image', { type }) });
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t('common.imageAttachments.couldNotLoadImage'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{maxImages === 1 ? t('common.imageAttachments.image') : t('common.imageAttachments.images')}</Typography>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      <Box>
        <Button title={translate('common.imageAttachments.chooseImageFilesToAttach')} component="label" disabled={busy || remaining <= 0} variant="outlined" startIcon={<AddPhotoAlternateIcon />}>
          {maxImages === 1 ? t('common.imageAttachments.addImage') : t('common.imageAttachments.addImages')}
          <input hidden type="file" accept="image/jpeg,image/png,image/webp" multiple={maxImages > 1} disabled={busy || remaining <= 0}
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (!selected.length) return;
              if (selected.length > remaining) { setError(t('common.imageAttachments.youCanAddRemainingMoreImages', { remaining: remaining })); return; }
              if (selected.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024)) {
                setError(t('common.imageAttachments.pleaseSelectJPEGPNGOrWebPImagesUpTo20')); return;
              }
              setError('');
              onChange((current) => ({ ...current, files: [...current.files, ...selected] }));
              selected.forEach(beginUpload);
            }} />
        </Button>
      </Box>
      <Typography variant="caption" color="text.secondary">{t('common.imageAttachments.jPEGPNGOrWebPAutomaticallyCompressedToAMaximumOf')}</Typography>
      {loading && <Typography variant="caption">{t('common.imageAttachments.loadingImage')}</Typography>}
      {uploadsInProgress > 0 && <Typography variant="caption" color="primary">{t('common.imageAttachments.optimizingAndUploadingImageInTheBackground')}</Typography>}
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
        {retained.map((key, index) => (
          <Box key={key} sx={{ width: 180, border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
            {value.replacements[key] ? <FilePreview file={value.replacements[key]} alt={`${t('common.imageAttachments.image')} ${index + 1}`} />
              : <MediaImage src={apiFileUrl(key)} alt={`${t('common.imageAttachments.image')} ${index + 1}`} sx={{ width: '100%', height: 100, objectFit: 'contain', display: 'block' }} />}
            <ImageControls label={String(index + 1)} disabled={busy} onEdit={() => void editExisting(key)} onRemove={() => removeExisting(key)} />
          </Box>
        ))}
        {value.files.map((file, index) => (
          <Box key={index} sx={{ width: 180, border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
            <FilePreview file={file} alt={`${t('common.imageAttachments.newImage')} ${index + 1}`} />
            <ImageControls label={`${t('common.imageAttachments.new')} ${index + 1}`} disabled={busy} onEdit={() => setEditing({ file, index })} onRemove={() => removeNew(file)} />
          </Box>
        ))}
      </Stack>
      {editing && <ImageCropDialog file={editing.file} onClose={() => setEditing(undefined)} onApply={(file) => {
        beginUpload(file);
        releaseImage(editing.file);
        if (editing.key) onChange((current) => ({ ...current, replacements: { ...current.replacements, [editing.key!]: file } }));
        else onChange((current) => ({ ...current, files: current.files.map((candidate, index) => index === editing.index ? file : candidate) }));
        setEditing(undefined);
      }} />}
    </Stack>
  );
}

function ImageControls({ label, disabled, onEdit, onRemove }: { label: string; disabled: boolean; onEdit: () => void; onRemove: () => void }) {
  const t = useT();
  return (
    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
      <Button title={translate('common.imageAttachments.cropAndResizeThisImage')} size="small" disabled={disabled} startIcon={<CropIcon />} aria-label={`${t('common.imageAttachments.adjustImage')} ${label}`} onClick={onEdit}>{t('common.imageAttachments.adjust')}</Button>
      <Button title={translate('common.imageAttachments.removeThisImage')} size="small" disabled={disabled} color="error" aria-label={`${t('common.imageAttachments.removeImage')} ${label}`} onClick={onRemove}><DeleteIcon fontSize="small" /></Button>
    </Stack>
  );
}
