import type { Assembly, AssemblyFormData } from '../types';
import { assemblyApi } from '../services/assemblyService';
import { createResourceHooks } from './useResourceApi';
import { useProgressiveList } from './useProgressiveList';

export const {
  useDetail: useAssembly,
  useCreate: useCreateAssembly,
  useUpdate: useUpdateAssembly,
  useDelete: useDeleteAssembly,
  useDeleteMany: useDeleteAssemblies,
} = createResourceHooks<Assembly, AssemblyFormData>(assemblyApi, 'assemblies');

export function useAssemblies() {
  return useProgressiveList<Assembly>(['assemblies'], (page, size) => assemblyApi.getAll({ page, size }));
}
