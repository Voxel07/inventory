import type { Assembly, AssemblyFormData } from '../types';
import { assemblyApi } from '../services/assemblyService';
import { createResourceHooks } from './useResourceApi';

export const {
  useList: useAssemblies,
  useDetail: useAssembly,
  useCreate: useCreateAssembly,
  useUpdate: useUpdateAssembly,
  useDelete: useDeleteAssembly,
  useDeleteMany: useDeleteAssemblies,
} = createResourceHooks<Assembly, AssemblyFormData>(assemblyApi, 'assemblies');
