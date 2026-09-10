import { apiRequest } from './apiClient';
import { getOfflineCatalog, setOfflineCatalog } from './offlineQueue';

export type ResourceQuery = Record<string, string | number | boolean | undefined>;

export interface ResourceOptions<TForm, T = unknown> {
  transformPayload?: (data: Partial<TForm>, isUpdate?: boolean) => Promise<Record<string, unknown>> | Record<string, unknown>;
  customCreate?: (data: TForm, basePath: string) => Promise<T>;
  customUpdate?: (id: string, data: Partial<TForm>, basePath: string) => Promise<T>;
}

export interface CollectionResourceApi<T> {
  getAll: (query?: ResourceQuery) => Promise<T[]>;
}

export interface ReadResourceApi<T> extends CollectionResourceApi<T> {
  getById: (id: string) => Promise<T>;
}

export interface CreateResourceApi<T, TForm> extends CollectionResourceApi<T> {
  create: (data: TForm) => Promise<T>;
}

export interface MutableResourceApi<T, TForm> extends ReadResourceApi<T>, CreateResourceApi<T, TForm> {
  update: (id: string, data: Partial<TForm>) => Promise<T>;
}

export interface CrudResourceApi<T, TForm> extends MutableResourceApi<T, TForm> {
  delete: (id: string) => Promise<boolean>;
  deleteMany: (ids: string[]) => Promise<string[]>;
}

function queryCacheKey(base: string, query?: ResourceQuery): string {
  const entries = Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length ? `${base}:${JSON.stringify(entries)}` : base;
}

function operations<T extends { id: string }, TForm>(
  basePath: string,
  cacheKey?: string,
  options?: ResourceOptions<TForm, T>,
) {
  return {
    async getAll(query?: ResourceQuery) {
      const scopedCacheKey = cacheKey ? queryCacheKey(cacheKey, query) : undefined;
      try {
        const data = await apiRequest<T[]>(basePath, { query });
        if (scopedCacheKey) void setOfflineCatalog(scopedCacheKey, data);
        return data;
      } catch (error) {
        if (scopedCacheKey) {
          const cached = await getOfflineCatalog<T[]>(scopedCacheKey);
          if (cached) return cached;
        }
        throw error;
      }
    },

    async getById(id: string) {
      try {
        return await apiRequest<T>(`${basePath}/${id}`);
      } catch (error) {
        if (cacheKey) {
          const cached = await getOfflineCatalog<T[]>(cacheKey);
          const found = cached?.find((item) => item.id === id);
          if (found) return found;
        }
        throw error;
      }
    },

    async create(data: TForm) {
      if (options?.customCreate) return options.customCreate(data, basePath);
      const body = options?.transformPayload ? await options.transformPayload(data, false) : data;
      return apiRequest<T>(basePath, { method: 'POST', body });
    },

    async update(id: string, data: Partial<TForm>) {
      if (options?.customUpdate) return options.customUpdate(id, data, basePath);
      const body = options?.transformPayload ? await options.transformPayload(data, true) : data;
      return apiRequest<T>(`${basePath}/${id}`, { method: 'PATCH', body });
    },

    async delete(id: string) {
      await apiRequest(`${basePath}/${id}`, { method: 'DELETE' });
      return true;
    },

    async deleteMany(ids: string[]) {
      await Promise.all(ids.map((id) => apiRequest(`${basePath}/${id}`, { method: 'DELETE' })));
      return ids;
    },
  };
}

export function createCreateResourceApi<T extends { id: string }, TForm>(
  basePath: string,
  cacheKey?: string,
  options?: ResourceOptions<TForm, T>,
): CreateResourceApi<T, TForm> {
  const resource = operations<T, TForm>(basePath, cacheKey, options);
  return { getAll: resource.getAll, create: resource.create };
}

export function createMutableResourceApi<T extends { id: string }, TForm>(
  basePath: string,
  cacheKey?: string,
  options?: ResourceOptions<TForm, T>,
): MutableResourceApi<T, TForm> {
  const resource = operations<T, TForm>(basePath, cacheKey, options);
  return { getAll: resource.getAll, getById: resource.getById, create: resource.create, update: resource.update };
}

export function createCrudResourceApi<T extends { id: string }, TForm>(
  basePath: string,
  cacheKey?: string,
  options?: ResourceOptions<TForm, T>,
): CrudResourceApi<T, TForm> {
  return operations<T, TForm>(basePath, cacheKey, options);
}
