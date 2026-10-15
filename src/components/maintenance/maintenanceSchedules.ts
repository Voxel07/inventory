import { translate } from '../../utils/naming';
import type { Schedule } from '../../types/operations';

/** Calendar inspections due within this many days need attention; mirrors `MaintenancePolicy.CALENDAR_WARNING_DAYS`. */
export const CALENDAR_WARNING_DAYS = 30;

export function maintenanceTypeLabel(type: string): string {
  switch (type) {
    case 'dguv_v3': return translate('maintenance.maintenanceSchedules.dGUVV3ElectricalEquipment');
    case 'generator_service': return translate('maintenance.maintenanceSchedules.generatorServiceMaintenance');
    case 'battery_test': return translate('maintenance.maintenanceSchedules.batteryTestBatteryCare');
    case 'chrono_fps': return translate('maintenance.maintenanceSchedules.chronoFPSFirearmsBlasters');
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
