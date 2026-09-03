type RuntimeEnvironment = NonNullable<Window['__ENV__']>;

function value(runtimeKey: keyof RuntimeEnvironment, viteValue: string | undefined): string {
  return (window.__ENV__?.[runtimeKey] || viteValue || '').trim();
}

function absoluteUrl(rawValue: string, fallback: string, label: string, trimTrailingSlash = true): string {
  const candidate = rawValue || fallback;
  let parsed: URL;
  try {
    parsed = new URL(candidate, window.location.origin);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must use http or https`);
  }
  const result = parsed.toString();
  return trimTrailingSlash ? result.replace(/\/$/, '') : result;
}

const oidcAuthorityValue = value('OIDC_AUTHORITY', import.meta.env.VITE_OIDC_AUTHORITY);
const oidcClientId = value('OIDC_CLIENT_ID', import.meta.env.VITE_OIDC_CLIENT_ID);

if (Boolean(oidcAuthorityValue) !== Boolean(oidcClientId)) {
  throw new Error('OIDC_AUTHORITY and OIDC_CLIENT_ID must be configured together');
}

export const API_URL = absoluteUrl(
  value('API_URL', import.meta.env.VITE_API_URL),
  'http://127.0.0.1:8080',
  'API_URL',
);

export type OidcRuntimeConfig = {
  authority: string;
  clientId: string;
  redirectUri: string;
  scope: string;
};

export const OIDC_CONFIG: OidcRuntimeConfig | null = oidcAuthorityValue && oidcClientId
  ? {
      authority: absoluteUrl(oidcAuthorityValue, '', 'OIDC_AUTHORITY'),
      clientId: oidcClientId,
      redirectUri: absoluteUrl(
        value('OIDC_REDIRECT_URI', import.meta.env.VITE_OIDC_REDIRECT_URI),
        `${window.location.origin}/`,
        'OIDC_REDIRECT_URI',
        false,
      ),
      scope: value('OIDC_SCOPE', import.meta.env.VITE_OIDC_SCOPE) || 'openid profile email offline_access',
    }
  : null;
