// Explicit offline snapshots: the only exhaustive catalog reads outside imports and exports. They run after
// sign-in, on reconnect and on account change; their download time is the offline completeness shown to users.
import { assertAuthSession, captureAuthSession } from './authManager';
import { assemblyApi } from './assemblyService';
import { eventApi } from './eventService';
import { snapshotItemCatalog } from './inventoryService';
import { getEventTypes, getFactions } from './referenceDataService';
import { storageLocationApi } from './storageLocationService';

export const OFFLINE_SNAPSHOT_EVENT = 'ash-offline-snapshot';

async function snapshot(): Promise<void> {
  const context = captureAuthSession();
  if (!navigator.onLine || !context.accountId) return;
  await Promise.allSettled([
    snapshotItemCatalog(context),
    assemblyApi.getAll(),
    storageLocationApi.getAll(),
    eventApi.getAll(),
    getFactions(),
    getEventTypes(),
  ]);
  assertAuthSession(context);
}

window.addEventListener(OFFLINE_SNAPSHOT_EVENT, () => { void snapshot().catch(() => {}); });
