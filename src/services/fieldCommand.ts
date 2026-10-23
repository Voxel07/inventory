import { apiRequest } from './apiClient';
import { ApiError } from './apiTransport';
import type { OfflineCommand } from './offlineQueue';

/** The same audited command is used online and during replay, including after a lost response. */
export async function fieldCommand<T>(command: OfflineCommand, idempotencyKey: string = crypto.randomUUID()): Promise<T> {
  const result = await apiRequest<{ results: { status: string; entity: T; error?: string }[] }>('/api/sync', {
    method: 'POST', body: { actions: [{ ...command, idempotencyKey, localTimestamp: Date.now() }] },
    offline: { ...command, idempotencyKey },
  });
  const outcome = result.results[0];
  if (outcome.status !== 'applied') throw new ApiError(outcome.status === 'conflict' ? 409 : 400, outcome.error ?? 'Command rejected');
  return outcome.entity;
}
