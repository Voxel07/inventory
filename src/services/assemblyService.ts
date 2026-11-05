import type { Assembly, AssemblyFormData } from '../types';
import { stageImage } from './stagedImageService';
import { createCrudResourceApi } from './resourceFactory';

async function transformAssemblyPayload(data: Partial<AssemblyFormData>) {
  const fields = { ...data };
  delete fields.imageFile;
  const image = data.imageFile ? await stageImage(data.imageFile) : undefined;
  return { ...fields, ...(image ? { image, removeImage: false } : {}) };
}

// Assembly writes replace the metadata and components; the endpoint requires a complete form.
export const assemblyApi = createCrudResourceApi<Assembly, AssemblyFormData, AssemblyFormData>('/api/assemblies', 'assemblies', {
  transformPayload: transformAssemblyPayload,
});

export const getAssembly = assemblyApi.getById;
export const createAssembly = assemblyApi.create;
export const updateAssembly = assemblyApi.update;
export const deleteAssembly = assemblyApi.delete;
