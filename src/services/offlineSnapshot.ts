// Full catalog downloads are explicitly requested; reconnect only refreshes visible queries.
import { assertAuthSession, captureAuthSession, subscribeAuth } from './authManager';
import { assemblyApi } from './assemblyService';
import { eventApi } from './eventService';
import { snapshotItemCatalog } from './inventoryService';
import { getEventTypes, getFactions } from './referenceDataService';
import { storageLocationApi } from './storageLocationService';
import { getOfflineCatalog, setOfflineCatalog } from './offlineQueue';
import type { Page } from './apiPagination';

type SnapshotStatus = { kind: 'idle' | 'downloading' | 'complete' | 'partial'; completed: number; total: number; failed: string[]; finishedAt?: number };
const idle = (): SnapshotStatus => ({ kind: 'idle', completed: 0, total: 6, failed: [] });
let status = idle();
let pending: { generation: number; promise: Promise<void> } | undefined;
const listeners = new Set<() => void>();
const publish = (next: SnapshotStatus) => { status = next; listeners.forEach(listener => listener()); };
export const getSnapshotStatus = () => status;
export const subscribeSnapshot = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
let generation = captureAuthSession().generation;
subscribeAuth(() => {
  if (generation !== captureAuthSession().generation) { generation = captureAuthSession().generation; pending = undefined; publish(idle()); }
});

async function downloadPages<T>(getPage: (page: number, size: number) => Promise<Page<T>>) {
  for (let page = 0; page < 100; page++) if (!(await getPage(page, 100)).more) return;
  throw new Error('Offline catalog exceeds 10,000 records');
}

export function downloadOfflineCatalog(): Promise<void> {
  const context = captureAuthSession();
  if (pending?.generation === context.generation) return pending.promise;
  if (!navigator.onLine || !context.accountId) return Promise.reject(new Error('An online session is required'));
  const tasks: [string, () => Promise<unknown>][] = [
    ['items', () => snapshotItemCatalog(context)],
    ['assemblies', () => downloadPages((page, size) => assemblyApi.getPage({}, page, size, true))],
    ['locations', () => downloadPages((page, size) => storageLocationApi.getPage({}, page, size, true))],
    ['events', () => downloadPages((page, size) => eventApi.getPage({}, page, size, true))],
    ['factions', () => getFactions(true)], ['event types', () => getEventTypes(true)],
  ];
  const promise = (async () => {
    const failed: string[] = [];
    publish({ kind: 'downloading', completed: 0, total: tasks.length, failed });
    for (let index = 0; index < tasks.length; index++) {
      assertAuthSession(context);
      if (!navigator.onLine) { failed.push(...tasks.slice(index).map(([name]) => name)); break; }
      try { await tasks[index][1](); } catch { failed.push(tasks[index][0]); }
      assertAuthSession(context);
      publish({ kind: 'downloading', completed: index + 1, total: tasks.length, failed: [...failed] });
    }
    assertAuthSession(context);
    const finished: SnapshotStatus = { kind: failed.length ? 'partial' : 'complete', completed: tasks.length - failed.length,
      total: tasks.length, failed, finishedAt: Date.now() };
    await setOfflineCatalog('offline-snapshot-status', finished, context, true);
    publish(finished);
  })().catch(error => { if (captureAuthSession().generation === context.generation) publish({ ...status, kind: 'partial', failed: [...status.failed, 'storage/session'], finishedAt: Date.now() }); throw error; }).finally(() => { if (pending?.generation === context.generation) pending = undefined; });
  pending = { generation: context.generation, promise };
  return promise;
}

export async function restoreSnapshotStatus() {
  const context = captureAuthSession();
  const saved = await getOfflineCatalog<SnapshotStatus>('offline-snapshot-status', context);
  assertAuthSession(context);
  if (saved && !pending && saved.total === 6 && (saved.kind === 'complete' || saved.kind === 'partial')) publish(saved);
}
