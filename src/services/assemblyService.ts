import type { Assembly, AssemblyFormData } from '../types';
import { apiRequest, subscribeToApiChanges } from './apiClient';

export function getAssemblies(): Promise<Assembly[]> { return apiRequest('/api/assemblies'); }
export function getAssembly(id: string): Promise<Assembly> { return apiRequest(`/api/assemblies/${id}`); }
export function createAssembly(data: AssemblyFormData): Promise<Assembly> { return apiRequest('/api/assemblies', { method: 'POST', body: data }); }
export function updateAssembly(id: string, data: Partial<AssemblyFormData>): Promise<Assembly> { return apiRequest(`/api/assemblies/${id}`, { method: 'PATCH', body: data }); }
export async function deleteAssembly(id: string): Promise<boolean> { await apiRequest(`/api/assemblies/${id}`, { method: 'DELETE' }); return true; }
export function subscribeToAssemblies(callback: (data: { action: string; record: Assembly }) => void) {
  return subscribeToApiChanges(() => callback({ action: 'refresh', record: {} as Assembly }));
}
