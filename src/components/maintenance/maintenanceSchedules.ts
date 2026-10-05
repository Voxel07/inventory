import { translate } from '../../utils/naming';
import type { Schedule, ScheduleInput } from '../../types/operations';

export type MaintenanceType = ScheduleInput['maintenanceType'];
export const MAINTENANCE_TYPES: MaintenanceType[] = ['dguv_v3', 'generator_service', 'battery_test', 'chrono_fps'];

export function maintenanceTypeLabel(type: string): string {
  switch (type) {
    case 'dguv_v3': return translate('DGUV V3 (Elektrische Betriebsmittel)', 'DGUV V3 (electrical equipment)');
    case 'generator_service': return translate('Generator-Service / Wartung', 'Generator service / maintenance');
    case 'battery_test': return translate('Batterietest / Akkupflege', 'Battery test / battery care');
    case 'chrono_fps': return translate('Chrono / FPS (Schusswaffen / Markierer)', 'Chrono / FPS (firearms / blasters)');
    default: return type;
  }
}

/** Calendar schedules the Maintenance page manages; meter-based plans stay in Warehouse tasks. */
export function isDateSchedule(schedule: Schedule): boolean {
  return schedule.active && schedule.intervalType === 'date';
}

export function scheduleIsOverdue(schedule: Schedule, now = new Date()): boolean {
  return Boolean(schedule.nextDueAt && new Date(schedule.nextDueAt) <= now);
}

/** The schedule a recorded inspection advances: the device's own plan first, then the item-wide one. */
export function matchingSchedule(schedules: Schedule[], itemId: string, assetId: string | undefined, type: string): Schedule | undefined {
  const candidates = schedules.filter((schedule) => isDateSchedule(schedule) && schedule.itemId === itemId && schedule.maintenanceType === type);
  return candidates.find((schedule) => assetId && schedule.assetInstanceId === assetId)
    ?? candidates.find((schedule) => !schedule.assetInstanceId);
}
