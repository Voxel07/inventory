import type { StorageLocation, StorageLocationFormData } from '../types';
import { apiRequest, subscribeToApiChanges, uploadMedia } from './apiClient';

function payload(data: Partial<StorageLocationFormData>) {
  const fields = { ...data };
  const removeMapOverlay = fields.removeMapOverlay;
  delete fields.mapOverlayFile;
  delete fields.removeMapOverlay;
  return { ...fields, ...(removeMapOverlay ? { mapOverlay: null } : {}) };
}
import { getOfflineCatalog, setOfflineCatalog } from './offlineQueue';

export async function getStorageLocations(): Promise<StorageLocation[]> {
  try {
    const locations = await apiRequest<StorageLocation[]>('/api/storage-locations');
    void setOfflineCatalog('storageLocations', locations);
    return locations;
  } catch (error) {
    const cached = await getOfflineCatalog<StorageLocation[]>('storageLocations');
    if (cached) return cached;
    throw error;
  }
}
export async function getStorageLocation(id: string): Promise<StorageLocation> {
  try {
    return await apiRequest(`/api/storage-locations/${id}`);
  } catch (error) {
    const cached = await getOfflineCatalog<StorageLocation[]>('storageLocations');
    const found = cached?.find((loc) => loc.id === id);
    if (found) return found;
    throw error;
  }
}
export async function createStorageLocation(data: StorageLocationFormData): Promise<StorageLocation> {
  const mapOverlay = data.mapOverlayFile ? await uploadMedia(data.mapOverlayFile) : undefined;
  return apiRequest('/api/storage-locations', { method: 'POST', body: { ...payload(data), mapOverlay } });
}
export async function updateStorageLocation(id: string, data: Partial<StorageLocationFormData>): Promise<StorageLocation> {
  const mapOverlay = data.mapOverlayFile ? await uploadMedia(data.mapOverlayFile) : data.removeMapOverlay ? null : undefined;
  return apiRequest(`/api/storage-locations/${id}`, { method: 'PATCH', body: { ...payload(data), ...(mapOverlay !== undefined ? { mapOverlay } : {}) } });
}
export async function deleteStorageLocation(id: string): Promise<boolean> { await apiRequest(`/api/storage-locations/${id}`, { method: 'DELETE' }); return true; }
export function subscribeToStorageLocations(callback: (data: { action: string; record: StorageLocation }) => void) {
  return subscribeToApiChanges(() => callback({ action: 'refresh', record: {} as StorageLocation }));
}
