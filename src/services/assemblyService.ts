import pb from './pocketbaseClient';
import type { Assembly, AssemblyFormData } from '../types';

const COLLECTION = 'inventory_assemblies';

export async function getAssemblies(): Promise<Assembly[]> {
  return pb.collection(COLLECTION).getFullList<Assembly>({ sort: '-created' });
}

export async function getAssembly(id: string): Promise<Assembly> {
  return pb.collection(COLLECTION).getOne<Assembly>(id);
}

export async function createAssembly(data: AssemblyFormData): Promise<Assembly> {
  return pb.collection(COLLECTION).create<Assembly>(data);
}

export async function updateAssembly(id: string, data: Partial<AssemblyFormData>): Promise<Assembly> {
  return pb.collection(COLLECTION).update<Assembly>(id, data);
}

export async function deleteAssembly(id: string): Promise<boolean> {
  return pb.collection(COLLECTION).delete(id);
}

export function subscribeToAssemblies(callback: (data: { action: string; record: Assembly }) => void) {
  pb.collection(COLLECTION).subscribe<Assembly>('*', (e) => {
    callback({ action: e.action, record: e.record });
  });
  return () => {
    pb.collection(COLLECTION).unsubscribe('*');
  };
}
