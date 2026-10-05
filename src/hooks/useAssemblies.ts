import type { Assembly, AssemblyFormData } from '../types';
import { assemblyApi } from '../services/assemblyService';
import { createResourceHooks } from './useResourceApi';
import { useQuery } from '@tanstack/react-query';

export const {
  useDetail: useAssembly,
  useCreate: useCreateAssembly,
  useUpdate: useUpdateAssembly,
  useDelete: useDeleteAssembly,
  useDeleteMany: useDeleteAssemblies,
} = createResourceHooks<Assembly, AssemblyFormData>(assemblyApi, 'assemblies');

export function useAssemblies() {
  // This endpoint returns the whole assembly catalog and has no paging parameters.
  const query = useQuery({ queryKey: ['assemblies'], queryFn: () => assemblyApi.getAll(), networkMode: 'offlineFirst' });
  return { ...query, hasNextPage: false, isFetchingNextPage: false, isComplete: !query.isLoading && !query.isError };
}
