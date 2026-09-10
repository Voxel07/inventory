import type { StorageLocation, StorageLocationFormData } from '../types';
import { storageLocationApi } from '../services/storageLocationService';
import { createResourceHooks } from './useResourceApi';

export const {
  useList: useStorageLocations,
  useDetail: useStorageLocation,
  useCreate: useCreateStorageLocation,
  useUpdate: useUpdateStorageLocation,
  useDelete: useDeleteStorageLocation,
  useDeleteMany: useDeleteStorageLocations,
} = createResourceHooks<StorageLocation, StorageLocationFormData>(
  storageLocationApi,
  'storageLocations',
  ['items'],
);
