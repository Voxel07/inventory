import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { API_URL, OIDC_AUTHORITY, OIDC_CLIENT_ID } from './config';
import { getSecret, removeSecret, setSecret } from './storage';
import type { Session, User } from './types';

WebBrowser.maybeCompleteAuthSession();

const SESSION_KEY = 'ash.mobile.session';
let session: Session | null = null;
let refreshPromise: Promise<string> | null = null;

export function currentSession() { return session; }

async function persist(next: Session | null): Promise<void> {
  session = next;
  if (next) await setSecret(SESSION_KEY, JSON.stringify(next));
  else await removeSecret(SESSION_KEY);
}

export async function restoreSession(): Promise<Session | null> {
  const raw = await getSecret(SESSION_KEY);
  if (raw) {
    try { session = JSON.parse(raw) as Session; } catch { await removeSecret(SESSION_KEY); }
  }
  return session;
}

export async function signOut(): Promise<void> { await persist(null); }

export async function signIn(): Promise<Session> {
  if (!OIDC_AUTHORITY || !OIDC_CLIENT_ID) {
    const response = await fetch(`${API_URL}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@localhost', password: '' }),
    });
    if (!response.ok) throw new Error('Development login is unavailable. Configure OIDC for this server.');
    const result = await response.json() as { token: string; user: User };
    const next: Session = { accessToken: result.token, refreshToken: '', expiresAt: null, user: result.user };
    await persist(next);
    return next;
  }

  const discovery = await AuthSession.fetchDiscoveryAsync(OIDC_AUTHORITY);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'ashinventory', path: 'auth' });
  const request = new AuthSession.AuthRequest({
    clientId: OIDC_CLIENT_ID,
    redirectUri,
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) throw new Error('Sign-in was cancelled or failed.');
  const token = await AuthSession.exchangeCodeAsync({
    clientId: OIDC_CLIENT_ID,
    code: result.params.code,
    redirectUri,
    extraParams: { code_verifier: request.codeVerifier || '' },
  }, discovery);
  const next: Session = {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken || '',
    expiresAt: token.expiresIn ? Date.now() + token.expiresIn * 1000 : null,
    user: null,
  };
  await persist(next);
  try {
    const user = await fetchMe();
    await persist({ ...next, user });
    return currentSession()!;
  } catch (error) {
    await persist(null);
    throw error;
  }
}

async function refreshToken(): Promise<string> {
  if (!session?.refreshToken || !OIDC_AUTHORITY) throw new Error('Sign in again to reconnect.');
  const discovery = await AuthSession.fetchDiscoveryAsync(OIDC_AUTHORITY);
  const token = await AuthSession.refreshAsync({ clientId: OIDC_CLIENT_ID, refreshToken: session.refreshToken }, discovery);
  await persist({
    ...session,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken || session.refreshToken,
    expiresAt: token.expiresIn ? Date.now() + token.expiresIn * 1000 : null,
  });
  return token.accessToken;
}

export async function accessToken(forceRefresh = false): Promise<string> {
  if (!session) throw new Error('Sign in to continue.');
  if (!session.refreshToken || (!forceRefresh && (!session.expiresAt || session.expiresAt > Date.now() + 30_000))) {
    return session.accessToken;
  }
  if (!refreshPromise) refreshPromise = refreshToken().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function fetchMe(): Promise<User> {
  const response = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!response.ok) throw new Error(`Cannot load user (${response.status}).`);
  const user = await response.json() as User;
  if (session) await persist({ ...session, user });
  return user;
}
