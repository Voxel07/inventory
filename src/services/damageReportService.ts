import pb from './pocketbaseClient';
import type { DamageReport, DamageReportFormData, DamageStatus } from '../types';

const COLLECTION = 'inventory_damage_reports';

export async function getDamageReports(itemId?: string): Promise<DamageReport[]> {
  const filter = itemId ? pb.filter('itemId = {:id}', { id: itemId }) : undefined;
  return pb.collection(COLLECTION).getFullList<DamageReport>({
    sort: '-timestamp',
    filter,
  });
}

export async function createDamageReport(data: DamageReportFormData): Promise<DamageReport> {
  const reportedBy = pb.authStore.record?.id;
  if (!reportedBy) throw new Error('Authentication required');

  const payload: DamageReportFormData & { status: DamageStatus; timestamp: string; reportedBy: string } = {
    ...data,
    status: 'reported',
    timestamp: new Date().toISOString(),
    reportedBy,
  };

  return pb.collection(COLLECTION).create<DamageReport>(payload);
}

export async function updateDamageReportStatus(
  id: string,
  status: DamageStatus,
): Promise<DamageReport> {
  // When written off, dynamic calculations will subtract report.amount from total stock.

  return pb.collection(COLLECTION).update<DamageReport>(id, { status });
}

export function subscribeToDamageReports(
  callback: (data: { action: string; record: DamageReport }) => void,
) {
  let disposed = false;
  let unsubscribe: (() => Promise<void>) | undefined;
  pb.collection(COLLECTION).subscribe<DamageReport>('*', (e) => {
    callback({ action: e.action, record: e.record });
  }).then((cleanup) => {
    if (disposed) void cleanup().catch((err) => console.warn(`Failed to clean up ${COLLECTION} subscription:`, err));
    else unsubscribe = cleanup;
  }).catch((err) => {
    console.warn(`Failed to subscribe to ${COLLECTION} realtime updates:`, err);
  });
  return () => {
    disposed = true;
    void unsubscribe?.().catch((err) => console.warn(`Failed to clean up ${COLLECTION} subscription:`, err));
  };
}
