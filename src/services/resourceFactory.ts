import { apiRequest, ApiError } from './apiClient';
import { getOfflineCatalog, removeOfflineCatalog, setOfflineCatalog, setOfflineCatalogEntries } from './offlineQueue';
import { assertAuthSession, captureAuthSession, type AuthSessionContext } from './authManager';

export type ResourceQuery = Record<string, string | number | boolean | undefined>;

export interface ResourceOptions<TForm, T = unknown> {
  /** List rows have the full detail projection and can seed exact offline entries. */
  cacheDetails?: boolean;
  transformPayload?: (data: Partial<TForm>, isUpdate?: boolean) => Promise<Record<string, unknown>> | Record<string, unknown>;
  customCreate?: (data: TForm, basePath: string, session: AuthSessionContext) => Promise<T>;
  customUpdate?: (id: string, data: Partial<TForm>, basePath: string, session: AuthSessionContext) => Promise<T>;
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
  const detailKey = (id: string) => cacheKey && options?.cacheDetails ? `${cacheKey}:detail:${encodeURIComponent(id)}` : undefined;
  async function cacheDetail(data: T, context: AuthSessionContext) {
    const key = detailKey(data.id);
    if (key) await setOfflineCatalog(key, data, context);
    assertAuthSession(context);
    return data;
  }
  return {
    async getAll(query?: ResourceQuery) {
      const context = captureAuthSession();
      const scopedCacheKey = cacheKey ? queryCacheKey(cacheKey, query) : undefined;
      try {
        const data = await apiRequest<T[]>(basePath, { query, session: context });
        assertAuthSession(context);
        if (scopedCacheKey) await setOfflineCatalogEntries([
          { key: scopedCacheKey, data },
          ...data.flatMap((item) => {
            const key = detailKey(item.id);
            return key ? [{ key, data: item }] : [];
          }),
        ], context);
        assertAuthSession(context);
        return data;
      } catch (error) {
        assertAuthSession(context);
        if (scopedCacheKey && (!(error instanceof ApiError) || error.status >= 500)) {
          const cached = await getOfflineCatalog<T[]>(scopedCacheKey, context);
          assertAuthSession(context);
          if (cached) return cached;
        }
        throw error;
      }
    },

    async getById(id: string) {
      const context = captureAuthSession();
      const key = detailKey(id);
      try {
        const data = await apiRequest<T>(`${basePath}/${id}`, { session: context });
        assertAuthSession(context);
        return await cacheDetail(data, context);
      } catch (error) {
        assertAuthSession(context);
        if (key && error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          await removeOfflineCatalog(key, context);
          assertAuthSession(context);
        }
        if (cacheKey && (!(error instanceof ApiError) || error.status >= 500)) {
          if (key) {
            const cached = await getOfflineCatalog<T>(key, context);
            assertAuthSession(context);
            if (cached) return cached;
            throw error;
          }
          const cached = await getOfflineCatalog<T[]>(cacheKey, context);
          assertAuthSession(context);
          const found = cached?.find((item) => item.id === id);
          if (found) return found;
        }
        throw error;
      }
    },

    async create(data: TForm) {
      const context = captureAuthSession();
      if (options?.customCreate) {
        const result = await options.customCreate(data, basePath, context);
        assertAuthSession(context);
        return cacheDetail(result, context);
      }
      const body = options?.transformPayload ? await options.transformPayload(data, false) : data;
      assertAuthSession(context);
      const result = await apiRequest<T>(basePath, { method: 'POST', body, session: context });
      return cacheDetail(result, context);
    },

    async update(id: string, data: Partial<TForm>) {
      const context = captureAuthSession();
      if (options?.customUpdate) {
        const result = await options.customUpdate(id, data, basePath, context);
        assertAuthSession(context);
        return cacheDetail(result, context);
      }
      const body = options?.transformPayload ? await options.transformPayload(data, true) : data;
      assertAuthSession(context);
      const result = await apiRequest<T>(`${basePath}/${id}`, { method: 'PATCH', body, session: context });
      return cacheDetail(result, context);
    },

    async delete(id: string) {
      const context = captureAuthSession();
      await apiRequest(`${basePath}/${id}`, { method: 'DELETE', session: context });
      const key = detailKey(id);
      if (key) await removeOfflineCatalog(key, context);
      assertAuthSession(context);
      return true;
    },

    async deleteMany(ids: string[]) {
      const context = captureAuthSession();
      await Promise.all(ids.map(async (id) => {
        await apiRequest(`${basePath}/${id}`, { method: 'DELETE', session: context });
        const key = detailKey(id);
        if (key) await removeOfflineCatalog(key, context);
        assertAuthSession(context);
      }));
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
