import type { User } from '../types';
import { API_URL, OIDC_CONFIG } from '../config/runtimeConfig';
import { enqueueOfflineAction, flushOfflineQueue } from './offlineQueue';
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
    if (getAuthSnapshot().token) await refreshCurrentUser();
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
}

export function logout(): void {
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

  const response = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 401 && !options.anonymous && !retried && canRefreshAuth()) {
    await getValidAccessToken(true);
    return apiRequestAttempt<T>(path, options, true);
  }
  if (!response.ok) {
    const error = await responseError(response);
    if (response.status === 401 && !options.anonymous) clearAuth('Your session has expired. Please sign in again.');
    if (response.status === 429) {
      window.dispatchEvent(new CustomEvent('ash-api-rate-limited', { detail: { message: error.message, url: url.toString() } }));
    }
    throw error;
  }
  const result = response.status === 204 ? undefined as T : await response.json() as T;
  if (method !== 'GET') window.dispatchEvent(new CustomEvent('ash-api-change'));
  return result;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (options.offline && !navigator.onLine) return queueOffline<T>(options.offline);
  try {
    return await apiRequestAttempt<T>(path, options, false);
  } catch (error) {
    if (options.offline && (error instanceof TypeError || !navigator.onLine)) return queueOffline<T>(options.offline);
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
  return `${API_URL}/api/media/${encodeURIComponent(value)}`;
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
  return stored.url || stored.key;
}

export function uploadMedia(file: File): Promise<string> {
  return uploadMediaAttempt(file, false);
}

export function subscribeToApiChanges(callback: () => void) {
  const listener = () => callback();
  window.addEventListener('ash-api-change', listener);
  window.addEventListener('online', listener);
  return () => {
    window.removeEventListener('ash-api-change', listener);
    window.removeEventListener('online', listener);
  };
}

window.addEventListener('online', () => void flushOfflineQueue());
