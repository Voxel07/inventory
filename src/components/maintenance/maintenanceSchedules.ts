import { translate } from '../../utils/naming';
import type { Schedule } from '../../types/operations';

export function maintenanceTypeLabel(type: string): string {
  switch (type) {
    case 'dguv_v3': return translate('maintenance.maintenanceSchedules.dGUVV3ElectricalEquipment');
    case 'generator_service': return translate('maintenance.maintenanceSchedules.generatorServiceMaintenance');
    case 'battery_test': return translate('maintenance.maintenanceSchedules.batteryTestBatteryCare');
    case 'chrono_fps': return translate('maintenance.maintenanceSchedules.chronoFPSFirearmsBlasters');
    default: return type;
  }
}

export function scheduleIsOverdue(schedule: Schedule, now = new Date()): boolean {
  return Boolean(schedule.nextDueAt != null && new Date(schedule.nextDueAt) <= now);
}
