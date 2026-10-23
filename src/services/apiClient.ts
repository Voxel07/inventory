import { markPrivateInventoryResponse, referencesPrivateInventory, clearPrivateResourceIds } from './privateInventoryCache';
import type { User } from '../types';
import { API_URL, AUTH_CONFIGURATION_ERROR, OIDC_CONFIG } from '../config/runtimeConfig';
import { enqueueOfflineAction, flushOfflineQueue, type OfflineCommand } from './offlineQueue';
import { beginOidcLogin, completeOidcLogin, oidcLogoutUrl, revokeOidcToken } from './oidcClient';
import { decodeServerChange, localWriteChange, type ApiChangeDetail } from './apiChanges';
import type { Page } from './apiPagination';
import { translate } from '../utils/naming';
import { isAbortError } from './abort';
import { ApiError, authorizedFetch, REQUEST_TIMEOUT_MS, RequestTimeoutError, responseError } from './apiTransport';
export { ApiError, RequestTimeoutError } from './apiTransport';
export type { ApiChangeDetail } from './apiChanges';
import {
  announceLogout,
  assertAuthSession,
  AuthPersistenceError,
  captureAuthSession,
  type AuthSessionContext,
  clearAuth,
  getAuthorizationHeaders,
  getAuthSnapshot,
  getOidcIdToken,
  getRevocableTokens,
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
    }
  } catch (error) {
    if (context.generation !== getAuthSnapshot().generation) return;
    console.error('OIDC login failed', error);
    clearAuth(error instanceof Error ? error.message : translate('services.apiClient.oIDCSignInFailed'));
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
}

/** Ends the local session; throws {@link AuthPersistenceError} when this device could not record the sign-out. */
async function endLocalSession(): Promise<void> {
  if (!(await clearAuth())) throw new AuthPersistenceError(getAuthSnapshot().error);
}

export async function logout(): Promise<boolean> {
  const context = captureAuthSession();
  if (navigator.onLine) await apiRequest('/api/auth/logout', { method: 'POST', session: context }).catch(() => {});
  stopRealtimeEvents();
  announceLogout();
  if (!OIDC_CONFIG) {
    await endLocalSession();
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
    await endLocalSession();
    throw error;
  }

  assertAuthSession(context);
  await endLocalSession();
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
    if (context.generation === getAuthSnapshot().generation && error instanceof ApiError && (error.status === 401 || error.status === 403)) clearAuth('Your session has expired. Please sign in again.');
    return null;
  }
}

/** A repeated value (`readonly string[]`) becomes one query parameter per element. */
export type QueryValue = string | number | boolean | undefined | readonly string[];
export type ApiQuery = Record<string, QueryValue>;

type RequestOptions = {
  session?: AuthSessionContext;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: ApiQuery;
  anonymous?: boolean;
  offline?: OfflineCommand & { idempotencyKey?: string };
};

export class OfflineQueuedError extends Error {
  idempotencyKey: string;
  constructor(idempotencyKey: string) { super('Action saved offline and will sync automatically'); this.idempotencyKey = idempotencyKey; }
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
    if (isAbortError(error)) throw new RequestTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
    activeRequests.delete(controller);
  }
}

/** {@code hasMore}: the server's page continuation (X-Has-More), {@code null} for unpaged responses. */
type ApiResult<T> = { value: T; hasMore: boolean | null };

function continuation(headers: Headers): boolean | null {
  const value = headers.get('X-Has-More');
  return value === null ? null : value === 'true';
}

async function apiRequestAttempt<T>(path: string, options: RequestOptions, context: AuthSessionContext): Promise<ApiResult<T>> {
  return withSessionRequest(context, async (signal) => {
    const url = new URL(`${API_URL}${path}`);
    const method = options.method || 'GET';
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value === undefined) continue;
      if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(key, entry));
      else url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const cacheKey = `${url.toString()}#session=${context.generation}#actor=${encodeURIComponent(context.accountId ?? 'anonymous')}`;
    const cached = method === 'GET' ? conditionalGetCache.get(cacheKey) : undefined;
    if (cached) headers['If-None-Match'] = cached.etag;
    const init = { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal };
    const response = options.anonymous ? await fetch(url, init) : await authorizedFetch(url, init, context);
    assertAuthSession(context);
    if (response.status === 304 && cached) return { value: cached.value as T, hasMore: cached.hasMore };
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
    const hasMore = continuation(response.headers);
    if (response.headers.get('X-Private-Inventory') === 'true') markPrivateInventoryResponse(result);
    assertAuthSession(context);
    if (method === 'GET') {
      const etag = response.headers.get('ETag');
      if (etag && response.headers.get('X-Private-Inventory') !== 'true') conditionalGetCache.set(cacheKey, { etag, value: result, hasMore });
    } else {
      invalidateConditionalCacheFor(path);
      publishApiChange(localWriteChange(path), context);
    }
    return { value: result, hasMore };
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
  return (await apiRequestResult<T>(path, options)).value;
}

/** One page of a paged list endpoint; the continuation comes from the server, never from the row count. */
export async function apiPage<T>(path: string, page: number, size: number, options: Omit<RequestOptions, 'method' | 'body' | 'offline'> = {}): Promise<Page<T>> {
  const result = await apiRequestResult<T[]>(path, { ...options, query: { ...options.query, page, size } });
  return { rows: result.value, page, size, more: result.hasMore ?? false };
}

async function apiRequestResult<T>(path: string, options: RequestOptions): Promise<ApiResult<T>> {
  const context = options.session ?? captureAuthSession();
  assertAuthSession(context);
  const rateLimitListener = apiBatches.get(context.generation)?.rateLimitListener;
  const offlineAction = options.offline && !referencesPrivateInventory([path, options.body, options.offline.payload])
    ? { ...options.offline, idempotencyKey: options.offline.idempotencyKey ?? bodyIdempotencyKey(options.body) }
    : undefined;
  if (!navigator.onLine && options.method && options.method !== 'GET' && !offlineAction) throw new Error(translate('services.apiClient.thisActionRequiresAnOnlineConnectionItHasNotBeen'));
  if (offlineAction && !navigator.onLine) return { value: await queueOffline<T>(offlineAction, context), hasMore: null };
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await apiRequestAttempt<T>(path, options, context);
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
    if (offlineAction && (error instanceof TypeError || error instanceof RequestTimeoutError || !navigator.onLine)) return { value: await queueOffline<T>(offlineAction, context), hasMore: null };
    throw error;
  }
}

function bodyIdempotencyKey(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('idempotencyKey' in body)) return undefined;
  const value = (body as { idempotencyKey?: unknown }).idempotencyKey;
  return typeof value === 'string' ? value : undefined;
}

async function queueOffline<T>(action: OfflineCommand & { idempotencyKey?: string }, context: AuthSessionContext): Promise<T> {
  const idempotencyKey = action.idempotencyKey ?? crypto.randomUUID();
  await enqueueOfflineAction({ idempotencyKey, type: action.type, payload: { ...action.payload }, localTimestamp: Date.now() }, context);
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

export async function fetchMedia(url: string, signal?: AbortSignal, context = captureAuthSession()): Promise<Blob> {
  if (!isApiMediaUrl(url)) throw new Error(translate('services.apiClient.invalidMediaURL'));
  return withSessionRequest(context, async (sessionSignal) => {
    const response = await authorizedFetch(url, { signal: signal ? AbortSignal.any([signal, sessionSignal]) : sessionSignal }, context);
    if (!response.ok) throw await responseError(response);
    return response.blob();
  });
}

export function uploadMedia(file: File, context = captureAuthSession()): Promise<string> {
  return withSessionRequest(context, async (signal) => {
    const body = new FormData();
    body.append('file', file);
    const response = await authorizedFetch(`${API_URL}/api/media`, { method: 'POST', body, signal }, context);
    if (!response.ok) throw await responseError(response);
    const stored = await response.json() as { key: string; url?: string };
    assertAuthSession(context);
    return stored.key;
  });
}

export function deleteMedia(key: string, context = captureAuthSession()): Promise<void> {
  const url = apiFileUrl(key);
  if (!url || !isApiMediaUrl(url)) throw new Error(translate('services.apiClient.invalidMediaKey'));
  return withSessionRequest(context, async (signal) => {
    const response = await authorizedFetch(url, { method: 'DELETE', signal }, context);
    if (!response.ok) throw await responseError(response);
  });
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

const conditionalGetCache = new Map<string, { etag: string; value: unknown; hasMore: boolean | null }>();
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
  const changeDetail = decodeServerChange(detail);
  if (changeDetail.type === 'heartbeat') return;
  const now = Date.now();
  for (const [id, timestamp] of seenEventIds) {
    if (now - timestamp > 600_000) seenEventIds.delete(id);
  }
  if (changeDetail.eventId) {
    if (seenEventIds.has(changeDetail.eventId)) return;
    seenEventIds.set(changeDetail.eventId, now);
    if (seenEventIds.size > 2048) seenEventIds.delete(seenEventIds.keys().next().value!);
  }
  publishApiChange(changeDetail);
  if (changeDetail.type === 'user.changed') void refreshCurrentUser();
}

export async function startRealtimeEvents(): Promise<void> {
  stopRealtimeEvents();
  if (!navigator.onLine || !getAuthSnapshot().token) return;

  const context = captureAuthSession();
  const controller = new AbortController();
  sseAbortController = controller;
  try {
    const headers = await getAuthorizationHeaders(controller.signal);
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
      void refreshCurrentUser();
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

window.addEventListener('online', () => {
  void flushOfflineQueue();
  void startRealtimeEvents();
});
window.addEventListener('offline', stopRealtimeEvents);

let requestGeneration = getAuthSnapshot().generation;
let currentToken = getAuthSnapshot().token;
subscribeAuth(() => {
  const rotated = getAuthSnapshot().token !== currentToken;
  currentToken = getAuthSnapshot().token;
  if (requestGeneration === getAuthSnapshot().generation) {
    // Token refresh also recovers app-managed access changes missed while disconnected.
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
    void flushOfflineQueue();
  }
});
