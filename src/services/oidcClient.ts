import { OIDC_CONFIG } from '../config/runtimeConfig';

const TRANSACTION_KEY = 'ash.inventory.oidc.transaction';
const TRANSACTION_MAX_AGE_MS = 10 * 60 * 1000;

type OidcMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
};

type OidcTransaction = {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  createdAt: number;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export type OidcTokenSet = {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number | null;
};

let metadataPromise: Promise<OidcMetadata> | null = null;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomValue(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function normalizeIssuer(value: string): string {
  return value.replace(/\/$/, '');
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const segment = token.split('.')[1];
  if (!segment) throw new Error('OIDC provider returned an invalid ID token');
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

function validateIdToken(idToken: string, provider: OidcMetadata, expectedNonce: string): void {
  if (!OIDC_CONFIG) throw new Error('OIDC is not configured');
  const claims = decodeJwtPayload(idToken);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (normalizeIssuer(String(claims.iss || '')) !== normalizeIssuer(provider.issuer)) {
    throw new Error('OIDC ID token issuer does not match discovery metadata');
  }
  if (!audience.includes(OIDC_CONFIG.clientId)) {
    throw new Error('OIDC ID token audience does not include this application');
  }
  if (claims.nonce !== expectedNonce) {
    throw new Error('OIDC callback nonce validation failed');
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now() - 30_000) {
    throw new Error('OIDC ID token is expired');
  }
}

function expiry(response: TokenResponse): number | null {
  if (typeof response.expires_in === 'number') return Date.now() + response.expires_in * 1000;
  if (!response.access_token || response.access_token.split('.').length < 2) return null;
  try {
    const claims = decodeJwtPayload(response.access_token);
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function metadata(): Promise<OidcMetadata> {
  if (!OIDC_CONFIG) throw new Error('OIDC is not configured');
  if (!metadataPromise) {
    metadataPromise = fetch(`${OIDC_CONFIG.authority}/.well-known/openid-configuration`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }).then(async (response) => {
      if (!response.ok) throw new Error(`OIDC discovery failed (${response.status})`);
      const result = await response.json() as Partial<OidcMetadata>;
      if (!result.issuer || !result.authorization_endpoint || !result.token_endpoint) {
        throw new Error('OIDC discovery response is incomplete');
      }
      return result as OidcMetadata;
    }).catch((error) => {
      metadataPromise = null;
      throw error;
    });
  }
  return metadataPromise;
}

async function tokenRequest(parameters: URLSearchParams): Promise<TokenResponse> {
  const provider = await metadata();
  const response = await fetch(provider.token_endpoint, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: parameters,
  });
  const result = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || result.error) {
    if (result.error === 'invalid_client' || response.status === 401) {
      throw new Error(
        'OIDC client authentication failed. Configure the Authentik OAuth2/OIDC provider as a Public client and verify that its Client ID matches this application.',
      );
    }
    throw new Error(result.error_description || result.error || `OIDC token request failed (${response.status})`);
  }
  if (!result.access_token) throw new Error('OIDC provider did not return an access token');
  return result;
}

function toTokenSet(response: TokenResponse, previousRefreshToken = ''): OidcTokenSet {
  return {
    accessToken: response.access_token || '',
    refreshToken: response.refresh_token || previousRefreshToken,
    idToken: response.id_token || '',
    expiresAt: expiry(response),
  };
}

function cleanCallbackUrl(): void {
  const url = new URL(window.location.href);
  for (const name of ['code', 'state', 'session_state', 'iss', 'error', 'error_description']) {
    url.searchParams.delete(name);
  }
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export async function beginOidcLogin(): Promise<void> {
  if (!OIDC_CONFIG) throw new Error('OIDC is not configured');
  const provider = await metadata();
  const transaction: OidcTransaction = {
    state: randomValue(),
    nonce: randomValue(),
    verifier: randomValue(64),
    redirectUri: OIDC_CONFIG.redirectUri,
    createdAt: Date.now(),
  };
  sessionStorage.setItem(TRANSACTION_KEY, JSON.stringify(transaction));

  const url = new URL(provider.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: OIDC_CONFIG.clientId,
    redirect_uri: transaction.redirectUri,
    scope: OIDC_CONFIG.scope,
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: await codeChallenge(transaction.verifier),
    code_challenge_method: 'S256',
  }).toString();
  window.location.assign(url.toString());
}

export async function completeOidcLogin(): Promise<OidcTokenSet | null> {
  if (!OIDC_CONFIG) return null;
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const providerError = url.searchParams.get('error');
  if (!code && !providerError) return null;

  const rawTransaction = sessionStorage.getItem(TRANSACTION_KEY);
  sessionStorage.removeItem(TRANSACTION_KEY);
  try {
    if (providerError) throw new Error(url.searchParams.get('error_description') || providerError);
    if (!code || !rawTransaction) throw new Error('OIDC callback has no matching login transaction');
    const transaction = JSON.parse(rawTransaction) as OidcTransaction;
    if (Date.now() - transaction.createdAt > TRANSACTION_MAX_AGE_MS) throw new Error('OIDC login transaction expired');
    if (url.searchParams.get('state') !== transaction.state) throw new Error('OIDC callback state validation failed');

    const response = await tokenRequest(new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OIDC_CONFIG.clientId,
      code,
      redirect_uri: transaction.redirectUri,
      code_verifier: transaction.verifier,
    }));
    if (!response.id_token) throw new Error('OIDC provider did not return an ID token');
    validateIdToken(response.id_token, await metadata(), transaction.nonce);
    return toTokenSet(response);
  } finally {
    cleanCallbackUrl();
  }
}

export async function refreshOidcTokens(refreshToken: string): Promise<OidcTokenSet> {
  if (!OIDC_CONFIG) throw new Error('OIDC is not configured');
  const response = await tokenRequest(new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: OIDC_CONFIG.clientId,
    refresh_token: refreshToken,
  }));
  return toTokenSet(response, refreshToken);
}
