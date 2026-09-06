import type { Assembly, AssemblyFormData } from '../types';
import { apiRequest, subscribeToApiChanges, uploadMedia } from './apiClient';
import { prepareItemImage } from '../utils/prepareItemImage';

async function payload(data: Partial<AssemblyFormData>) {
  const fields = { ...data };
  delete fields.imageFile;
  const image = data.imageFile ? await uploadMedia(await prepareItemImage(data.imageFile)) : undefined;
  return { ...fields, ...(image ? { image, removeImage: false } : {}) };
}

export function getAssemblies(): Promise<Assembly[]> { return apiRequest('/api/assemblies'); }
export function getAssembly(id: string): Promise<Assembly> { return apiRequest(`/api/assemblies/${id}`); }
export async function createAssembly(data: AssemblyFormData): Promise<Assembly> { return apiRequest('/api/assemblies', { method: 'POST', body: await payload(data) }); }
export async function updateAssembly(id: string, data: Partial<AssemblyFormData>): Promise<Assembly> { return apiRequest(`/api/assemblies/${id}`, { method: 'PATCH', body: await payload(data) }); }
export async function deleteAssembly(id: string): Promise<boolean> { await apiRequest(`/api/assemblies/${id}`, { method: 'DELETE' }); return true; }
export function subscribeToAssemblies(callback: (data: { action: string; record: Assembly }) => void) {
  return subscribeToApiChanges(() => callback({ action: 'refresh', record: {} as Assembly }));
}
