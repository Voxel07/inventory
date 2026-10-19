import { useState } from 'react';
import { Alert, Checkbox, Divider, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import { Button } from '../shared/ActionButtons';
import { DialogForm, FormDialog } from '../shared/FormDialog';
import { LocationPicker } from '../shared/LocationPicker';
import { StorageLocationMap } from '../maps/StorageLocationMap';
import { useUpdateStorageLocation } from '../../hooks/useStorageLocations';
import { useObjectUrl } from '../../hooks/useObjectUrl';
import { apiFileUrl } from '../../services/apiClient';
import { useUIStore } from '../../store/uiStore';
import type { StorageLocation, StorageLocationFormData } from '../../types';
import { isDescendant, locationRole } from '../../utils/locationHierarchy';
import { translate, useT } from '../../utils/naming';

const DEFAULT_CENTER = { latitude: 52.375953, longitude: 11.826278 };

/** Edits one location: name, code, description, where it sits (move) and — for locations and sections — its map. */
export function StorageLocationEditDialog({ location, locations, onClose }: {
  location: StorageLocation;
  /** Complete location list, for the parent choice. */
  locations: StorageLocation[];
  onClose: () => void;
}) {
  const t = useT();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const update = useUpdateStorageLocation();
  const [form, setForm] = useState<StorageLocationFormData>({
    privateResource: Boolean(location.access?.privateResource), parentLocationId: location.parentLocationId ?? null, keepParent: location.depth === null, active: location.active,
    name: location.name, code: location.code, description: location.description ?? '', mapOverlay: location.mapOverlay ?? null,
    latitude: location.latitude ?? DEFAULT_CENTER.latitude, longitude: location.longitude ?? DEFAULT_CENTER.longitude,
    mapZoom: Math.max(location.mapZoom ?? 19, 19), overlayBounds: location.overlayBounds,
  });
  const overlayPreview = useObjectUrl(form.mapOverlayFile);
  const parent = locations.find((entry) => entry.id === form.parentLocationId);
  const depth = form.keepParent ? null : parent ? parent.depth === null ? null : parent.depth + 1 : 0;
  // Storage places show the map of their section or location.
  const hasMap = depth !== null && depth <= 1;
  const parentChoices = locations.filter((entry) => entry.active && !isDescendant(entry, location.id, locations)
    && (!location.access?.privateResource || entry.access?.privateResource));

  function submit() {
    if (!form.name.trim()) return;
    const data: StorageLocationFormData = hasMap || depth === null ? form
      : { ...form, latitude: undefined, longitude: undefined, mapOverlay: null, overlayBounds: undefined, mapOverlayFile: undefined };
    update.mutate({ id: location.id, data }, {
      onSuccess: () => { showSnackbar(t('pages.storageLocations.storageLocationUpdatedSuccessfully'), 'success'); onClose(); },
      onError: (error) => showSnackbar(error.message, 'error'),
    });
  }

  return <FormDialog open onClose={onClose} maxWidth="md">
    <DialogForm title={t('pages.storageLocations.editStorageLocation')} onSubmit={submit} onCancel={onClose} noValidate
      pending={update.isPending} submitDisabled={!form.name.trim()}>
      <Stack spacing={2}>
        <LocationPicker locations={parentChoices} value={form.parentLocationId} stockOnly={false} label={t('pages.storageLocations.insideOf')}
          helperText={form.keepParent ? t('review.hiddenHierarchy') : t(`pages.storageLocations.roleHelp.${locationRole({ depth })}`)}
          onChange={(next) => setForm({ ...form, parentLocationId: next?.id ?? null, keepParent: false })} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label={t('pages.storageLocations.storageLocationName')} value={form.name} required fullWidth autoFocus
            onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <TextField label={t('forms.itemForm.locationCode')} placeholder="R3" value={form.code ?? ''} helperText={t('forms.itemForm.locationCodeHelp')}
            slotProps={{ htmlInput: { maxLength: 32 } }} sx={{ minWidth: { sm: 180 } }}
            onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} />
        </Stack>
        <TextField label={t('common.description')} value={form.description} multiline rows={3} fullWidth
          onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <FormControlLabel label={t('enum.value.active')} control={<Checkbox checked={form.active ?? true} onChange={(event) => setForm({ ...form, active: event.target.checked })} />} />
        <Alert severity="info">{t('pages.storageLocations.inactiveLocationsRemainVisibleForStockAndHistoryDeactivateChild')}</Alert>
        {hasMap ? <>
          <Divider />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <MapIcon color="primary" />
            <Typography variant="h6">{t('pages.storageLocations.openStreetMapAndMapOverlay')}</Typography>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label={t('pages.storageLocations.latitude')} type="number" value={form.latitude ?? ''} fullWidth slotProps={{ htmlInput: { step: 0.000001 } }}
              onChange={(event) => setForm({ ...form, latitude: Number(event.target.value) })} />
            <TextField label={t('pages.storageLocations.longitude')} type="number" value={form.longitude ?? ''} fullWidth slotProps={{ htmlInput: { step: 0.000001 } }}
              onChange={(event) => setForm({ ...form, longitude: Number(event.target.value) })} />
          </Stack>
          <Button title={translate('pages.storageLocations.chooseAnImageFileForTheMapOverlay')} component="label" variant="outlined">
            {t('pages.storageLocations.uploadCustomMapOverlay')}
            <input hidden type="file" accept="image/*" onChange={(event) => setForm({ ...form, mapOverlayFile: event.target.files?.[0], removeMapOverlay: false })} />
          </Button>
          {location.mapOverlay && !form.removeMapOverlay && <Button title={translate('pages.storageLocations.removeTheSavedMapOverlay')} color="error"
            onClick={() => setForm({ ...form, removeMapOverlay: true, mapOverlayFile: undefined })}>{t('pages.storageLocations.removeExistingMapOverlay')}</Button>}
          <StorageLocationMap editable latitude={form.latitude} longitude={form.longitude} zoom={form.mapZoom} overlayBounds={form.overlayBounds}
            overlayUrl={overlayPreview || (!form.removeMapOverlay ? apiFileUrl(location.mapOverlay) : undefined)}
            onCenterChange={(latitude, longitude) => setForm((current) => ({ ...current, latitude, longitude }))} />
        </> : <Alert severity="info" icon={<MapIcon />}>{t('pages.storageLocations.placesUseTheMapOfTheirSection')}</Alert>}
      </Stack>
    </DialogForm>
  </FormDialog>;
}
