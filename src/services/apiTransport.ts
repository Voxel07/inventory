// Authenticated request primitives shared by normal API requests and offline replay.
import { assertAuthSession, canRefreshAuth, getAuthorizationHeaders, getValidAccessToken, type AuthSessionContext } from './authManager';
import { abortable } from './abort';

export const REQUEST_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  status: number;
  details?: unknown;
  retryAfterSeconds?: number;
  constructor(status: number, message: string, details?: unknown) { super(message); this.status = status; this.details = details; }
}

export class RequestTimeoutError extends Error {
  constructor() { super('Request timed out'); this.name = 'RequestTimeoutError'; }
}

/** The server answered successfully, but not with the expected body. */
export class InvalidResponseError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = 'InvalidResponseError'; }
}

export async function responseError(response: Response): Promise<ApiError> {
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string; details?: unknown; retryAfterSeconds?: number };
  const error = new ApiError(response.status, payload.error || payload.message || `API request failed (${response.status})`, payload.details);
  const retryAfter = response.headers.get('Retry-After');
  const seconds = retryAfter === null ? payload.retryAfterSeconds
    : /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter)
      : (Date.parse(retryAfter) - Date.now()) / 1000;
  if (seconds !== undefined && Number.isFinite(seconds)) error.retryAfterSeconds = Math.max(1, Math.ceil(seconds));
  return error;
}

/**
 * One request with the session's credentials, bounded by {@code init.signal}. A 401 refreshes the tokens once
 * and repeats the identical request (same body, so idempotency keys and command UUIDs are preserved).
 */
export async function authorizedFetch(url: string | URL, init: RequestInit & { signal: AbortSignal; headers?: Record<string, string> },
  context: AuthSessionContext): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const headers = { ...init.headers, ...await getAuthorizationHeaders(init.signal) };
    assertAuthSession(context);
    const response = await fetch(url, { ...init, headers });
    assertAuthSession(context);
    if (response.status !== 401 || attempt > 0 || !canRefreshAuth()) return response;
    await abortable(getValidAccessToken(true), init.signal);
    assertAuthSession(context);
  }
}
