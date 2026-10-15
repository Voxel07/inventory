import { Button } from '../shared/ActionButtons';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Box, Chip, FormControlLabel, MenuItem, Paper, Stack, Switch, Typography } from '@mui/material';
import { TextField } from '../shared/DateTextField';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import { useCompleteList } from '../../hooks/usePagedList';
import { operationsApi } from '../../services/operationsService';
import { useUIStore } from '../../store/uiStore';
import { formatDate } from '../../utils/dateFormat';
import { translate, useT } from '../../utils/naming';
import type { AssetInstance, Item } from '../../types';
import type { Schedule, ScheduleInput } from '../../types/operations';
import { maintenanceTypeLabel, scheduleIsOverdue } from './maintenanceSchedules';
import { MAINTENANCE_TYPES, type MaintenanceType } from '../../types/operations';
import { oneOf } from '../../utils/operationForm';

type IntervalType = ScheduleInput['intervalType'];
type Draft = { id?: string; type: MaintenanceType; intervalType: IntervalType; intervalValue: string; nextDueDate: string; nextDueValue: string; checkoutBlocking: boolean };

function dateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateInputValue(date);
}

/**
 * Maintenance plans of one serialized asset. An asset's own plan replaces the item-wide plan of the same
 * type, so each unit keeps its own interval, due date and operating-hour counter.
 */
export function AssetMaintenance({ item, asset, canEdit }: { item: Item; asset: AssetInstance; canEdit: boolean }) {
  const t = useT();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const schedules = useCompleteList<Schedule>(['operations', `schedules:item:${item.id}`], operationsApi.schedules({ itemId: item.id }));
  const active = (schedules.data ?? []).filter((schedule) => schedule.active);
  const own = active.filter((schedule) => schedule.assetInstanceId === asset.id);
  const inherited = active.filter((schedule) => !schedule.assetInstanceId && !own.some((mine) => mine.maintenanceType === schedule.maintenanceType));
  const hours = Number(asset.operatingHours ?? 0);
  const [draft, setDraft] = useState<Draft | null>(null);

  const unit = (intervalType: string) => intervalType === 'operating_hours' ? 'h' : intervalType === 'usage_count' ? t('maintenance.assetMaintenance.uses') : t('maintenance.assetMaintenance.days');
  const describe = (schedule: Schedule) => {
    const every = t('maintenance.assetMaintenance.everyIntervalValueValue', { intervalValue: String(schedule.intervalValue), value: String(unit(schedule.intervalType)) });
    const due = schedule.intervalType === 'date'
      ? `${t('maintenance.assetMaintenance.dueOn')} ${formatDate(schedule.nextDueAt)}`
      : `${t('maintenance.assetMaintenance.dueAt')} ${schedule.nextDueValue ?? '—'} ${unit(schedule.intervalType)}`;
    return `${maintenanceTypeLabel(schedule.maintenanceType)} · ${every} · ${due}`;
  };
  const meterDue = (schedule: Schedule) => schedule.intervalType === 'operating_hours' && schedule.nextDueValue != null && hours >= schedule.nextDueValue;

  function startDraft(from?: Schedule, ownSchedule = false) {
    const intervalType = (from?.intervalType ?? 'date') as IntervalType;
    const intervalValue = from ? String(from.intervalValue) : '365';
    setDraft({
      id: ownSchedule ? from?.id : undefined,
      type: from?.maintenanceType ?? 'dguv_v3',
      intervalType,
      intervalValue,
      nextDueDate: from?.nextDueAt ? dateInputValue(new Date(from.nextDueAt)) : daysFromToday(Number(intervalValue) || 0),
      nextDueValue: ownSchedule && from?.nextDueValue != null ? String(from.nextDueValue) : String(hours + (Number(intervalValue) || 0)),
      checkoutBlocking: from?.checkoutBlocking ?? true,
    });
  }

  function changeIntervalType(intervalType: IntervalType) {
    setDraft((current) => current && ({
      ...current,
      intervalType,
      intervalValue: intervalType === 'date' ? '365' : intervalType === 'operating_hours' ? '100' : '20',
      nextDueDate: daysFromToday(365),
      nextDueValue: String(intervalType === 'operating_hours' ? hours + 100 : 20),
    }));
  }

  function changeInterval(value: string) {
    setDraft((current) => current && ({
      ...current,
      intervalValue: value,
      ...(/^\d+(\.\d+)?$/.test(value) ? (current.intervalType === 'date'
        ? { nextDueDate: daysFromToday(Number(value)) }
        : { nextDueValue: String((current.intervalType === 'operating_hours' ? hours : 0) + Number(value)) }) : {}),
    }));
  }

  const save = useMutation({
    mutationFn: async (value: Draft) => {
      const existing = own.find((schedule) => schedule.id === value.id);
      return operationsApi.saveSchedule({
        itemId: item.id,
        assetInstanceId: asset.id,
        maintenanceType: value.type,
        intervalType: value.intervalType,
        intervalValue: Number(value.intervalValue),
        nextDueAt: value.intervalType === 'date' ? new Date(`${value.nextDueDate}T12:00:00`).toISOString() : null,
        nextDueValue: value.intervalType === 'date' ? null : Number(value.nextDueValue),
        warningWindow: existing?.warningWindow ?? (value.intervalType === 'date' ? 30 : 10),
        responsiblePersonId: existing?.responsiblePersonId ?? null,
        requiredChecklist: existing?.requiredChecklist ?? null,
        checkoutBlocking: value.checkoutBlocking,
        active: true,
      }, value.id);
    },
    onSuccess: () => {
      showSnackbar(t('maintenance.assetMaintenance.maintenanceScheduleSaved'), 'success');
      setDraft(null);
    },
    onError: (err) => showSnackbar(err instanceof Error ? err.message : t('common.failedToSave'), 'error'),
  });
  const retire = useMutation({
    mutationFn: (schedule: Schedule) => operationsApi.retireSchedule(schedule.id),
    onSuccess: () => showSnackbar(t('maintenance.assetMaintenance.maintenanceScheduleRetired'), 'success'),
    onError: (err) => showSnackbar(err instanceof Error ? err.message : t('common.failedToSave'), 'error'),
  });

  const intervalValid = draft ? /^\d+(\.\d+)?$/.test(draft.intervalValue) && Number(draft.intervalValue) > 0 : false;
  const dueValid = draft ? (draft.intervalType === 'date' ? Boolean(draft.nextDueDate) : draft.nextDueValue !== '' && Number(draft.nextDueValue) >= 0) : false;
  const duplicateType = draft && !draft.id && own.some((schedule) => schedule.maintenanceType === draft.type);

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><EventRepeatIcon />{t('maintenance.assetMaintenance.maintenanceOfThisAsset')}</Typography>
        {canEdit && !draft && <Button title={translate('maintenance.assetMaintenance.createAMaintenanceIntervalForThisAsset')} size="small" variant="outlined" onClick={() => startDraft()}>
          {t('maintenance.assetMaintenance.addInterval')}
        </Button>}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('maintenance.assetMaintenance.ownIntervalsApplyToThisAssetOnlyAndReplaceThe')}
      </Typography>
      {schedules.isError && <Alert severity="error" sx={{ mb: 2 }}>{t('maintenance.assetMaintenance.couldNotLoadMaintenanceSchedules')}</Alert>}
      <Stack spacing={1}>
        {own.map((schedule) => (
          <Box key={schedule.id} sx={{ display: 'flex', gap: 1, alignItems: { sm: 'center' }, justifyContent: 'space-between', flexDirection: { xs: 'column', sm: 'row' }, border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 600 }}>{describe(schedule)}</Typography>
                {(scheduleIsOverdue(schedule) || meterDue(schedule)) && <Chip size="small" color="error" label={t('common.due')} />}
                {schedule.checkoutBlocking && <Chip size="small" variant="outlined" label={t('maintenance.assetMaintenance.blocksCheckout')} />}
              </Stack>
            </Box>
            {canEdit && <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <Button title={translate('maintenance.assetMaintenance.editIntervalAndDueDate')} size="small" onClick={() => startDraft(schedule, true)}>{t('common.edit')}</Button>
              <Button title={translate('common.retireThisMaintenanceSchedule')} size="small" color="error" disabled={retire.isPending} onClick={() => retire.mutate(schedule)}>{t('common.retire')}</Button>
            </Stack>}
          </Box>
        ))}
        {inherited.map((schedule) => (
          <Box key={schedule.id} sx={{ display: 'flex', gap: 1, alignItems: { sm: 'center' }, justifyContent: 'space-between', flexDirection: { xs: 'column', sm: 'row' }, border: 1, borderStyle: 'dashed', borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography>{describe(schedule)}</Typography>
              <Typography variant="caption" color="text.secondary">{t('maintenance.assetMaintenance.itemWidePlanForAllUnits')}</Typography>
            </Box>
            {canEdit && <Button title={translate('maintenance.assetMaintenance.setAnOwnIntervalForThisAssetInsteadOfThe')} size="small" onClick={() => startDraft(schedule)}>
              {t('maintenance.assetMaintenance.ownInterval')}
            </Button>}
          </Box>
        ))}
        {!schedules.isLoading && own.length === 0 && inherited.length === 0 && !draft && (
          <Typography variant="body2" color="text.secondary">{t('maintenance.assetMaintenance.noMaintenanceIntervalIsSetForThisAsset')}</Typography>
        )}
      </Stack>
      {draft && (
        <Stack spacing={2} sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField select fullWidth label={t('common.inspectionType')} value={draft.type} disabled={Boolean(draft.id)}
              onChange={(event) => setDraft({ ...draft, type: oneOf(event.target.value, MAINTENANCE_TYPES) })}
              error={Boolean(duplicateType)} helperText={duplicateType ? t('maintenance.assetMaintenance.thisInspectionTypeAlreadyHasAnInterval') : undefined}>
              {MAINTENANCE_TYPES.map((type) => <MenuItem key={type} value={type}>{maintenanceTypeLabel(type)}</MenuItem>)}
            </TextField>
            <TextField select fullWidth label={t('maintenance.assetMaintenance.intervalBy')} value={draft.intervalType}
              onChange={(event) => changeIntervalType(event.target.value as IntervalType)}>
              <MenuItem value="date">{t('enum.value.date')}</MenuItem>
              <MenuItem value="operating_hours">{t('enum.value.operating_hours')}</MenuItem>
              <MenuItem value="usage_count">{t('maintenance.assetMaintenance.usageCount')}</MenuItem>
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField fullWidth type="number" label={`${t('maintenance.assetMaintenance.interval')} (${unit(draft.intervalType)})`} value={draft.intervalValue}
              onChange={(event) => changeInterval(event.target.value)} error={draft.intervalValue !== '' && !intervalValid}
              slotProps={{ htmlInput: { min: 1, step: draft.intervalType === 'operating_hours' ? 0.5 : 1 } }} />
            {draft.intervalType === 'date'
              ? <TextField fullWidth type="date" label={t('common.nextDueDate')} value={draft.nextDueDate}
                onChange={(event) => setDraft({ ...draft, nextDueDate: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              : <TextField fullWidth type="number" label={`${t('maintenance.assetMaintenance.dueAt2')} (${unit(draft.intervalType)})`} value={draft.nextDueValue}
                onChange={(event) => setDraft({ ...draft, nextDueValue: event.target.value })}
                helperText={draft.intervalType === 'operating_hours' ? t('maintenance.assetMaintenance.currentlyHoursH', { hours: hours }) : undefined}
                slotProps={{ htmlInput: { min: 0, step: draft.intervalType === 'operating_hours' ? 0.5 : 1 } }} />}
          </Stack>
          <FormControlLabel control={<Switch checked={draft.checkoutBlocking} onChange={(_, checked) => setDraft({ ...draft, checkoutBlocking: checked })} />}
            label={t('maintenance.assetMaintenance.blockCheckoutWhenDue')} />
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button title={translate('maintenance.assetMaintenance.discardChanges')} onClick={() => setDraft(null)} disabled={save.isPending}>{t('common.cancel')}</Button>
            <Button title={translate('maintenance.assetMaintenance.saveTheMaintenanceIntervalForThisAsset')} variant="contained"
              disabled={!intervalValid || !dueValid || Boolean(duplicateType) || save.isPending} onClick={() => save.mutate(draft)}>
              {t('common.save')}
            </Button>
          </Stack>
        </Stack>
      )}
    </Paper>
  );
}
