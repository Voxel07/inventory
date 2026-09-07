import type { Assembly, AssemblyFormData } from '../types';
import { apiRequest, subscribeToApiChanges, uploadMedia } from './apiClient';
import { prepareItemImage } from '../utils/prepareItemImage';

async function payload(data: Partial<AssemblyFormData>) {
  const fields = { ...data };
  delete fields.imageFile;
  const image = data.imageFile ? await uploadMedia(await prepareItemImage(data.imageFile)) : undefined;
  return { ...fields, ...(image ? { image, removeImage: false } : {}) };
}

import { getOfflineCatalog, setOfflineCatalog } from './offlineQueue';

export async function getAssemblies(): Promise<Assembly[]> {
  try {
    const assemblies = await apiRequest<Assembly[]>('/api/assemblies');
    void setOfflineCatalog('assemblies', assemblies);
    return assemblies;
  } catch (error) {
    const cached = await getOfflineCatalog<Assembly[]>('assemblies');
    if (cached) return cached;
    throw error;
  }
}
export async function getAssembly(id: string): Promise<Assembly> {
  try {
    return await apiRequest(`/api/assemblies/${id}`);
  } catch (error) {
    const cached = await getOfflineCatalog<Assembly[]>('assemblies');
    const found = cached?.find((a) => a.id === id);
    if (found) return found;
    throw error;
  }
}
export async function createAssembly(data: AssemblyFormData): Promise<Assembly> { return apiRequest('/api/assemblies', { method: 'POST', body: await payload(data) }); }
export async function updateAssembly(id: string, data: Partial<AssemblyFormData>): Promise<Assembly> { return apiRequest(`/api/assemblies/${id}`, { method: 'PATCH', body: await payload(data) }); }
export async function deleteAssembly(id: string): Promise<boolean> { await apiRequest(`/api/assemblies/${id}`, { method: 'DELETE' }); return true; }
export function subscribeToAssemblies(callback: (data: { action: string; record: Assembly }) => void) {
  return subscribeToApiChanges(() => callback({ action: 'refresh', record: {} as Assembly }));
}
