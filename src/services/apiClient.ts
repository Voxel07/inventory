import type { User } from '../types';
import { enqueueOfflineAction, flushOfflineQueue } from './offlineQueue';

declare global {
  interface Window {
    __ENV__?: {
      API_URL?: string;
      OIDC_LOGIN_URL?: string;
    };
  }
}

const API_URL = (window.__ENV__?.API_URL || import.meta.env.VITE_API_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const OIDC_LOGIN_URL = window.__ENV__?.OIDC_LOGIN_URL || import.meta.env.VITE_OIDC_LOGIN_URL || '';
const TOKEN_KEY = 'ash.inventory.accessToken';
const USER_KEY = 'ash.inventory.user';

export type AuthSnapshot = { token: string; user: User | null };

function initialToken(): string {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const callbackToken = hash.get('access_token');
  if (callbackToken) {
    localStorage.setItem(TOKEN_KEY, callbackToken);
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return callbackToken;
  }
  return localStorage.getItem(TOKEN_KEY) || '';
}

function initialUser(): User | null {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') as User | null; }
  catch { return null; }
}

let authSnapshot: AuthSnapshot = { token: initialToken(), user: initialUser() };
const authListeners = new Set<() => void>();

export function subscribeAuth(listener: () => void) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

export function getAuthSnapshot() { return authSnapshot; }

export function setAuth(token: string, user: User | null) {
  authSnapshot = { token, user };
  if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user)); else localStorage.removeItem(USER_KEY);
  authListeners.forEach((listener) => listener());
}

export function logout() { setAuth('', null); }

export async function login(): Promise<void> {
  if (OIDC_LOGIN_URL) {
    const separator = OIDC_LOGIN_URL.includes('?') ? '&' : '?';
    window.location.assign(`${OIDC_LOGIN_URL}${separator}redirect_uri=${encodeURIComponent(window.location.origin)}`);
    return;
  }
  const response = await apiRequest<{ token: string; user: User }>('/api/auth/dev-login', {
    method: 'POST', body: { email: 'admin@localhost', password: '' }, anonymous: true,
  });
  setAuth(response.token, response.user);
}

export async function refreshCurrentUser(): Promise<User | null> {
  if (!authSnapshot.token) return null;
  try {
    const user = await apiRequest<User>('/api/auth/me');
    setAuth(authSnapshot.token, user);
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) logout();
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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  const method = options.method || 'GET';
  for (const [key, value] of Object.entries(options.query || {})) if (value !== undefined) url.searchParams.set(key, String(value));
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!options.anonymous && authSnapshot.token) {
    headers.Authorization = `Bearer ${authSnapshot.token}`;
    if (authSnapshot.token.startsWith('dev:')) {
      headers['X-Actor-Id'] = authSnapshot.token.slice(4);
      headers['X-Actor-Name'] = authSnapshot.user?.name || 'Development Admin';
      headers['X-Actor-Role'] = String(authSnapshot.user?.role || 'admin').trim().toLowerCase();
    }
  }
  if (options.offline && !navigator.onLine) return queueOffline<T>(options.offline);
  try {
    const response = await fetch(url, {
      method, headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string; details?: unknown };
      throw new ApiError(response.status, payload.error || `API request failed (${response.status})`, payload.details);
    }
    const result = response.status === 204 ? undefined as T : await response.json() as T;
    if (method !== 'GET') window.dispatchEvent(new CustomEvent('ash-api-change'));
    return result;
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

export async function uploadMedia(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  const headers: Record<string, string> = {};
  if (authSnapshot.token) {
    headers.Authorization = `Bearer ${authSnapshot.token}`;
    if (authSnapshot.token.startsWith('dev:')) {
      headers['X-Actor-Id'] = authSnapshot.token.slice(4);
      headers['X-Actor-Name'] = authSnapshot.user?.name || 'Development Admin';
      headers['X-Actor-Role'] = String(authSnapshot.user?.role || 'admin').trim().toLowerCase();
    }
  }
  const response = await fetch(`${API_URL}/api/media`, { method: 'POST', headers, body });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(response.status, payload.error || 'Media upload failed');
  }
  const stored = await response.json() as { key: string; url?: string };
  return stored.url || stored.key;
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
if (authSnapshot.token) void refreshCurrentUser();
