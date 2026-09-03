import type { User } from '../types';
import { refreshOidcTokens, type OidcTokenSet } from './oidcClient';

const SESSION_KEY = 'ash.inventory.authSession';
const LEGACY_TOKEN_KEY = 'ash.inventory.accessToken';
const LEGACY_USER_KEY = 'ash.inventory.user';
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
    const accessToken = localStorage.getItem(LEGACY_TOKEN_KEY) || '';
    const user = JSON.parse(localStorage.getItem(LEGACY_USER_KEY) || 'null') as User | null;
    return { ...emptySession(), accessToken, user };
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

function persist(): void {
  if (session.accessToken) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

function replaceTokens(tokens: OidcTokenSet): void {
  session = {
    ...session,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    idToken: tokens.idToken || session.idToken,
    expiresAt: tokens.expiresAt,
  };
  persist();
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
  persist();
  publish();
}

export function updateAuthUser(user: User): void {
  session = { ...session, user };
  persist();
  publish();
}

export function setAuthError(error: string | null): void {
  publish(error);
}

export function clearAuth(error: string | null = null): void {
  session = emptySession();
  persist();
  publish(error);
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
    if (session.expiresAt !== null && session.expiresAt <= Date.now()) clearAuth('Your session has expired. Please sign in again.');
    return session.accessToken;
  }

  if (!refreshPromise) {
    const currentRefreshToken = session.refreshToken;
    refreshPromise = refreshOidcTokens(currentRefreshToken)
      .then((tokens) => {
        replaceTokens(tokens);
        return tokens.accessToken;
      })
      .catch((error) => {
        clearAuth('Your session has expired. Please sign in again.');
        throw error;
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
    headers['X-Actor-Role'] = String(session.user?.role || 'admin').trim().toLowerCase();
  }
  return headers;
}
