import type { User } from '../types';
import { isOidcSessionRejected, refreshOidcTokens, type OidcTokenSet } from './oidcClient';
import { clearStoredAuthSession, loadStoredAuthSession, saveStoredAuthSession, signedOutRevision } from './authStorage';
import { decodeAuthSession, emptyAuthSession, type PersistedAuthSession } from './authSession';
import { abortable, isAbortError } from './abort';

const SESSION_KEY = 'ash.inventory.authSession';
const REFRESH_EARLY_MS = 30_000;
const SESSION_LOCK = 'ash-inventory-auth-session';
/**
 * Longest wait for the cross-tab session lock. A holder is itself bounded (two provider requests plus storage),
 * so a longer wait means a stuck tab; the waiter then keeps its current token instead of hanging.
 */
const SESSION_LOCK_WAIT_MS = 45_000;

export type AuthSnapshot = {
  generation: number;
  token: string;
  user: User | null;
  /** Development only: the signed-in administrator while {@code user} is impersonated. */
  impersonator: User | null;
  error: string | null;
};

export type AuthSessionContext = { generation: number; accountId: string | undefined; catalogScope: string };

export class SessionChangedError extends Error {
  constructor() { super('Session changed during the request. Please try again.'); this.name = 'SessionChangedError'; }
}

/** The local sign-out happened, but this device could not record it durably; a cold start may restore the session. */
export class AuthPersistenceError extends Error {
  constructor(cause: unknown) {
    super('Signed out, but the saved session on this device could not be removed. Clear the site data of this app.', { cause });
    this.name = 'AuthPersistenceError';
  }
}

export function captureAuthSession(): AuthSessionContext {
  return { generation, accountId: session.user?.id,
    catalogScope: `${session.user?.id ?? 'signed-out'}:${JSON.stringify([session.user?.role, [...(session.user?.faction ?? [])].sort()])}` };
}

export function assertAuthSession(context: AuthSessionContext): void {
  if (context.generation !== generation || context.accountId !== session.user?.id) throw new SessionChangedError();
}

const emptySession = emptyAuthSession;
/** Tokens belong to the signed-in account, which is the impersonator while impersonating. */
const tokenOwner = (value: PersistedAuthSession) => value.impersonator?.id ?? value.user?.id;

function loadSession(): PersistedAuthSession {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    const decoded = stored ? decodeAuthSession(JSON.parse(stored)) : null;
    if (stored && !decoded) sessionStorage.removeItem(SESSION_KEY);
    return decoded ?? emptySession();
  } catch {
    return emptySession();
  }
}

let session = loadSession();
let generation = 0;
let snapshot: AuthSnapshot = { generation, token: session.accessToken, user: session.user, impersonator: session.impersonator, error: null };
let refreshPromise: Promise<string> | null = null;
let persistence: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function publish(error: string | null = null): void {
  snapshot = { generation, token: session.accessToken, user: session.user, impersonator: session.impersonator, error };
  listeners.forEach((listener) => listener());
}

function nextRevision(): number {
  return Math.max(Date.now(), session.tokenRevision + 1, signedOutRevision() + 1);
}

/** Serializes every write to the shared durable session (and refresh rotation) across the tabs of this browser. */
function withSessionLock<T>(action: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request(SESSION_LOCK, { signal: AbortSignal.timeout(SESSION_LOCK_WAIT_MS) }, action) : action();
}

/**
 * Never lets an older token snapshot overwrite a newer generation another tab already stored. An ended session
 * ({@code endedRevision}) is removed durably and that failure propagates; failing to mirror a live session only
 * loses the cold-start restore, so it is logged.
 */
async function writeDurable(snapshot: PersistedAuthSession, endedRevision: number): Promise<void> {
  if (!snapshot.accessToken && !snapshot.refreshToken) return clearStoredAuthSession(endedRevision);
  try {
    const current = await loadStoredAuthSession();
    if (current && current.tokenRevision > snapshot.tokenRevision) {
      // Keep the newer tokens; only a same-account profile update may still apply.
      if (tokenOwner(current) === tokenOwner(snapshot)) await saveStoredAuthSession({ ...current, user: snapshot.user, impersonator: snapshot.impersonator });
      return;
    }
    await saveStoredAuthSession(snapshot);
  } catch (error) {
    console.warn('Failed to persist the auth session for offline use', error);
  }
}

/**
 * {@code locked}: the caller already holds the session lock (Web Locks are not re-entrant).
 * {@code endedRevision}: the generation an ending session closes; required when the session is empty.
 */
function persist(locked = false, endedRevision = 0): Promise<void> {
  if (session.accessToken) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);

  const stored = { ...session };
  const write = () => writeDurable(stored, endedRevision);
  persistence = persistence.catch(() => {}).then(() => locked ? write() : withSessionLock(write));
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
  session = stored;
  if (session.accessToken) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
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

/** {@code durable}: 'write' persists (taking the lock), 'locked' persists under a held lock, 'none' adopts another tab's write. */
function replaceTokens(tokens: OidcTokenSet, revision: number, durable: 'write' | 'locked' | 'none' = 'write'): void {
  session = {
    ...session,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    idToken: tokens.idToken || session.idToken,
    expiresAt: tokens.expiresAt,
    tokenRevision: revision,
  };
  if (durable === 'none') { if (session.accessToken) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
  else void persist(durable === 'locked');
  publish();
}

/** Another tab already stored a newer token generation: adopt it instead of reusing a spent token. */
async function adoptRotatedSession(): Promise<boolean> {
  await persistence;
  const stored = await loadStoredAuthSession();
  if (!stored?.refreshToken || stored.tokenRevision <= session.tokenRevision) return false;
  if (tokenOwner(stored) !== tokenOwner(session)) return false;
  replaceTokens(stored, stored.tokenRevision, 'none');
  return true;
}

function fresh(): boolean {
  return Boolean(session.accessToken) && (session.expiresAt === null || session.expiresAt > Date.now() + REFRESH_EARLY_MS);
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
  const revision = nextRevision();
  session = emptySession();
  replaceTokens(tokens, revision);
}

export function setDevelopmentSession(token: string, user: User): void {
  advanceSession();
  session = { ...emptySession(), accessToken: token, tokenRevision: nextRevision(), user };
  void persist();
  publish();
}

export function updateAuthUser(user: User): void {
  if (user.id !== session.user?.id || user.role !== session.user?.role
    || JSON.stringify(user.roles) !== JSON.stringify(session.user?.roles)
    || JSON.stringify([...(user.faction ?? [])].sort()) !== JSON.stringify([...(session.user?.faction ?? [])].sort())) advanceSession();
  session = { ...session, user };
  void persist();
  publish();
}

/**
 * Development only: acts as {@code target} until called with null. Starts a new session generation, so caches,
 * open requests and the realtime stream switch over; the server re-checks administrator rights on every request.
 */
export function setImpersonation(target: User | null): void {
  const impersonator = session.impersonator ?? session.user;
  if (!impersonator) return;
  advanceSession();
  session = target && target.id !== impersonator.id
    ? { ...session, user: target, impersonator }
    : { ...session, user: impersonator, impersonator: null };
  void persist();
  publish();
}

export function setAuthError(error: string | null): void {
  publish(error);
}

/**
 * Ends the session in memory immediately and durably on this device. Resolves {@code false} (and publishes the
 * failure) when the durable removal failed, so a cold start could restore the session.
 */
export async function clearAuth(error: string | null = null): Promise<boolean> {
  advanceSession();
  const endedRevision = nextRevision();
  session = emptySession();
  const persisted = persist(false, endedRevision);
  publish(error);
  try {
    await persisted;
    return true;
  } catch (cause) {
    const failure = new AuthPersistenceError(cause);
    console.error(failure.message, cause);
    publish(failure.message);
    return false;
  }
}

export function getRevocableTokens(): { accessToken: string; refreshToken: string } {
  return { accessToken: session.accessToken, refreshToken: session.refreshToken };
}

// An explicit logout ends the session in every tab of this browser. Refreshes run under a cross-tab
// lock; the rotating tab persists and announces the new token generation so the others adopt it.
type AuthMessage = { type?: string; userId?: string; tokens?: OidcTokenSet; tokenRevision?: number };
const authChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ash-inventory-auth');
authChannel?.addEventListener('message', (event: MessageEvent<AuthMessage>) => {
  if (event.data?.type === 'logout' && (session.accessToken || session.refreshToken)) void clearAuth();
  if (event.data?.type === 'tokens' && event.data.tokens && session.refreshToken && event.data.userId === tokenOwner(session)
    && (event.data.tokenRevision ?? 0) > session.tokenRevision) replaceTokens(event.data.tokens, event.data.tokenRevision ?? 0, 'none');
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
    const pending = withSessionLock(async () => {
      assertAuthSession(context);
      if (await adoptRotatedSession() && fresh()) return session.accessToken;
      assertAuthSession(context);
      try {
        const tokens = await refreshOidcTokens(session.refreshToken);
        assertAuthSession(context);
        const revision = nextRevision();
        replaceTokens(tokens, revision, 'locked');
        // Durable before the lock is released, so the next tab reads this generation.
        await persistence;
        authChannel?.postMessage({ type: 'tokens', userId: tokenOwner(session), tokens, tokenRevision: revision } satisfies AuthMessage);
        return tokens.accessToken;
      } catch (error) {
        assertAuthSession(context);
        if (isOidcSessionRejected(error)) {
          if (await adoptRotatedSession()) return session.accessToken;
          advanceSession();
          const endedRevision = nextRevision();
          session = emptySession();
          await persist(true, endedRevision).catch((cause: unknown) => console.error(new AuthPersistenceError(cause).message, cause));
          publish('Your session has expired. Please sign in again.');
          throw error;
        }
        // Discovery/network/server failures and provider timeouts are temporary. Keep the
        // durable session and let API requests use their normal offline fallback.
        return session.accessToken;
      }
    }).catch((error: unknown) => {
      // Another tab held the lock past its bound; keep the current token rather than wait indefinitely.
      if (isAbortError(error)) return session.accessToken;
      throw error;
    }).finally(() => { if (refreshPromise === pending) refreshPromise = null; });
    refreshPromise = pending;
  }
  return refreshPromise;
}

/** {@code signal}: the request's own deadline; waiting for a shared refresh never outlives it. */
export async function getAuthorizationHeaders(signal?: AbortSignal): Promise<Record<string, string>> {
  const context = captureAuthSession();
  const token = await abortable(getValidAccessToken(), signal);
  assertAuthSession(context);
  if (!token) return {};
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const account = session.impersonator ?? session.user;
  if (token.startsWith('dev:')) {
    headers['X-Actor-Id'] = token.slice(4);
    headers['X-Actor-Name'] = account?.name || 'Development Admin';
    headers['X-Actor-Role'] = String(account?.role || 'admin').trim().toLowerCase();
  }
  if (session.impersonator && session.user) headers['X-Impersonate-User'] = session.user.id;
  return headers;
}
