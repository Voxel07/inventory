import { API_URL } from '../config/runtimeConfig';
import { containsPrivateInventory, referencesPrivateInventory } from './privateInventoryCache';
import { assertAuthSession, captureAuthSession, getAuthSnapshot, SessionChangedError, type AuthSessionContext } from './authManager';
import { translate } from '../utils/naming';
import type { DamageReportFormData, FactionOrderFormData, TransactionFormData } from '../types';
import { isAbortError } from './abort';
import { ApiError, authorizedFetch, InvalidResponseError, REQUEST_TIMEOUT_MS, RequestTimeoutError, responseError } from './apiTransport';

/**
 * Commands that may be queued offline and replayed through /api/sync; each type names its payload shape.
 * Stored actions keep the generic JSON form because they are read back from browser storage and edited in the
 * conflict-correction UI.
 */
export type OfflineCommand =
  | { type: 'transaction'; payload: TransactionFormData }
  | { type: 'damage.create'; payload: DamageReportFormData }
  | { type: 'order.create'; payload: ({ kind: 'faction' } & FactionOrderFormData) | ({ kind: 'general' } & import('../types').GeneralOrderFormData) }
  | { type: 'order.transition'; payload: { orderId: string; status: string; notes?: string | null; [field: string]: unknown } }
  | { type: 'order.prepare'; payload: { orderId: string; input: Record<string, unknown> } }
  | { type: 'order.return'; payload: { orderId: string; input: Record<string, unknown> } };

export type OfflineAction = {
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
  localTimestamp: string;
  ownerId?: string;
  supersedes?: string;
  resolutionNote?: string;
};

const DB_NAME = 'ash-inventory';
const DB_VERSION = 4;
const STORE = 'sync-queue';
const CATALOG_STORE = 'catalog-cache';
const FAILURES_STORE = 'sync-failures';
const HISTORY_STORE = 'sync-history';
const catalogFallbacks = new Map<string, string>();
export const getCatalogFallbacks = () => [...catalogFallbacks.entries()].filter(([key]) => key.startsWith(`${captureAuthSession().catalogScope}:`)).map(([key, cachedAt]) => ({ key, cachedAt }));

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE, { keyPath: 'idempotencyKey' });
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'idempotencyKey' });
      }
      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        db.createObjectStore(CATALOG_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(FAILURES_STORE)) {
        db.createObjectStore(FAILURES_STORE, { keyPath: 'idempotencyKey' });
      }
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(translate('services.offlineQueue.closeOlderInventoryTabsAndReloadToUpgradeOfflineStorage')));
  });
}

export async function setOfflineCatalog<T>(key: string, data: T, context = captureAuthSession()): Promise<void> {
  return setOfflineCatalogEntries([{ key, data }], context);
}

/** Save a query page and its exact resource entries with one download timestamp. */
export async function setOfflineCatalogEntries(entries: { key: string; data: unknown }[], context = captureAuthSession()): Promise<void> {
  assertAuthSession(context);
  const protectedEntries = entries.filter(entry => containsPrivateInventory(entry.data));
  await Promise.all(protectedEntries.map(entry => removeOfflineCatalog(entry.key, context)));
  entries = entries.filter(entry => !containsPrivateInventory(entry.data));
  if (!context.accountId || !entries.length) return;
  const cachedAt = new Date().toISOString();
  const rows = entries.map((entry) => ({ ...entry, key: `${context.catalogScope}:${entry.key}`, cachedAt }));
  try {
    const db = await openDatabase();
    assertAuthSession(context);
    await transactionPromise(db, CATALOG_STORE, 'readwrite', (store) => {
      rows.forEach((row) => store.put(row));
    });
    assertAuthSession(context);
    const cleared = rows.map((row) => catalogFallbacks.delete(row.key)).some(Boolean);
    if (cleared) window.dispatchEvent(new Event('ash-offline-cache'));
  } catch (err) {
    assertAuthSession(context);
    console.warn('Failed to cache catalog offline', err);
  }
}

export async function removeOfflineCatalog(key: string, context = captureAuthSession()): Promise<void> {
  assertAuthSession(context);
  if (!context.accountId) return;
  const catalogKey = `${context.catalogScope}:${key}`;
  try {
    const db = await openDatabase();
    assertAuthSession(context);
    await transactionPromise(db, CATALOG_STORE, 'readwrite', (store) => store.delete(catalogKey));
    assertAuthSession(context);
    if (catalogFallbacks.delete(catalogKey)) window.dispatchEvent(new Event('ash-offline-cache'));
  } catch (err) {
    assertAuthSession(context);
    console.warn('Failed to remove offline catalog entry', err);
  }
}

export async function getOfflineCatalog<T>(key: string, context = captureAuthSession()): Promise<T | null> {
  assertAuthSession(context);
  if (!context.accountId) return null;
  const catalogKey = `${context.catalogScope}:${key}`;
  try {
    const db = await openDatabase();
    assertAuthSession(context);
    return await new Promise<T | null>((resolve, reject) => {
      const request = db.transaction(CATALOG_STORE, 'readonly').objectStore(CATALOG_STORE).get(catalogKey);
      request.onsuccess = () => {
        try { assertAuthSession(context); } catch (error) { reject(error); return; }
        if (request.result) { catalogFallbacks.set(catalogKey, request.result.cachedAt); window.dispatchEvent(new Event('ash-offline-cache')); }
        resolve(request.result ? (request.result.data as T) : null);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    assertAuthSession(context);
    return null;
  }
}

export async function enqueueOfflineAction(action: OfflineAction, context: AuthSessionContext = captureAuthSession()): Promise<void> {
  if (referencesPrivateInventory(action.payload)) throw new Error(translate('services.offlineQueue.privateInventoryActionsRequireAnOnlineConnection'));
  assertAuthSession(context);
  const actionOwner = context.accountId;
  const db = await openDatabase();
  assertAuthSession(context);
  if (!actionOwner) throw new Error(translate('services.offlineQueue.signInBeforeSavingAnOfflineAction'));
  await transactionPromise(db, STORE, 'readwrite', (store) => store.put({ ...action, ownerId: actionOwner }));
  assertAuthSession(context);
  await notifyQueueChanged();
}

async function readStore<T>(store: string, context: AuthSessionContext): Promise<T[]> {
  const db = await openDatabase();
  assertAuthSession(context);
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => {
      try { assertAuthSession(context); resolve(request.result as T[]); } catch (error) { reject(error); }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineActions(): Promise<OfflineAction[]> {
  const context = captureAuthSession();
  const rows = await readStore<OfflineAction>(STORE, context);
  assertAuthSession(context);
  return rows.filter((action) => Boolean(context.accountId) && action.ownerId === context.accountId)
    .sort((a, b) => a.localTimestamp.localeCompare(b.localTimestamp));
}

export async function discardOfflineAction(idempotencyKey: string): Promise<void> {
  const context = captureAuthSession();
  if (flushInFlight) throw new Error('SYNC_IN_PROGRESS');
  const db = await openDatabase();
  const action = (await getOfflineActions()).find((entry) => entry.idempotencyKey === idempotencyKey);
  assertAuthSession(context);
  if (!action) throw new Error(translate('services.offlineQueue.queuedActionNotFound'));
  await archiveAndDelete(db, STORE, action, 'discarded');
  assertAuthSession(context);
  await notifyQueueChanged();
}

export async function getOfflineQueueCount(): Promise<number> {
  return (await getOfflineActions()).length;
}

export type SyncFailure = {
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
  ownerId?: string;
  localTimestamp?: string;
  status: 'conflict' | 'rejected';
  error: string;
  timestamp: string;
};

export async function getSyncFailures(): Promise<SyncFailure[]> {
  const context = captureAuthSession();
  const rows = await readStore<SyncFailure>(FAILURES_STORE, context);
  assertAuthSession(context);
  return rows.filter((failure) => Boolean(context.accountId) && failure.ownerId === context.accountId);
}

export async function getSyncFailureCount(): Promise<number> {
  return (await getSyncFailures()).length;
}

export async function discardSyncFailure(idempotencyKey: string): Promise<void> {
  const context = captureAuthSession();
  const db = await openDatabase();
  const failure = (await getSyncFailures()).find((entry) => entry.idempotencyKey === idempotencyKey);
  assertAuthSession(context);
  if (!failure) throw new Error(translate('services.offlineQueue.syncFailureNotFound'));
  await archiveAndDelete(db, FAILURES_STORE, failure, 'archived');
  assertAuthSession(context);
  await notifyQueueChanged();
}

/**
 * Replay state. Transient failures (network, timeout, 5xx, 429, local storage) retry with backoff or
 * {@code Retry-After}; terminal failures pause replay until the user acts. Queued commands keep their UUIDs.
 */
export type SyncState =
  | { kind: 'idle' }
  | { kind: 'retrying'; reason: 'network' | 'server' | 'rate_limited' | 'storage'; message: string; retryAt: string }
  | { kind: 'paused'; reason: 'auth' | 'forbidden' | 'rejected' | 'invalid_response'; message: string };

let syncState: SyncState = { kind: 'idle' };
/** Session token that the server rejected; replay resumes by itself once the token changes. */
let pausedToken: string | null = null;
let pausedGeneration = -1;
export const getSyncState = (): SyncState => syncState;

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight = false;
let flushAttempt = 0;

function scheduleFlush(delayMs: number): void {
  if (flushTimer || flushInFlight) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushOfflineQueue();
  }, delayMs);
}

type SyncResult = { idempotencyKey: string; status: 'applied' | 'conflict' | 'rejected'; error?: string };

function syncResults(payload: unknown): SyncResult[] {
  const results = typeof payload === 'object' && payload !== null ? (payload as { results?: unknown }).results : undefined;
  if (!Array.isArray(results) || !results.every((result) => typeof result === 'object' && result !== null
    && typeof result.idempotencyKey === 'string' && typeof result.status === 'string'
    && (result.error === undefined || result.error === null || typeof result.error === 'string'))) {
    throw new InvalidResponseError(translate('services.offlineQueue.theServerReturnedAnInvalidSynchronizationResponse'));
  }
  return (results as SyncResult[]).filter((result) => ['applied', 'conflict', 'rejected'].includes(result.status));
}

function pause(reason: Extract<SyncState, { kind: 'paused' }>['reason'], message: string, cause: unknown): null {
  console.warn(`Offline replay paused (${reason})`, cause);
  syncState = { kind: 'paused', reason, message };
  pausedToken = getAuthSnapshot().token;
  pausedGeneration = getAuthSnapshot().generation;
  return null;
}

function retry(reason: Extract<SyncState, { kind: 'retrying' }>['reason'], message: string, cause: unknown, retryAfterSeconds?: number): number {
  console.warn(`Offline replay will retry (${reason})`, cause);
  flushAttempt += 1;
  const delay = retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : Math.min(60_000, 2_000 * 2 ** flushAttempt);
  syncState = { kind: 'retrying', reason, message, retryAt: new Date(Date.now() + delay).toISOString() };
  return delay;
}

/** Maps one failed replay to its retry delay, or {@code null} when it paused. */
function classifyFailure(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ApiError) {
    if (error.status === 401) return pause('auth', translate('services.offlineQueue.signInAgainToSendQueuedActions'), error);
    if (error.status === 403) return pause('forbidden', translate('services.offlineQueue.theServerDeniedSynchronizationMessage', { message: message }), error);
    if (error.status === 429) return retry('rate_limited', message, error, error.retryAfterSeconds);
    if (error.status === 408 || error.status >= 500) return retry('server', message, error, error.retryAfterSeconds);
    return pause('rejected', translate('services.offlineQueue.theServerRejectedSynchronizationMessage', { message: message }), error);
  }
  if (error instanceof InvalidResponseError) return pause('invalid_response', message, error);
  if (error instanceof TypeError || error instanceof RequestTimeoutError || isAbortError(error)) return retry('network', message, error);
  if (error instanceof SessionChangedError) return 1_000;
  return retry('storage', translate('services.offlineQueue.localStorageUnavailableMessage', { message: message }), error);
}

/**
 * Sends queued actions. {@code resume}: an explicit user request that also lifts a terminal pause; automatic
 * triggers leave a pause in place unless the session that caused it has changed.
 */
export async function flushOfflineQueue(options: { resume?: boolean } = {}): Promise<void> {
  if (!navigator.onLine || flushInFlight) return;
  if (syncState.kind === 'paused' && !options.resume) {
    const auth = getAuthSnapshot();
    const sessionChanged = auth.generation !== pausedGeneration || (syncState.reason === 'auth' && auth.token !== pausedToken);
    if (!sessionChanged) return;
  }
  const context = captureAuthSession();
  flushInFlight = true;
  let retryDelay: number | null = null;
  let paused = false;
  try {
    const actions = (await getOfflineActions()).slice(0, 100);
    if (!actions.length) {
      flushAttempt = 0;
      syncState = { kind: 'idle' };
      return;
    }
    if (!context.accountId || actions.some((action) => action.ownerId !== context.accountId)) throw new SessionChangedError();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let results: SyncResult[];
    try {
      const response = await authorizedFetch(`${API_URL}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ actions }),
        signal: controller.signal,
      }, context);
      if (!response.ok) throw await responseError(response);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch (cause) {
        throw new InvalidResponseError(translate('services.offlineQueue.theServerReturnedAnUnreadableSynchronizationResponse'), { cause });
      }
      results = syncResults(payload);
    } finally {
      clearTimeout(timeout);
    }
    await storeResults(actions, results);
    flushAttempt = 0;
    syncState = { kind: 'idle' };
    if (context.generation === getAuthSnapshot().generation) {
      window.dispatchEvent(new CustomEvent('ash-api-change', { detail: { type: 'sync.completed' } }));
    }
  } catch (error) {
    retryDelay = classifyFailure(error);
    paused = retryDelay === null;
  } finally {
    flushInFlight = false;
  }
  if (context.generation === getAuthSnapshot().generation) await notifyQueueChanged().catch(() => {});
  if (paused) return;
  if (retryDelay !== null) scheduleFlush(retryDelay);
  else if (await getOfflineQueueCount().catch(() => 0)) scheduleFlush(1000);
}

async function storeResults(actions: OfflineAction[], results: SyncResult[]): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, FAILURES_STORE, HISTORY_STORE], 'readwrite');
    const queueStore = tx.objectStore(STORE);
    const failuresStore = tx.objectStore(FAILURES_STORE);
    for (const result of results) {
      const original = actions.find((action) => action.idempotencyKey === result.idempotencyKey);
      if (!original) continue;
      queueStore.delete(result.idempotencyKey);
      tx.objectStore(HISTORY_STORE).put({ ...original, status: result.status, error: result.error, timestamp: new Date().toISOString() });
      if (result.status === 'applied') {
        failuresStore.delete(result.idempotencyKey);
      } else {
        failuresStore.put({
          idempotencyKey: result.idempotencyKey,
          ownerId: original.ownerId,
          localTimestamp: original.localTimestamp,
          type: original.type,
          payload: original.payload,
          status: result.status,
          error: result.error || result.status,
          timestamp: new Date().toISOString(),
        } satisfies SyncFailure);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storing synchronization results was aborted'));
  });
}

async function notifyQueueChanged() {
  const context = captureAuthSession();
  const [queued, failures] = await Promise.all([getOfflineQueueCount(), getSyncFailureCount()]);
  assertAuthSession(context);
  window.dispatchEvent(new CustomEvent('ash-offline-queue', { detail: { queued, failures, sync: syncState } }));
}

function transactionPromise(db: IDBDatabase, storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    operation(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export type OfflineHistory = Omit<SyncFailure, 'status'> & { status: string; supersedes?: string; resolutionNote?: string };
export async function getOfflineHistory(): Promise<OfflineHistory[]> {
  const context = captureAuthSession();
  const rows = await readStore<OfflineHistory>(HISTORY_STORE, context);
  assertAuthSession(context);
  return rows.filter((entry) => Boolean(context.accountId) && entry.ownerId === context.accountId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
export async function getCacheFreshness(): Promise<{ key: string; cachedAt: string }[]> {
  const context = captureAuthSession();
  const prefix = `${context.catalogScope}:`;
  const rows = await readStore<{ key: string; cachedAt: string }>(CATALOG_STORE, context);
  assertAuthSession(context);
  return rows.filter((entry) => entry.key.startsWith(prefix))
    .map((entry) => ({ key: entry.key.slice(prefix.length), cachedAt: entry.cachedAt }));
}

async function archiveAndDelete(db: IDBDatabase, source: string, entry: OfflineAction | SyncFailure, status: string) {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([source, HISTORY_STORE], 'readwrite');
    tx.objectStore(HISTORY_STORE).put({ ...entry, status, timestamp: new Date().toISOString() });
    tx.objectStore(source).delete(entry.idempotencyKey);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function correctSyncFailure(failure: SyncFailure, payload: Record<string, unknown>, resolutionNote: string): Promise<void> {
  const context = captureAuthSession();
  if (!context.accountId || failure.ownerId !== context.accountId) throw new Error(translate('services.offlineQueue.failureBelongsToAnotherAccount'));
  if (!navigator.onLine) throw new Error(translate('services.offlineQueue.reconnectAndReviewCurrentServerStateBeforeCorrecting'));
  if (!resolutionNote.trim()) throw new Error(translate('services.offlineQueue.explainTheCorrection'));
  if (flushInFlight) throw new Error(translate('services.offlineQueue.waitForSynchronizationToFinish'));
  const stored = (await getSyncFailures()).find((entry) => entry.idempotencyKey === failure.idempotencyKey);
  assertAuthSession(context);
  if (!stored) throw new Error(translate('services.offlineQueue.failureHasAlreadyBeenResolved'));
  const db = await openDatabase();
  assertAuthSession(context);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, FAILURES_STORE, HISTORY_STORE], 'readwrite');
    tx.objectStore(STORE).put({ idempotencyKey: crypto.randomUUID(), ownerId: context.accountId, type: failure.type, payload, localTimestamp: new Date().toISOString(), supersedes: failure.idempotencyKey, resolutionNote });
    tx.objectStore(HISTORY_STORE).put({ ...failure, status: 'superseded', resolutionNote, timestamp: new Date().toISOString() });
    tx.objectStore(FAILURES_STORE).delete(failure.idempotencyKey);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
  assertAuthSession(context);
  await notifyQueueChanged(); void flushOfflineQueue({ resume: true });
}
