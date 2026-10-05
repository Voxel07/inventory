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
  generation: number;
  token: string;
  user: User | null;
  error: string | null;
};

export type AuthSessionContext = { generation: number; accountId: string | undefined; catalogScope: string };

export class SessionChangedError extends Error {
  constructor() { super('Session changed during the request. Please try again.'); this.name = 'SessionChangedError'; }
}

export function captureAuthSession(): AuthSessionContext {
  return { generation, accountId: session.user?.id,
    catalogScope: `${session.user?.id ?? 'signed-out'}:${JSON.stringify([session.user?.role, [...(session.user?.faction ?? [])].sort()])}` };
}

export function assertAuthSession(context: AuthSessionContext): void {
  if (context.generation !== generation || context.accountId !== session.user?.id) throw new SessionChangedError();
}

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
let generation = 0;
let snapshot: AuthSnapshot = { generation, token: session.accessToken, user: session.user, error: null };
let refreshPromise: Promise<string> | null = null;
let persistence: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function publish(error: string | null = null): void {
  snapshot = { generation, token: session.accessToken, user: session.user, error };
  listeners.forEach((listener) => listener());
}

function persist(): Promise<void> {
  if (session.accessToken) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);

  const stored = { ...session };
  persistence = persistence.catch(() => {}).then(() => stored.accessToken || stored.refreshToken
    ? saveStoredAuthSession(stored) : clearStoredAuthSession());
  return persistence;
}

function advanceSession(): void {
  generation++;
  refreshPromise = null;
}

/**
 * Restores a previously persisted OIDC session (e.g. after a PWA cold start
 * where sessionStorage was cleared). A failed refresh never clears auth — an
 * offline start keeps the restored session so reads fall back to the cache and
 * writes queue locally.
 */
export async function restorePersistedSession(): Promise<void> {
  if (session.accessToken) return;
  const context = captureAuthSession();
  await persistence;
  const stored = await loadStoredAuthSession();
  assertAuthSession(context);
  if (!stored) return;
  advanceSession();
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
    await getValidAccessToken(true);
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
  advanceSession();
  session = emptySession();
  replaceTokens(tokens);
}

export function setDevelopmentSession(token: string, user: User): void {
  advanceSession();
  session = { ...emptySession(), accessToken: token, user };
  void persist();
  publish();
}

export function updateAuthUser(user: User): void {
  if (user.id !== session.user?.id || user.role !== session.user?.role
    || JSON.stringify([...(user.faction ?? [])].sort()) !== JSON.stringify([...(session.user?.faction ?? [])].sort())) advanceSession();
  session = { ...session, user };
  void persist();
  publish();
}

export function setAuthError(error: string | null): void {
  publish(error);
}

export async function clearAuth(error: string | null = null): Promise<void> {
  advanceSession();
  session = emptySession();
  const persisted = persist();
  publish(error);
  await persisted;
}

export function getRevocableTokens(): { accessToken: string; refreshToken: string } {
  return { accessToken: session.accessToken, refreshToken: session.refreshToken };
}

// An explicit logout ends the session in every tab of this browser. Expiry stays per tab: refresh
// tokens rotate, so one tab's rejected token must not sign out the others.
const authChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ash-inventory-auth');
authChannel?.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
  if (event.data?.type === 'logout' && (session.accessToken || session.refreshToken)) void clearAuth();
});

export function announceLogout(): void {
  authChannel?.postMessage({ type: 'logout' });
}

export function getOidcIdToken(): string {
  return session.idToken;
}

export function canRefreshAuth(): boolean {
  return Boolean(session.refreshToken);
}

export async function getValidAccessToken(forceRefresh = false): Promise<string> {
  if (!session.accessToken && !session.refreshToken) return '';
  if (session.accessToken.startsWith('dev:')) return session.accessToken;

  const needsRefresh = forceRefresh || !session.accessToken
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
    const context = captureAuthSession();
    const currentRefreshToken = session.refreshToken;
    const pending = refreshOidcTokens(currentRefreshToken)
      .then((tokens) => {
        assertAuthSession(context);
        replaceTokens(tokens);
        return tokens.accessToken;
      })
      .catch((error) => {
        assertAuthSession(context);
        if (isOidcSessionRejected(error)) {
          clearAuth('Your session has expired. Please sign in again.');
          throw error;
        }
        // Discovery/network/server failures are temporary. Keep the durable
        // session and let API requests use their normal offline fallback.
        return session.accessToken;
      })
      .finally(() => { if (refreshPromise === pending) refreshPromise = null; });
    refreshPromise = pending;
  }
  return refreshPromise;
}

export async function getAuthorizationHeaders(): Promise<Record<string, string>> {
  const context = captureAuthSession();
  const token = await getValidAccessToken();
  assertAuthSession(context);
  if (!token) return {};
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (token.startsWith('dev:')) {
    headers['X-Actor-Id'] = token.slice(4);
    headers['X-Actor-Name'] = session.user?.name || 'Development Admin';
    headers['X-Actor-Role'] = String(session.user?.role || 'hq_admin').trim().toLowerCase();
  }
  return headers;
}
