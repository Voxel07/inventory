import pb from './pocketbaseClient';
import type { DamageReport, DamageReportFormData } from '../types';

const COLLECTION = 'inventory_damage_reports';

export async function getDamageReports(itemId?: string): Promise<DamageReport[]> {
  const filter = itemId ? `itemId = "${itemId}"` : undefined;
  return pb.collection(COLLECTION).getFullList<DamageReport>({
    sort: '-timestamp',
    filter,
  });
}

export async function createDamageReport(data: DamageReportFormData): Promise<DamageReport> {
  const reportedBy = pb.authStore.record?.id || '';
  return pb.collection(COLLECTION).create<DamageReport>({
    ...data,
    reportedBy,
    status: 'reported',
    timestamp: new Date().toISOString(),
  });
}

export async function updateDamageReportStatus(
  id: string,
  status: DamageReport['status'],
): Promise<DamageReport> {
  return pb.collection(COLLECTION).update<DamageReport>(id, { status });
}

export function subscribeToDamageReports(
  callback: (data: { action: string; record: DamageReport }) => void,
) {
  pb.collection(COLLECTION).subscribe<DamageReport>('*', (e) => {
    callback({ action: e.action, record: e.record });
  });
  return () => {
    pb.collection(COLLECTION).unsubscribe('*');
  };
}
