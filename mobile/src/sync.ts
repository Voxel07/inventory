import * as Crypto from 'expo-crypto';
import { ApiError, postTransaction, request } from './api';
import { getData, setData } from './data';
import type { OfflineAction, SyncIssue, TransactionInput } from './types';

const QUEUE = 'sync.queue';
const ISSUES = 'sync.issues';
let mutation = Promise.resolve();
let syncing: Promise<void> | null = null;

async function read<T>(key: string): Promise<T[]> {
  const raw = await getData(key);
  return raw ? JSON.parse(raw) as T[] : [];
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutation.then(operation);
  mutation = result.then(() => undefined, () => undefined);
  return result;
}

export const queuedActions = () => read<OfflineAction>(QUEUE);
export const syncIssues = () => read<SyncIssue>(ISSUES);

export async function enqueue(input: TransactionInput, idempotencyKey = Crypto.randomUUID()): Promise<OfflineAction> {
  const action: OfflineAction = { idempotencyKey, type: 'transaction', payload: input, localTimestamp: new Date().toISOString() };
  await serialize(async () => {
    const queue = await queuedActions();
    if (!queue.some((entry) => entry.idempotencyKey === idempotencyKey)) {
      queue.push(action);
      await setData(QUEUE, JSON.stringify(queue));
    }
  });
  return action;
}

export async function submit(input: TransactionInput): Promise<'applied' | 'queued'> {
  const idempotencyKey = Crypto.randomUUID();
  try {
    await postTransaction(input, idempotencyKey);
    return 'applied';
  } catch (error) {
    if (error instanceof ApiError) throw error;
    await enqueue(input, idempotencyKey);
    return 'queued';
  }
}

export async function flush(): Promise<void> {
  if (syncing) return syncing;
  syncing = doFlush().finally(() => { syncing = null; });
  return syncing;
}

async function doFlush(): Promise<void> {
  // Snapshot and apply results in a serialized mutation so a new scan cannot be lost.
  const actions = await queuedActions();
  if (!actions.length) return;
  const batch = await request<{ results: Array<{ idempotencyKey: string; status: 'applied' | 'conflict' | 'rejected'; error?: string }> }>('/api/sync', {
    method: 'POST', body: { actions },
  });
  await serialize(async () => {
    const queue = await queuedActions();
    const issues = await syncIssues();
    for (const result of batch.results) {
      const action = queue.find((entry) => entry.idempotencyKey === result.idempotencyKey);
      if (!action) continue;
      if (result.status !== 'applied' && !issues.some((issue) => issue.idempotencyKey === action.idempotencyKey)) {
        issues.push({ ...action, status: result.status, error: result.error || result.status });
      }
    }
    const resolved = new Set(batch.results.map((result) => result.idempotencyKey));
    await setData(ISSUES, JSON.stringify(issues));
    await setData(QUEUE, JSON.stringify(queue.filter((action) => !resolved.has(action.idempotencyKey))));
  });
}

export async function discardIssue(id: string): Promise<void> {
  await serialize(async () => setData(ISSUES, JSON.stringify((await syncIssues()).filter((issue) => issue.idempotencyKey !== id))));
}
