import pb from './pocketbaseClient';
import type { DamageReport, DamageReportFormData, DamageStatus } from '../types';

const COLLECTION = 'inventory_damage_reports';
const ITEMS_COLLECTION = 'inventory_items';

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
  status: DamageStatus,
): Promise<DamageReport> {
  const report = await pb.collection(COLLECTION).getOne<DamageReport>(id);

  // When written off, permanently reduce the item's total stock
  if (status === 'written_off') {
    const item = await pb.collection(ITEMS_COLLECTION).getOne(report.itemId);
    const newAmount = Math.max(0, (item.amount ?? 0) - (report.amount ?? 0));
    await pb.collection(ITEMS_COLLECTION).update(report.itemId, { amount: newAmount });
  }

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
