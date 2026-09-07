import type { User } from '../types';
import { API_URL, OIDC_CONFIG } from '../config/runtimeConfig';
import { enqueueOfflineAction, flushOfflineQueue, setOfflineCatalog } from './offlineQueue';
import { beginOidcLogin, completeOidcLogin } from './oidcClient';
import {
  canRefreshAuth,
  clearAuth,
  getAuthorizationHeaders,
  getAuthSnapshot,
  getValidAccessToken,
  setAuthError,
  setDevelopmentSession,
  setOidcSession,
  subscribeAuth,
  updateAuthUser,
} from './authManager';

export { getAuthSnapshot, subscribeAuth };

export async function initializeAuth(): Promise<void> {
  try {
    const callbackTokens = await completeOidcLogin();
    if (callbackTokens) setOidcSession(callbackTokens);
    if (getAuthSnapshot().token) {
      await refreshCurrentUser();
      void startRealtimeEvents();
      void precacheCatalogForOfflineUse();
    }
  } catch (error) {
    console.error('OIDC login failed', error);
    clearAuth(error instanceof Error ? error.message : 'OIDC sign-in failed');
  }
}

export async function login(): Promise<void> {
  setAuthError(null);
  if (OIDC_CONFIG) {
    await beginOidcLogin();
    return;
  }
  const response = await apiRequest<{ token: string; user: User }>('/api/auth/dev-login', {
    method: 'POST', body: { email: 'admin@localhost', password: '' }, anonymous: true,
  });
  setDevelopmentSession(response.token, response.user);
  void startRealtimeEvents();
  void precacheCatalogForOfflineUse();
}

export function logout(): void {
  stopRealtimeEvents();
  clearAuth();
}

export async function refreshCurrentUser(): Promise<User | null> {
  if (!getAuthSnapshot().token) return null;
  try {
    const user = await apiRequest<User>('/api/auth/me');
    updateAuthUser(user);
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) clearAuth('Your session has expired. Please sign in again.');
    return null;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  anonymous?: boolean;
  offline?: { type: string; payload: Record<string, unknown> };
};

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) { super(message); this.status = status; this.details = details; }
}

export class OfflineQueuedError extends Error {
  idempotencyKey: string;
  constructor(idempotencyKey: string) { super('Action saved offline and will sync automatically'); this.idempotencyKey = idempotencyKey; }
}

export class RequestTimeoutError extends Error {
  constructor() { super('Request timed out'); this.name = 'RequestTimeoutError'; }
}

const REQUEST_TIMEOUT_MS = 20_000;

async function responseError(response: Response): Promise<ApiError> {
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string; details?: unknown };
  return new ApiError(response.status, payload.error || payload.message || `API request failed (${response.status})`, payload.details);
}

async function apiRequestAttempt<T>(path: string, options: RequestOptions, retried: boolean): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  const method = options.method || 'GET';
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!options.anonymous) Object.assign(headers, await getAuthorizationHeaders());
  const cacheKey = url.toString();
  const cached = method === 'GET' ? conditionalGetCache.get(cacheKey) : undefined;
  if (cached) headers['If-None-Match'] = cached.etag;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new RequestTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 401 && !options.anonymous && !retried && canRefreshAuth()) {
    await getValidAccessToken(true);
    return apiRequestAttempt<T>(path, options, true);
  }
  if (response.status === 304 && cached) return cached.value as T;
  if (!response.ok) {
    const error = await responseError(response);
    if (response.status === 401 && !options.anonymous) clearAuth('Your session has expired. Please sign in again.');
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get('Retry-After') ?? '') || undefined;
      window.dispatchEvent(new CustomEvent('ash-api-rate-limited', { detail: { message: error.message, url: url.toString(), retryAfterSeconds } }));
    }
    throw error;
  }
  const result = response.status === 204 ? undefined as T : await response.json() as T;
  if (method === 'GET') {
    const etag = response.headers.get('ETag');
    if (etag) conditionalGetCache.set(cacheKey, { etag, value: result });
  } else {
    invalidateConditionalCacheFor(path);
    window.dispatchEvent(new CustomEvent('ash-api-change'));
  }
  return result;
}

function resourcePrefix(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : path;
}

function invalidateConditionalCacheFor(path: string): void {
  const prefix = resourcePrefix(path);
  for (const key of conditionalGetCache.keys()) {
    let keyPath: string;
    try {
      keyPath = new URL(key).pathname;
    } catch {
      continue;
    }
    if (resourcePrefix(keyPath) === prefix) conditionalGetCache.delete(key);
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (options.offline && !navigator.onLine) return queueOffline<T>(options.offline);
  try {
    return await apiRequestAttempt<T>(path, options, false);
  } catch (error) {
    if (options.offline && (error instanceof TypeError || error instanceof RequestTimeoutError || !navigator.onLine)) return queueOffline<T>(options.offline);
    throw error;
  }
}

async function queueOffline<T>(action: { type: string; payload: Record<string, unknown> }): Promise<T> {
  const idempotencyKey = crypto.randomUUID();
  await enqueueOfflineAction({ idempotencyKey, type: action.type, payload: action.payload, localTimestamp: new Date().toISOString() });
  throw new OfflineQueuedError(idempotencyKey);
}

export function apiFileUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//.test(value) || value.startsWith('data:') || value.startsWith('blob:')) return value;
  return `${API_URL}/api/media/${value.split('/').map(encodeURIComponent).join('/')}`;
}

// Only attach credentials to our own media endpoint, never to external images.
export function isApiMediaUrl(value: string): boolean {
  const base = new URL(`${API_URL}/api/media/`);
  const url = new URL(value, base);
  return url.origin === base.origin && url.pathname.startsWith(base.pathname);
}

export async function fetchMedia(url: string, signal?: AbortSignal, retried = false): Promise<Blob> {
  if (!isApiMediaUrl(url)) throw new Error('Invalid media URL');
  const response = await fetch(url, { headers: await getAuthorizationHeaders(), signal });
  if (response.status === 401 && !retried && canRefreshAuth()) {
    await getValidAccessToken(true);
    return fetchMedia(url, signal, true);
  }
  if (!response.ok) throw await responseError(response);
  return response.blob();
}

async function uploadMediaAttempt(file: File, retried: boolean): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(`${API_URL}/api/media`, {
    method: 'POST',
    headers: await getAuthorizationHeaders(),
    body,
  });
  if (response.status === 401 && !retried && canRefreshAuth()) {
    await getValidAccessToken(true);
    return uploadMediaAttempt(file, true);
  }
  if (!response.ok) throw await responseError(response);
  const stored = await response.json() as { key: string; url?: string };
  return stored.key;
}

export function uploadMedia(file: File): Promise<string> {
  return uploadMediaAttempt(file, false);
}

export type ApiChangeDetail = {
  type?: string;
  resource?: string;
  id?: string;
  orderId?: string;
  itemId?: string;
  status?: string;
  quantity?: unknown;
};

export function subscribeToApiChanges(callback: (detail?: ApiChangeDetail) => void) {
  const listener = (event: Event) => callback((event as CustomEvent<ApiChangeDetail | undefined>).detail);
  window.addEventListener('ash-api-change', listener);
  window.addEventListener('online', listener);
  return () => {
    window.removeEventListener('ash-api-change', listener);
    window.removeEventListener('online', listener);
  };
}

const conditionalGetCache = new Map<string, { etag: string; value: unknown }>();
let sseAbortController: AbortController | null = null;
let sseRetryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRealtimeReconnect(): void {
  if (sseRetryTimer || !navigator.onLine || !getAuthSnapshot().token) return;
  sseRetryTimer = setTimeout(() => {
    sseRetryTimer = null;
    void startRealtimeEvents();
  }, 5000);
}

function handleSseBlock(block: string): void {
  const data = block.split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data) return;
  let detail: unknown = data;
  try {
    detail = JSON.parse(data);
  } catch {
    // Non-JSON data still signals that API state changed.
  }
  if (typeof detail === 'object' && detail !== null && 'type' in detail && detail.type === 'heartbeat') return;
  const changeDetail: ApiChangeDetail = typeof detail === 'object' && detail !== null
    ? detail as ApiChangeDetail
    : { type: String(detail) };
  window.dispatchEvent(new CustomEvent('ash-api-event', { detail }));
  window.dispatchEvent(new CustomEvent('ash-api-change', { detail: changeDetail }));
}

export async function startRealtimeEvents(): Promise<void> {
  stopRealtimeEvents();
  if (!navigator.onLine || !getAuthSnapshot().token) return;

  const controller = new AbortController();
  sseAbortController = controller;
  try {
    const headers = await getAuthorizationHeaders();
    const response = await fetch(`${API_URL}/api/events/stream`, {
      headers: { ...headers, Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(`Event stream failed (${response.status})`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replaceAll('\r\n', '\n');
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';
      for (const block of blocks) handleSseBlock(block);
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
  } finally {
    if (sseAbortController === controller) {
      sseAbortController = null;
      scheduleRealtimeReconnect();
    }
  }
}

export function stopRealtimeEvents(): void {
  if (sseRetryTimer) {
    clearTimeout(sseRetryTimer);
    sseRetryTimer = null;
  }
  if (sseAbortController) {
    sseAbortController.abort();
    sseAbortController = null;
  }
}

async function precacheCatalogForOfflineUse(): Promise<void> {
  const catalogs = [
    { key: 'items', path: '/api/items' },
    { key: 'assemblies', path: '/api/assemblies' },
    { key: 'storageLocations', path: '/api/storage-locations' },
    { key: 'events', path: '/api/events' },
  ];
  await Promise.allSettled(catalogs.map(async ({ key, path }) => {
    const data = await apiRequest<unknown[]>(path);
    await setOfflineCatalog(key, data);
  }));
}

window.addEventListener('online', () => {
  void flushOfflineQueue();
  void startRealtimeEvents();
  void precacheCatalogForOfflineUse();
});
window.addEventListener('offline', stopRealtimeEvents);
