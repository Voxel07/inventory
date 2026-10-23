import { calendarDate } from '../../utils/dateFormat';
import { maintenanceTypeLabel } from '../maintenance/maintenanceSchedules';
import type { MaintenanceType, ScheduleIntervalType } from '../../types/operations';
import type { ItemScheduleInput } from '../../types';
import type { useT } from '../../utils/naming';

/** One interval as edited in the dialog; numeric inputs stay strings; dates are epoch milliseconds. */
export type ScheduleDraft = {
    type: MaintenanceType;
    intervalType: ScheduleIntervalType;
    intervalValue: string;
    nextDueDate: number | '';
    nextDueValue: string;
    checkoutBlocking: boolean;
};

const DEFAULT_INTERVAL: Record<ScheduleIntervalType, number> = { date: 365, operating_hours: 100, usage_count: 20 };
export const SCHEDULE_NUMBER = /^\d+(\.\d+)?$/;

export function daysFromToday(days: number): number {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return calendarDate(date);
}

export function newDraft(intervalType: ScheduleIntervalType, hours: number, type: MaintenanceType = 'dguv_v3'): ScheduleDraft {
    const interval = DEFAULT_INTERVAL[intervalType];
    return {
        type,
        intervalType,
        intervalValue: String(interval),
        nextDueDate: daysFromToday(interval),
        nextDueValue: String((intervalType === 'operating_hours' ? hours : 0) + interval),
        checkoutBlocking: true,
    };
}

export function draftValid(draft: ScheduleDraft): boolean {
    const intervalValid = SCHEDULE_NUMBER.test(draft.intervalValue) && Number(draft.intervalValue) > 0;
    const dueValid = draft.intervalType === 'date' ? Boolean(draft.nextDueDate) : SCHEDULE_NUMBER.test(draft.nextDueValue);
    return intervalValid && dueValid;
}

export function toScheduleInput(draft: ScheduleDraft): ItemScheduleInput {
    const byDate = draft.intervalType === 'date';
    return {
        maintenanceType: draft.type,
        intervalType: draft.intervalType,
        intervalValue: Number(draft.intervalValue),
        nextDueAt: byDate ? Number(draft.nextDueDate) : null,
        nextDueValue: byDate ? null : Number(draft.nextDueValue),
        warningWindow: byDate ? 30 : 10,
        checkoutBlocking: draft.checkoutBlocking,
    };
}

/** "DGUV V3 · every 365 days" for the item form's summary line. */
export function describeScheduleDraft(draft: ScheduleDraft, t: ReturnType<typeof useT>): string {
    const unit = draft.intervalType === 'operating_hours' ? 'h'
        : draft.intervalType === 'usage_count' ? t('maintenance.assetMaintenance.uses') : t('maintenance.assetMaintenance.days');
    return `${maintenanceTypeLabel(draft.type)} · ${t('maintenance.assetMaintenance.everyIntervalValueValue', { intervalValue: draft.intervalValue, value: unit })}`;
}
