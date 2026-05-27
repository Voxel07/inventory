import pb from './pocketbaseClient';
import type { StorageLocation } from '../types';

const COLLECTION = 'inventory_storage_locations';

export async function getStorageLocations(): Promise<StorageLocation[]> {
  return pb.collection(COLLECTION).getFullList<StorageLocation>({
    sort: '-created',
  });
}

export async function getStorageLocation(id: string): Promise<StorageLocation> {
  return pb.collection(COLLECTION).getOne<StorageLocation>(id);
}

export async function createStorageLocation(data: {
  name: string;
  description?: string;
  area?: string;
  location?: string;
  position?: string;
}): Promise<StorageLocation> {
  return pb.collection(COLLECTION).create<StorageLocation>(data);
}

export async function updateStorageLocation(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    area: string;
    location: string;
    position: string;
  }>,
): Promise<StorageLocation> {
  return pb.collection(COLLECTION).update<StorageLocation>(id, data);
}

export async function deleteStorageLocation(id: string): Promise<boolean> {
  return pb.collection(COLLECTION).delete(id);
}

export function subscribeToStorageLocations(
  callback: (data: { action: string; record: StorageLocation }) => void,
) {
  pb.collection(COLLECTION).subscribe<StorageLocation>('*', (e) => {
    callback({ action: e.action, record: e.record });
  }).catch((err) => {
    console.warn(`Failed to subscribe to ${COLLECTION} realtime updates:`, err);
  });
  return () => {
    pb.collection(COLLECTION).unsubscribe('*');
  };
}
