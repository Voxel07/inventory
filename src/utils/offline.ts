import { OfflineQueuedError, RequestTimeoutError } from '../services/apiClient';

/** True when the action was accepted into the local offline queue instead of failing. */
export function isOfflineQueuedError(error: unknown): error is OfflineQueuedError {
  return error instanceof OfflineQueuedError;
}

/** True when a request was aborted because it exceeded the client-side timeout. */
export function isRequestTimeoutError(error: unknown): error is RequestTimeoutError {
  return error instanceof RequestTimeoutError;
}
