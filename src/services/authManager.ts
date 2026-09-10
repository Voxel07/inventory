import type { User } from '../types';
import { isOidcSessionRejected, refreshOidcTokens, type OidcTokenSet } from './oidcClient';
import { clearStoredAuthSession, loadStoredAuthSession, saveStoredAuthSession } from './authStorage';

const SESSION_KEY = 'ash.inventory.authSession';
const REFRESH_EARLY_MS = 30_000;

type StoredAuthSession = {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number | null;
  user: User | null;
};

export type AuthSnapshot = {
  token: string;
  user: User | null;
  error: string | null;
};

function emptySession(): StoredAuthSession {
  return { accessToken: '', refreshToken: '', idToken: '', expiresAt: null, user: null };
}

function loadSession(): StoredAuthSession {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return { ...emptySession(), ...JSON.parse(stored) as Partial<StoredAuthSession> };
    return emptySession();
  } catch {
    return emptySession();
  }
}

let session = loadSession();
let snapshot: AuthSnapshot = { token: session.accessToken, user: session.user, error: null };
let refreshPromise: Promise<string> | null = null;
const listeners = new Set<() => void>();

function publish(error: string | null = null): void {
  snapshot = { token: session.accessToken, user: session.user, error };
  listeners.forEach((listener) => listener());
}

function persist(): Promise<void> {
  if (session.accessToken) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);

  if (session.accessToken || session.refreshToken) {
    return saveStoredAuthSession(session);
  }
  return clearStoredAuthSession();
}

/**
 * Restores a previously persisted OIDC session (e.g. after a PWA cold start
 * where sessionStorage was cleared). A failed refresh never clears auth — an
 * offline start keeps the restored session so reads fall back to the cache and
 * writes queue locally.
 */
export async function restorePersistedSession(): Promise<void> {
  if (session.accessToken) return;
  const stored = await loadStoredAuthSession();
  if (!stored) return;
  session = {
    ...emptySession(),
    ...stored,
    user: (stored.user as User | null) ?? null,
  };
  void persist();
  publish();
  const needsRefresh = !session.refreshToken
    || !session.accessToken
    || (session.expiresAt !== null && session.expiresAt <= Date.now() + REFRESH_EARLY_MS);
  if (!needsRefresh || !navigator.onLine) return;
  try {
    replaceTokens(await refreshOidcTokens(session.refreshToken));
  } catch {
    // Keep the restored session; the next successful request refreshes or clears on 401.
  }
}

function replaceTokens(tokens: OidcTokenSet): void {
  session = {
    ...session,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    idToken: tokens.idToken || session.idToken,
    expiresAt: tokens.expiresAt,
  };
  void persist();
  publish();
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

export function setOidcSession(tokens: OidcTokenSet): void {
  session = { ...session, user: null };
  replaceTokens(tokens);
}

export function setDevelopmentSession(token: string, user: User): void {
  session = { ...emptySession(), accessToken: token, user };
  void persist();
  publish();
}

export function updateAuthUser(user: User): void {
  session = { ...session, user };
  void persist();
  publish();
}

export function setAuthError(error: string | null): void {
  publish(error);
}

export async function clearAuth(error: string | null = null): Promise<void> {
  session = emptySession();
  const persisted = persist();
  publish(error);
  await persisted;
}

export function getOidcIdToken(): string {
  return session.idToken;
}

export function canRefreshAuth(): boolean {
  return Boolean(session.refreshToken);
}

export async function getValidAccessToken(forceRefresh = false): Promise<string> {
  if (!session.accessToken) return '';
  if (session.accessToken.startsWith('dev:')) return session.accessToken;

  const needsRefresh = forceRefresh
    || (session.expiresAt !== null && session.expiresAt <= Date.now() + REFRESH_EARLY_MS);
  if (!needsRefresh) return session.accessToken;
  if (!session.refreshToken) {
    if (navigator.onLine && session.expiresAt !== null && session.expiresAt <= Date.now()) {
      clearAuth('Your session has expired. Please sign in again.');
    }
    return session.accessToken;
  }
  // An expired access token is still useful for preserving the local session
  // while offline; cached reads and queued writes do not need the server to
  // accept it until connectivity returns.
  if (!navigator.onLine) return session.accessToken;

  if (!refreshPromise) {
    const currentRefreshToken = session.refreshToken;
    refreshPromise = refreshOidcTokens(currentRefreshToken)
      .then((tokens) => {
        replaceTokens(tokens);
        return tokens.accessToken;
      })
      .catch((error) => {
        if (isOidcSessionRejected(error)) {
          clearAuth('Your session has expired. Please sign in again.');
          throw error;
        }
        // Discovery/network/server failures are temporary. Keep the durable
        // session and let API requests use their normal offline fallback.
        return session.accessToken;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function getAuthorizationHeaders(): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  if (!token) return {};
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (token.startsWith('dev:')) {
    headers['X-Actor-Id'] = token.slice(4);
    headers['X-Actor-Name'] = session.user?.name || 'Development Admin';
    headers['X-Actor-Role'] = String(session.user?.role || 'hq_admin').trim().toLowerCase();
  }
  return headers;
}
