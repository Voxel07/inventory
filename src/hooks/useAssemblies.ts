import type { Assembly, AssemblyFormData } from '../types';
import { assemblyApi } from '../services/assemblyService';
import { createResourceHooks } from './useResourceApi';
import { useQuery } from '@tanstack/react-query';
import { usePagedList } from './usePagedList';

export const {
  useDetail: useAssembly,
  useCreate: useCreateAssembly,
  useUpdate: useUpdateAssembly,
  useDelete: useDeleteAssembly,
  useDeleteMany: useDeleteAssemblies,
} = createResourceHooks<Assembly, AssemblyFormData>(assemblyApi, 'assemblies');

/** Explicit complete read for assembly pickers and component lookups (bounded reference data). */
export function useAssemblies() {
  const query = useQuery({ queryKey: ['assemblies', 'all'], queryFn: () => assemblyApi.getAll(), networkMode: 'offlineFirst' });
  return { ...query, isComplete: query.isSuccess };
}

/** The assembly catalog screen: server search and "mine", pages on demand. */
export function usePagedAssemblies(query: { search?: string; mine?: boolean }) {
  return usePagedList<Assembly>(['assemblies', 'page', query], (page, size) => assemblyApi.getPage(query, page, size));
}
