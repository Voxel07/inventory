import type { Assembly, AssemblyFormData } from '../types';
import { uploadMedia } from './apiClient';
import { prepareItemImage } from '../utils/prepareItemImage';
import { createCrudResourceApi } from './resourceFactory';

async function transformAssemblyPayload(data: Partial<AssemblyFormData>) {
  const fields = { ...data };
  delete fields.imageFile;
  const image = data.imageFile ? await uploadMedia(await prepareItemImage(data.imageFile)) : undefined;
  return { ...fields, ...(image ? { image, removeImage: false } : {}) };
}

export const assemblyApi = createCrudResourceApi<Assembly, AssemblyFormData>('/api/assemblies', 'assemblies', {
  transformPayload: transformAssemblyPayload,
});

export const getAssemblies = assemblyApi.getAll;
export const getAssembly = assemblyApi.getById;
export const createAssembly = assemblyApi.create;
export const updateAssembly = assemblyApi.update;
export const deleteAssembly = assemblyApi.delete;
