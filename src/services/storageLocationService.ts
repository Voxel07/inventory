import pb from './pocketbaseClient';
import type { StorageLocation, StorageLocationFormData } from '../types';

const COLLECTION = 'inventory_storage_locations';

export async function getStorageLocations(): Promise<StorageLocation[]> {
  return pb.collection(COLLECTION).getFullList<StorageLocation>({
    sort: '-created',
  });
}

export async function getStorageLocation(id: string): Promise<StorageLocation> {
  return pb.collection(COLLECTION).getOne<StorageLocation>(id);
}

export async function createStorageLocation(data: StorageLocationFormData): Promise<StorageLocation> {
  const { mapOverlayFile, removeMapOverlay: _removeMapOverlay, ...fields } = data;
  return pb.collection(COLLECTION).create<StorageLocation>({
    ...fields,
    ...(mapOverlayFile ? { mapOverlay: mapOverlayFile } : {}),
  });
}

export async function updateStorageLocation(
  id: string,
  data: Partial<StorageLocationFormData>,
): Promise<StorageLocation> {
  const { mapOverlayFile, removeMapOverlay, ...fields } = data;
  const current = removeMapOverlay ? await getStorageLocation(id) : undefined;
  return pb.collection(COLLECTION).update<StorageLocation>(id, {
    ...fields,
    ...(mapOverlayFile ? { mapOverlay: mapOverlayFile } : {}),
    ...(removeMapOverlay && current?.mapOverlay ? { 'mapOverlay-': current.mapOverlay } : {}),
  });
}

export async function deleteStorageLocation(id: string): Promise<boolean> {
  return pb.collection(COLLECTION).delete(id);
}

export function subscribeToStorageLocations(
  callback: (data: { action: string; record: StorageLocation }) => void,
) {
  let disposed = false;
  let unsubscribe: (() => Promise<void>) | undefined;
  pb.collection(COLLECTION).subscribe<StorageLocation>('*', (e) => {
    callback({ action: e.action, record: e.record });
  }).then((cleanup) => {
    if (disposed) {
      void cleanup().catch((err) => console.warn(`Failed to clean up ${COLLECTION} subscription:`, err));
    } else {
      unsubscribe = cleanup;
    }
  }).catch((err) => {
    console.warn(`Failed to subscribe to ${COLLECTION} realtime updates:`, err);
  });
  return () => {
    disposed = true;
    void unsubscribe?.().catch((err) => console.warn(`Failed to clean up ${COLLECTION} subscription:`, err));
  };
}
