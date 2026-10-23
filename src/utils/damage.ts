import type { DamageReport } from '../types';
import { OPEN_DAMAGE_STATUSES } from '../types/damageReport';

/** Damage stays open until it is repaired, written off or otherwise closed. */
export const isOpenDamage = (report: Pick<DamageReport, 'status'>) => OPEN_DAMAGE_STATUSES.includes(report.status);
