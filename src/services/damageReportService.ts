import pb from './pocketbaseClient';
import type { DamageReport, DamageReportFormData, DamageStatus } from '../types';

const COLLECTION = 'inventory_damage_reports';

export async function getDamageReports(itemId?: string): Promise<DamageReport[]> {
  const filter = itemId ? `itemId = "${itemId}"` : undefined;
  return pb.collection(COLLECTION).getFullList<DamageReport>({
    sort: '-timestamp',
    filter,
  });
}

export async function createDamageReport(data: DamageReportFormData): Promise<DamageReport> {
  let reportedBy = pb.authStore.record?.id;
  if (!reportedBy) {
    try {
      const users = await pb.collection('users').getList(1, 1);
      if (users.items.length > 0) {
        reportedBy = users.items[0].id;
      }
    } catch (err) {
      console.warn('Could not fetch fallback user for damage report:', err);
    }
  }

  const payload: any = {
    ...data,
    status: 'reported',
    timestamp: new Date().toISOString(),
  };
  if (reportedBy) {
    payload.reportedBy = reportedBy;
  }

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
  pb.collection(COLLECTION).subscribe<DamageReport>('*', (e) => {
    callback({ action: e.action, record: e.record });
  }).catch((err) => {
    console.warn(`Failed to subscribe to ${COLLECTION} realtime updates:`, err);
  });
  return () => {
    pb.collection(COLLECTION).unsubscribe('*');
  };
}
