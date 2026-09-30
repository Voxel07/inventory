import { useQuery, useMutation } from '@tanstack/react-query';
import type { CreateResourceApi, CrudResourceApi, MutableResourceApi } from '../services/resourceFactory';

// Successful writes broadcast through apiClient; hooks do not invalidate a second time.
export function createCreateResourceHooks<T extends { id: string }, TForm>(api: CreateResourceApi<T, TForm>, queryKey: string) {
  return {
    useList(query?: Record<string, string | number | boolean | undefined>) {
      return useQuery({ queryKey: [queryKey, query], queryFn: () => api.getAll(query) });
    },
    useCreate() { return useMutation({ mutationFn: (data: TForm) => api.create(data) }); },
  };
}

export function createMutableResourceHooks<T extends { id: string }, TForm>(api: MutableResourceApi<T, TForm>, queryKey: string) {
  return {
    ...createCreateResourceHooks(api, queryKey),
    useDetail(id?: string) {
      return useQuery({ queryKey: [queryKey, id], queryFn: () => api.getById(id!), enabled: Boolean(id), networkMode: 'offlineFirst' });
    },
    useUpdate() { return useMutation({ mutationFn: ({ id, data }: { id: string; data: Partial<TForm> }) => api.update(id, data) }); },
  };
}

export function createResourceHooks<T extends { id: string }, TForm = Partial<T>>(api: CrudResourceApi<T, TForm>, queryKey: string) {
  return {
    ...createMutableResourceHooks(api, queryKey),
    useDelete() { return useMutation({ mutationFn: (id: string) => api.delete(id) }); },
    useDeleteMany() { return useMutation({ mutationFn: (ids: string[]) => api.deleteMany(ids) }); },
  };
}
