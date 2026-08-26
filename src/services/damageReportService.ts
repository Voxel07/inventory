import pb from './pocketbaseClient';
import type { DamageReport, DamageReportFormData, DamageStatus, DamageStatusHistoryEntry } from '../types';

const COLLECTION = 'inventory_damage_reports';

export async function getDamageReports(itemId?: string): Promise<DamageReport[]> {
  const filter = itemId ? pb.filter('itemId = {:id}', { id: itemId }) : undefined;
  return pb.collection(COLLECTION).getFullList<DamageReport>({
    sort: '-timestamp',
    filter,
    expand: 'reportedBy,handledBy',
  });
}

export async function createDamageReport(data: DamageReportFormData): Promise<DamageReport> {
  const reportedBy = pb.authStore.record?.id;
  if (!reportedBy) throw new Error('Authentication required');
  if (!Number.isInteger(data.amount) || data.amount < 1) throw new Error('Damage quantity must be a positive integer');

  const timestamp = new Date().toISOString();
  const statusHistory: DamageStatusHistoryEntry[] = [{ status: 'reported', userId: reportedBy, timestamp }];
  const payload: DamageReportFormData & { status: DamageStatus; timestamp: string; reportedBy: string; repairedAmount: number; writtenOffAmount: number; statusHistory: DamageStatusHistoryEntry[] } = {
    ...data,
    status: 'reported',
    timestamp,
    reportedBy,
    repairedAmount: 0,
    writtenOffAmount: 0,
    statusHistory,
  };

  return pb.collection(COLLECTION).create<DamageReport>(payload);
}

export async function updateDamageReportStatus(
  id: string,
  status: DamageStatus,
  amount?: number,
): Promise<DamageReport> {
  const handledBy = pb.authStore.record?.id;
  if (!handledBy) throw new Error('Authentication required');

  const report = await pb.collection(COLLECTION).getOne<DamageReport>(id);
  const handledAt = new Date().toISOString();
  const previousHistory: DamageStatusHistoryEntry[] = Array.isArray(report.statusHistory) && report.statusHistory.length
    ? report.statusHistory
    : [{ status: 'reported', userId: report.reportedBy, timestamp: report.timestamp }];
  if (status === 'in_review') {
    if (report.status !== 'reported') throw new Error(`Cannot change damage status from ${report.status} to ${status}`);
    const statusHistory: DamageStatusHistoryEntry[] = [...previousHistory, { status, userId: handledBy, timestamp: handledAt }];
    const updatePayload = { status, handledBy, handledAt, statusHistory };
    return pb.collection(COLLECTION).update<DamageReport>(id, updatePayload, { expand: 'reportedBy,handledBy' });
  }

  if (status !== 'repaired' && status !== 'written_off') throw new Error(`Unsupported damage resolution: ${status}`);
  if (report.status !== 'reported' && report.status !== 'in_review') throw new Error(`Damage report is already resolved`);

  const repairedAmount = report.repairedAmount ?? 0;
  const writtenOffAmount = report.writtenOffAmount ?? 0;
  const unresolvedAmount = Math.max(0, report.amount - repairedAmount - writtenOffAmount);
  if (amount === undefined || !Number.isInteger(amount) || amount < 1 || amount > unresolvedAmount) {
    throw new Error(`Resolution quantity must be between 1 and ${unresolvedAmount}`);
  }

  const nextRepairedAmount = repairedAmount + (status === 'repaired' ? amount : 0);
  const nextWrittenOffAmount = writtenOffAmount + (status === 'written_off' ? amount : 0);
  const remainingAmount = report.amount - nextRepairedAmount - nextWrittenOffAmount;
  const nextStatus: DamageStatus = remainingAmount > 0
    ? 'in_review'
    : nextRepairedAmount === report.amount
      ? 'repaired'
      : nextWrittenOffAmount === report.amount
        ? 'written_off'
        : 'resolved';
  const statusHistory: DamageStatusHistoryEntry[] = [
    ...previousHistory,
    { status, userId: handledBy, timestamp: handledAt, amount },
  ];
  const updatePayload = {
    status: nextStatus,
    repairedAmount: nextRepairedAmount,
    writtenOffAmount: nextWrittenOffAmount,
    handledBy,
    handledAt,
    statusHistory,
  };

  const transactionPayload = {
    itemId: report.itemId,
    transactionType: status,
    quantityChanged: amount,
    userId: handledBy,
    damageReportId: id,
    reason: status === 'written_off' ? 'Damage written off' : 'Damage repaired',
    notes: `Damage report ${id}: ${report.description}`,
    timestamp: handledAt,
  };
  const batch = pb.createBatch();
  batch.collection(COLLECTION).update(id, updatePayload);
  batch.collection('inventory_stock_transactions').create(transactionPayload);
  const [updatedResult] = await batch.send();
  return updatedResult.body as DamageReport;
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
