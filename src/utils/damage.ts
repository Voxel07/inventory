import type { DamageReport } from '../types';

const CLOSED_DAMAGE = ['repaired', 'verified', 'returned_to_service', 'written_off', 'resolved'];

/** Damage stays open until it is repaired, written off or otherwise closed. */
export const isOpenDamage = (report: Pick<DamageReport, 'status'>) => !CLOSED_DAMAGE.includes(report.status);
