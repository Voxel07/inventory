import { markPrivateInventoryResponse, referencesPrivateInventory, clearPrivateResourceIds } from './privateInventoryCache';
import type { User } from '../types';
import { API_URL, AUTH_CONFIGURATION_ERROR, OIDC_CONFIG } from '../config/runtimeConfig';
import { enqueueOfflineAction, flushOfflineQueue, setOfflineCatalog } from './offlineQueue';
import { beginOidcLogin, completeOidcLogin, oidcLogoutUrl, revokeOidcToken } from './oidcClient';
import { localWriteChange, type ApiChangeDetail } from './apiChanges';
import { recordFilteredRows } from './pageCompleteness';
export type { ApiChangeDetail } from './apiChanges';
import {
  announceLogout,
  assertAuthSession,
  captureAuthSession,
  type AuthSessionContext,
  canRefreshAuth,
  clearAuth,
  getAuthorizationHeaders,
  getAuthSnapshot,
  getOidcIdToken,
  getRevocableTokens,
  getValidAccessToken,
  restorePersistedSession,
  setAuthError,
  setDevelopmentSession,
  setOidcSession,
  subscribeAuth,
  updateAuthUser,
} from './authManager';

export { getAuthSnapshot, subscribeAuth };

export async function initializeAuth(): Promise<void> {
  let context = captureAuthSession();
  try {
    const callbackTokens = await completeOidcLogin();
    assertAuthSession(context);
    if (callbackTokens) setOidcSession(callbackTokens);
    context = captureAuthSession();
    if (!getAuthSnapshot().token) await restorePersistedSession();
    context = captureAuthSession();
    if (getAuthSnapshot().token) {
      await refreshCurrentUser();
      void startRealtimeEvents();
      void precacheCatalogForOfflineUse();
    }
  } catch (error) {
    if (context.generation !== getAuthSnapshot().generation) return;
    console.error('OIDC login failed', error);
    clearAuth(error instanceof Error ? error.message : 'OIDC sign-in failed');
  }
}

export async function login(): Promise<void> {
  const context = captureAuthSession();
  setAuthError(null);
  if (OIDC_CONFIG) {
    await beginOidcLogin();
    return;
  }
  if (AUTH_CONFIGURATION_ERROR) throw new Error(AUTH_CONFIGURATION_ERROR);
  const response = await apiRequest<{ token: string; user: User }>('/api/auth/dev-login', {
    method: 'POST', body: { email: 'admin@localhost', password: '' }, anonymous: true,
  });
  assertAuthSession(context);
  setDevelopmentSession(response.token, response.user);
  void startRealtimeEvents();
  void precacheCatalogForOfflineUse();
}

export async function logout(): Promise<boolean> {
  const context = captureAuthSession();
  stopRealtimeEvents();
  announceLogout();
  if (!OIDC_CONFIG) {
    await clearAuth();
    return false;
  }

  let providerLogoutUrl: string;
  try {
    // Revoke first: end_session alone leaves the (offline_access) refresh token valid. Best effort;
    // the provider may be unreachable, and the logout redirect must still happen.
    const { accessToken, refreshToken } = getRevocableTokens();
    await Promise.allSettled([revokeOidcToken(refreshToken, 'refresh_token'), revokeOidcToken(accessToken, 'access_token')]);
    assertAuthSession(context);
    providerLogoutUrl = await oidcLogoutUrl(getOidcIdToken());
  } catch (error) {
    assertAuthSession(context);
    await clearAuth();
    throw error;
  }

  assertAuthSession(context);
  await clearAuth();
  window.location.assign(providerLogoutUrl);
  return true;
}

export async function refreshCurrentUser(): Promise<User | null> {
  if (!getAuthSnapshot().token) return null;
  const context = captureAuthSession();
  try {
    const user = await apiRequest<User>('/api/auth/me', { session: context });
    assertAuthSession(context);
    updateAuthUser(user);
    return user;
  } catch (error) {
    if (context.generation === getAuthSnapshot().generation && error instanceof ApiError && error.status === 401) clearAuth('Your session has expired. Please sign in again.');
    return null;
  }
}

type RequestOptions = {
  session?: AuthSessionContext;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  anonymous?: boolean;
  offline?: { type: string; payload: Record<string, unknown>; idempotencyKey?: string };
};

export class ApiError extends Error {
  status: number;
  details?: unknown;
  retryAfterSeconds?: number;
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
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string; details?: unknown; retryAfterSeconds?: number };
  const error = new ApiError(response.status, payload.error || payload.message || `API request failed (${response.status})`, payload.details);
  const retryAfter = response.headers.get('Retry-After');
  const seconds = retryAfter === null ? payload.retryAfterSeconds
    : /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter)
      : (Date.parse(retryAfter) - Date.now()) / 1000;
  if (seconds !== undefined && Number.isFinite(seconds)) error.retryAfterSeconds = Math.max(1, Math.ceil(seconds));
  return error;
}

type ApiBatchState = { depth: number; changes: Map<string, ApiChangeDetail>; rateLimitListener?: (seconds: number) => void };
const apiBatches = new Map<number, ApiBatchState>();

function publishApiChange(detail?: ApiChangeDetail, context = captureAuthSession()): void {
  if (context.generation !== getAuthSnapshot().generation) return;
  const batch = apiBatches.get(context.generation);
  if (batch && batch.depth > 0) {
    batch.changes.set(`${detail?.type}:${detail?.resource}`, detail ?? { type: 'unknown' });
    return;
  }
  window.dispatchEvent(new CustomEvent('ash-api-change', { detail }));
}

/** Keep bulk writes from refetching every active query after every request. */
export async function withApiRequestBatch<T>(operation: () => Promise<T>, onRateLimit: (seconds: number) => void): Promise<T> {
  const context = captureAuthSession();
  const batch: ApiBatchState = apiBatches.get(context.generation) ?? { depth: 0, changes: new Map() };
  apiBatches.set(context.generation, batch);
  const previousListener = batch.rateLimitListener;
  batch.depth++;
  batch.rateLimitListener = (seconds) => { assertAuthSession(context); onRateLimit(seconds); };
  try {
    const result = await operation();
    assertAuthSession(context);
    return result;
  } finally {
    batch.rateLimitListener = previousListener;
    batch.depth--;
    if (batch.depth === 0) {
      apiBatches.delete(context.generation);
      const changes = [...batch.changes.values()];
      if (changes.length) publishApiChange({ type: 'batch', changes }, context);
    }
  }
}

const activeRequests = new Set<AbortController>();

async function withSessionRequest<T>(context: AuthSessionContext, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  assertAuthSession(context);
  const controller = new AbortController();
  activeRequests.add(controller);
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result = await operation(controller.signal);
    assertAuthSession(context);
    return result;
  } catch (error) {
    assertAuthSession(context);
    if (error instanceof DOMException && error.name === 'AbortError') throw new RequestTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
    activeRequests.delete(controller);
  }
}

async function apiRequestAttempt<T>(path: string, options: RequestOptions, retried: boolean, context: AuthSessionContext): Promise<T> {
  return withSessionRequest(context, async (signal) => {
    const url = new URL(`${API_URL}${path}`);
    const method = options.method || 'GET';
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (!options.anonymous) Object.assign(headers, await getAuthorizationHeaders());
    assertAuthSession(context);
    const cacheKey = `${url.toString()}#session=${context.generation}#actor=${encodeURIComponent(context.accountId ?? 'anonymous')}`;
    const cached = method === 'GET' ? conditionalGetCache.get(cacheKey) : undefined;
    if (cached) headers['If-None-Match'] = cached.etag;
    const response = await fetch(url, {
      method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal,
    });
    assertAuthSession(context);
    if (response.status === 401 && !options.anonymous && !retried && canRefreshAuth()) {
      await getValidAccessToken(true);
      assertAuthSession(context);
      return apiRequestAttempt<T>(path, options, true, context);
    }
    if (response.status === 304 && cached) return cached.value as T;
    if (!response.ok) {
      const error = await responseError(response);
      assertAuthSession(context);
      if (response.status === 401 && !options.anonymous) void clearAuth('Your session has expired. Please sign in again.');
      if (response.status === 429 && !apiBatches.get(context.generation)?.depth) {
        window.dispatchEvent(new CustomEvent('ash-api-rate-limited', { detail: { message: error.message, url: url.toString(), retryAfterSeconds: error.retryAfterSeconds } }));
      }
      throw error;
    }
    const result = response.status === 204 ? undefined as T : await response.json() as T;
    if (response.headers.get('X-Private-Inventory') === 'true') markPrivateInventoryResponse(result);
    recordFilteredRows(result, Number(response.headers.get('X-Filtered-Rows') ?? 0));
    assertAuthSession(context);
    if (method === 'GET') {
      const etag = response.headers.get('ETag');
      if (etag && response.headers.get('X-Private-Inventory') !== 'true') conditionalGetCache.set(cacheKey, { etag, value: result });
    } else {
      invalidateConditionalCacheFor(path);
      publishApiChange(localWriteChange(path), context);
    }
    return result;
  });
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
  const context = options.session ?? captureAuthSession();
  assertAuthSession(context);
  const rateLimitListener = apiBatches.get(context.generation)?.rateLimitListener;
  const offlineAction = options.offline && !referencesPrivateInventory([path, options.body, options.offline.payload])
    ? { ...options.offline, idempotencyKey: options.offline.idempotencyKey ?? bodyIdempotencyKey(options.body) }
    : undefined;
  if (!navigator.onLine && options.method && options.method !== 'GET' && !offlineAction) throw new Error('This action requires an online connection. It has not been queued.');
  if (offlineAction && !navigator.onLine) return queueOffline<T>(offlineAction, context);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await apiRequestAttempt<T>(path, options, false, context);
      } catch (error) {
        // A 429 is rejected before executing the command, so retrying writes is safe.
        // Network failures remain errors: their writes may already have committed.
        if (!rateLimitListener || !(error instanceof ApiError) || error.status !== 429 || attempt >= 5) throw error;
        const seconds = error.retryAfterSeconds ?? 60;
        rateLimitListener(seconds);
        await new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));
        assertAuthSession(context);
      }
    }
  } catch (error) {
    assertAuthSession(context);
    if (offlineAction && (error instanceof TypeError || error instanceof RequestTimeoutError || !navigator.onLine)) return queueOffline<T>(offlineAction, context);
    throw error;
  }
}

function bodyIdempotencyKey(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('idempotencyKey' in body)) return undefined;
  const value = (body as { idempotencyKey?: unknown }).idempotencyKey;
  return typeof value === 'string' ? value : undefined;
}

async function queueOffline<T>(action: { type: string; payload: Record<string, unknown>; idempotencyKey?: string }, context: AuthSessionContext): Promise<T> {
  const idempotencyKey = action.idempotencyKey ?? crypto.randomUUID();
  await enqueueOfflineAction({ idempotencyKey, type: action.type, payload: action.payload, localTimestamp: new Date().toISOString() }, context);
  assertAuthSession(context);
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

export async function fetchMedia(url: string, signal?: AbortSignal, retried = false, context = captureAuthSession()): Promise<Blob> {
  if (!isApiMediaUrl(url)) throw new Error('Invalid media URL');
  return withSessionRequest(context, async (sessionSignal) => {
    const headers = await getAuthorizationHeaders();
    assertAuthSession(context);
    const response = await fetch(url, { headers, signal: signal ? AbortSignal.any([signal, sessionSignal]) : sessionSignal });
    assertAuthSession(context);
    if (response.status === 401 && !retried && canRefreshAuth()) {
      await getValidAccessToken(true);
      assertAuthSession(context);
      return fetchMedia(url, signal, true, context);
    }
    if (!response.ok) throw await responseError(response);
    return response.blob();
  });
}

async function uploadMediaAttempt(file: File, retried: boolean, context: AuthSessionContext): Promise<string> {
  return withSessionRequest(context, async (signal) => {
    const body = new FormData();
    body.append('file', file);
    const headers = await getAuthorizationHeaders();
    assertAuthSession(context);
    const response = await fetch(`${API_URL}/api/media`, { method: 'POST', headers, body, signal });
    assertAuthSession(context);
    if (response.status === 401 && !retried && canRefreshAuth()) {
      await getValidAccessToken(true);
      assertAuthSession(context);
      return uploadMediaAttempt(file, true, context);
    }
    if (!response.ok) throw await responseError(response);
    const stored = await response.json() as { key: string; url?: string };
    assertAuthSession(context);
    return stored.key;
  });
}

export function uploadMedia(file: File, context = captureAuthSession()): Promise<string> {
  return uploadMediaAttempt(file, false, context);
}

async function deleteMediaAttempt(key: string, retried: boolean, context: AuthSessionContext): Promise<void> {
  const url = apiFileUrl(key);
  if (!url || !isApiMediaUrl(url)) throw new Error('Invalid media key');
  return withSessionRequest(context, async (signal) => {
    const headers = await getAuthorizationHeaders();
    assertAuthSession(context);
    const response = await fetch(url, { method: 'DELETE', headers, signal });
    assertAuthSession(context);
    if (response.status === 401 && !retried && canRefreshAuth()) {
      await getValidAccessToken(true);
      assertAuthSession(context);
      return deleteMediaAttempt(key, true, context);
    }
    if (!response.ok) throw await responseError(response);
  });
}

export function deleteMedia(key: string, context = captureAuthSession()): Promise<void> {
  return deleteMediaAttempt(key, false, context);
}

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
const seenEventIds = new Map<string, number>();
let realtimeGeneration: number | undefined;

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
  const now = Date.now();
  for (const [id, timestamp] of seenEventIds) {
    if (now - timestamp > 600_000) seenEventIds.delete(id);
  }
  if (changeDetail.eventId) {
    if (seenEventIds.has(changeDetail.eventId)) return;
    seenEventIds.set(changeDetail.eventId, now);
    if (seenEventIds.size > 2048) seenEventIds.delete(seenEventIds.keys().next().value!);
  }
  window.dispatchEvent(new CustomEvent('ash-api-event', { detail }));
  publishApiChange(changeDetail);
}

export async function startRealtimeEvents(): Promise<void> {
  stopRealtimeEvents();
  if (!navigator.onLine || !getAuthSnapshot().token) return;

  const context = captureAuthSession();
  const controller = new AbortController();
  sseAbortController = controller;
  try {
    const headers = await getAuthorizationHeaders();
    assertAuthSession(context);
    if (controller.signal.aborted) return;
    const response = await fetch(`${API_URL}/api/events/stream`, {
      headers: { ...headers, Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    assertAuthSession(context);
    if (!response.ok || !response.body) throw new Error(`Event stream failed (${response.status})`);
    if (controller.signal.aborted) return;
    // The stream has no replay cursor; a reconnect must recover changes (including permission changes)
    // missed while disconnected. The first connection of a session has nothing to recover.
    if (realtimeGeneration === context.generation) {
      conditionalGetCache.clear();
      publishApiChange({ type: 'realtime.reconnected' }, context);
    }
    realtimeGeneration = context.generation;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      assertAuthSession(context);
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
  const context = captureAuthSession();
  if (!navigator.onLine || !context.accountId) return;
  const catalogs = [
    // Item pages/details cache themselves as they are read; a page-zero
    // precache is neither a complete catalog nor needed for detail fallback.
    { key: 'assemblies', path: '/api/assemblies' },
    { key: 'storageLocations', path: '/api/storage-locations' },
    { key: 'events', path: '/api/events' },
    { key: 'factions', path: '/api/factions' },
    { key: 'eventTypes', path: '/api/event-types' },
  ];
  await Promise.allSettled(catalogs.map(async ({ key, path }) => {
    const data = await apiRequest<unknown[]>(path, { session: context });
    assertAuthSession(context);
    await setOfflineCatalog(key, data, context);
  }));
}

window.addEventListener('online', () => {
  void flushOfflineQueue();
  void startRealtimeEvents();
  void precacheCatalogForOfflineUse();
});
window.addEventListener('offline', stopRealtimeEvents);

let requestGeneration = getAuthSnapshot().generation;
let currentToken = getAuthSnapshot().token;
subscribeAuth(() => {
  const rotated = getAuthSnapshot().token !== currentToken;
  currentToken = getAuthSnapshot().token;
  if (requestGeneration === getAuthSnapshot().generation) {
    // Roles and factions come from the token's groups: re-read the account only when a refreshed
    // token arrives instead of polling /api/auth/me.
    if (rotated && currentToken && getAuthSnapshot().user) void refreshCurrentUser();
    return;
  }
  requestGeneration = getAuthSnapshot().generation;
  activeRequests.forEach((controller) => controller.abort());
  conditionalGetCache.clear();
  clearPrivateResourceIds();
  seenEventIds.clear();
  apiBatches.clear();
  stopRealtimeEvents();
  if (getAuthSnapshot().token && getAuthSnapshot().user) {
    void startRealtimeEvents();
    void precacheCatalogForOfflineUse();
    void flushOfflineQueue();
  }
});
