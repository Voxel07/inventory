import type { StorageLocation, StorageLocationFormData } from '../types';
import { apiRequest, subscribeToApiChanges, uploadMedia } from './apiClient';

function payload(data: Partial<StorageLocationFormData>) {
  const fields = { ...data };
  const removeMapOverlay = fields.removeMapOverlay;
  delete fields.mapOverlayFile;
  delete fields.removeMapOverlay;
  return { ...fields, ...(removeMapOverlay ? { mapOverlay: null } : {}) };
}
export function getStorageLocations(): Promise<StorageLocation[]> { return apiRequest('/api/storage-locations'); }
export function getStorageLocation(id: string): Promise<StorageLocation> { return apiRequest(`/api/storage-locations/${id}`); }
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
