import { OfflineQueuedError } from '../services/apiClient';

/** True when the action was accepted into the local offline queue instead of failing. */
export function isOfflineQueuedError(error: unknown): error is OfflineQueuedError {
  return error instanceof OfflineQueuedError;
}

