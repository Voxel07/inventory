import { useMutation } from '@tanstack/react-query';
import type { StorageLocation, StorageLocationFormData, StorageStructureInput } from '../types';
import { saveStorageStructure, storageLocationApi } from '../services/storageLocationService';
import { createResourceHooks } from './useResourceApi';

export const {
  useAll: useStorageLocations,
  useDetail: useStorageLocation,
  useCreate: useCreateStorageLocation,
  useUpdate: useUpdateStorageLocation,
  useDelete: useDeleteStorageLocation,
  useDeleteMany: useDeleteStorageLocations,
} = createResourceHooks<StorageLocation, StorageLocationFormData>(
  storageLocationApi,
  'storageLocations',
);

export function useSaveStorageStructure() {
  return useMutation({ mutationFn: (input: StorageStructureInput) => saveStorageStructure(input) });
}
