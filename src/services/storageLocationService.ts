import type { StorageLocation, StorageLocationFormData } from '../types';
import { uploadMedia } from './apiClient';
import { createCrudResourceApi } from './resourceFactory';

function cleanPayload(data: Partial<StorageLocationFormData>) {
  const fields = { ...data };
  const removeMapOverlay = fields.removeMapOverlay;
  delete fields.mapOverlayFile;
  delete fields.removeMapOverlay;
  return { ...fields, ...(removeMapOverlay ? { mapOverlay: null } : {}) };
}

async function transformLocationPayload(data: Partial<StorageLocationFormData>, isUpdate?: boolean) {
  const mapOverlay = data.mapOverlayFile
    ? await uploadMedia(data.mapOverlayFile)
    : isUpdate && data.removeMapOverlay
    ? null
    : undefined;
  return {
    ...cleanPayload(data),
    ...(mapOverlay !== undefined ? { mapOverlay } : {}),
  };
}

export const storageLocationApi = createCrudResourceApi<StorageLocation, StorageLocationFormData>(
  '/api/storage-locations',
  'storageLocations',
  { transformPayload: transformLocationPayload },
);

export const getStorageLocations = storageLocationApi.getAll;
export const getStorageLocation = storageLocationApi.getById;
export const createStorageLocation = storageLocationApi.create;
export const updateStorageLocation = storageLocationApi.update;
export const deleteStorageLocation = storageLocationApi.delete;
