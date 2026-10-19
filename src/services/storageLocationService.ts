import type { StorageLocation, StorageLocationFormData, StorageStructureInput } from '../types';
import { apiRequest, uploadMedia } from './apiClient';
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

export const createStorageLocation = storageLocationApi.create;

/** Creates or extends a top-level location with its sections and storage places; returns the whole location tree. */
export function saveStorageStructure(input: StorageStructureInput) {
  return apiRequest<StorageLocation[]>('/api/storage-locations/structure', { method: 'PUT', body: input });
}
