import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateResourceApi, CrudResourceApi, MutableResourceApi } from '../services/resourceFactory';

export interface ResourceHooksOptions {
  relatedKeys?: string[];
}

function relatedKeysFrom(options?: ResourceHooksOptions | string[]): string[] | undefined {
  return Array.isArray(options) ? options : options?.relatedKeys;
}

function invalidateResources(queryClient: ReturnType<typeof useQueryClient>, queryKey: string, relatedKeys?: string[]) {
  queryClient.invalidateQueries({ queryKey: [queryKey] });
  relatedKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
}

export function createCreateResourceHooks<T extends { id: string }, TForm>(
  api: CreateResourceApi<T, TForm>,
  queryKey: string,
  options?: ResourceHooksOptions | string[],
) {
  const relatedKeys = relatedKeysFrom(options);
  return {
    useList(query?: Record<string, string | number | boolean | undefined>) {
      return useQuery({ queryKey: [queryKey, query], queryFn: () => api.getAll(query) });
    },
    useCreate() {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: (data: TForm) => api.create(data),
        onSuccess: () => invalidateResources(queryClient, queryKey, relatedKeys),
      });
    },
  };
}

export function createMutableResourceHooks<T extends { id: string }, TForm>(
  api: MutableResourceApi<T, TForm>,
  queryKey: string,
  options?: ResourceHooksOptions | string[],
) {
  const createHooks = createCreateResourceHooks(api, queryKey, options);
  const relatedKeys = relatedKeysFrom(options);
  return {
    ...createHooks,
    useDetail(id?: string) {
      return useQuery({ queryKey: [queryKey, id], queryFn: () => api.getById(id!), enabled: Boolean(id) });
    },
    useUpdate() {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<TForm> }) => api.update(id, data),
        onSuccess: () => invalidateResources(queryClient, queryKey, relatedKeys),
      });
    },
  };
}

export function createResourceHooks<T extends { id: string }, TForm = Partial<T>>(
  api: CrudResourceApi<T, TForm>,
  queryKey: string,
  options?: ResourceHooksOptions | string[],
) {
  const relatedKeys = relatedKeysFrom(options);

  function useList(query?: Record<string, string | number | boolean | undefined>) {
    return useQuery({
      queryKey: [queryKey, query],
      queryFn: () => api.getAll(query),
    });
  }

  function useDetail(id?: string) {
    return useQuery({
      queryKey: [queryKey, id],
      queryFn: () => api.getById(id!),
      enabled: Boolean(id),
    });
  }

  function useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (data: TForm) => api.create(data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
        relatedKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      },
    });
  }

  function useUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, data }: { id: string; data: Partial<TForm> }) => api.update(id, data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
        relatedKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      },
    });
  }

  function useDelete() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => api.delete(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
        relatedKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      },
    });
  }

  function useDeleteMany() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (ids: string[]) => api.deleteMany(ids),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
        relatedKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      },
    });
  }

  return {
    useList,
    useDetail,
    useCreate,
    useUpdate,
    useDelete,
    useDeleteMany,
  };
}
