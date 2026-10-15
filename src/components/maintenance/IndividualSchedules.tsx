import { Button } from '../shared/ActionButtons';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Box, Card, CardContent, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import { useItemAssets, useItemsByIds } from '../../hooks/useItems';
import { ItemAutocomplete } from '../shared/ItemAutocomplete';
import { operationsApi } from '../../services/operationsService';
import { useUIStore } from '../../store/uiStore';
import { formatDate } from '../../utils/dateFormat';
import { translate, useT } from '../../utils/naming';

import type { Schedule } from '../../types/operations';
import { isDateSchedule, maintenanceTypeLabel, scheduleIsOverdue } from './maintenanceSchedules';
import { MAINTENANCE_TYPES, type MaintenanceType } from '../../types/operations';
import { oneOf } from '../../utils/operationForm';

function dateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateInputValue(date);
}

type Draft = { itemId: string; assetId: string; type: MaintenanceType; intervalDays: string; nextDue: string };
const emptyDraft: Draft = { itemId: '', assetId: '', type: 'dguv_v3', intervalDays: '365', nextDue: daysFromToday(365) };

/**
 * Inspection intervals for a single item, or for serialized items per device. "All devices" creates one
 * schedule per device so inspecting one device never moves the due date of the others.
 */
export function IndividualSchedules({ schedules, canEdit, onInspect }: {
  schedules: Schedule[];
  canEdit: boolean;
  onInspect: (schedule: Schedule) => void;
}) {
  const t = useT();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const item = useItemsByIds(draft.itemId ? [draft.itemId] : []).data?.[0];
  const serialized = item?.trackingMode === 'serialized';
  const { data: assets = [], isComplete: assetsComplete } = useItemAssets(serialized ? draft.itemId : undefined);
  const activeAssets = assets.filter((asset) => asset.active);
  const dateSchedules = schedules.filter(isDateSchedule);

  const save = useMutation({
    mutationFn: async () => {
      const intervalValue = Number(draft.intervalDays);
      const nextDueAt = new Date(`${draft.nextDue}T12:00:00`).toISOString();
      const targets = serialized && !draft.assetId ? activeAssets.map((asset) => asset.id) : [draft.assetId || undefined];
      for (const assetInstanceId of targets) {
        const existing = dateSchedules.find((schedule) => schedule.itemId === draft.itemId
          && schedule.maintenanceType === draft.type && (schedule.assetInstanceId ?? undefined) === assetInstanceId);
        await operationsApi.saveSchedule({
          itemId: draft.itemId,
          assetInstanceId: assetInstanceId ?? null,
          maintenanceType: draft.type,
          intervalType: 'date',
          intervalValue,
          nextDueAt,
          nextDueValue: null,
          warningWindow: existing?.warningWindow ?? 30,
          responsiblePersonId: existing?.responsiblePersonId ?? null,
          requiredChecklist: existing?.requiredChecklist ?? null,
          checkoutBlocking: existing?.checkoutBlocking ?? true,
          active: true,
        }, existing?.id);
      }
      return targets.length;
    },
    onSuccess: (count) => {
      showSnackbar(count > 1 ? t('maintenance.individualSchedules.countMaintenanceSchedulesSaved', { count: count }) : t('maintenance.individualSchedules.maintenanceScheduleSaved'), 'success');
      setDraft(emptyDraft);
    },
    onError: (err) => showSnackbar(err instanceof Error ? err.message : t('common.failedToSave'), 'error'),
  });
  const retire = useMutation({
    mutationFn: (schedule: Schedule) => operationsApi.retireSchedule(schedule.id),
    onSuccess: () => showSnackbar(t('maintenance.individualSchedules.maintenanceScheduleRetired'), 'success'),
    onError: (err) => showSnackbar(err instanceof Error ? err.message : t('common.failedToSave'), 'error'),
  });

  function editSchedule(schedule: Schedule) {
    setDraft({
      itemId: schedule.itemId,
      assetId: schedule.assetInstanceId ?? '',
      type: schedule.maintenanceType,
      intervalDays: String(schedule.intervalValue),
      nextDue: schedule.nextDueAt ? dateInputValue(new Date(schedule.nextDueAt)) : daysFromToday(Number(schedule.intervalValue) || 0),
    });
  }

  const intervalValid = /^\d+$/.test(draft.intervalDays) && Number(draft.intervalDays) > 0;
  const noDevices = serialized && !draft.assetId && assetsComplete && activeAssets.length === 0;

  return <Paper sx={{ p: 2.5, mb: 3 }}>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
      <EventRepeatIcon color="primary" />
      <Typography variant="h6">{t('maintenance.individualSchedules.maintenancePerItemOrDevice')}</Typography>
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      {t('maintenance.individualSchedules.ownInspectionIntervalForASingleItemOrASerialized')}
    </Typography>
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Box sx={{ flex: 2 }}>
          <ItemAutocomplete label={t('common.item')} required value={draft.itemId || null}
            onChange={(value) => setDraft((current) => ({ ...current, itemId: value?.id ?? '', assetId: '' }))} />
        </Box>
        {serialized && <TextField select sx={{ flex: 1 }} label={t('maintenance.individualSchedules.device')} value={draft.assetId}
          onChange={(event) => setDraft((current) => ({ ...current, assetId: event.target.value }))}>
          <MenuItem value="">{t('maintenance.individualSchedules.eachDeviceActiveAssetCount', { activeAssetCount: String(activeAssets.length) })}</MenuItem>
          {activeAssets.map((asset) => <MenuItem key={asset.id} value={asset.id}>{asset.assetCode}</MenuItem>)}
        </TextField>}
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField select fullWidth label={t('common.inspectionType')} value={draft.type}
          onChange={(event) => setDraft((current) => ({ ...current, type: oneOf(event.target.value, MAINTENANCE_TYPES) }))}>
          {MAINTENANCE_TYPES.map((type) => <MenuItem key={type} value={type}>{maintenanceTypeLabel(type)}</MenuItem>)}
        </TextField>
        <TextField fullWidth type="number" label={t('maintenance.individualSchedules.intervalDays')} value={draft.intervalDays}
          onChange={(event) => setDraft((current) => ({ ...current, intervalDays: event.target.value,
            nextDue: /^\d+$/.test(event.target.value) ? daysFromToday(Number(event.target.value)) : current.nextDue }))}
          slotProps={{ htmlInput: { min: 1, step: 1 } }} />
        <TextField fullWidth type="date" label={t('common.nextDueDate')} value={draft.nextDue}
          onChange={(event) => setDraft((current) => ({ ...current, nextDue: event.target.value }))}
          slotProps={{ inputLabel: { shrink: true } }} />
      </Stack>
      {noDevices && <Alert severity="warning">{t('maintenance.individualSchedules.thisItemHasNoActiveDevices')}</Alert>}
      <Box>
        <Button title={translate('maintenance.individualSchedules.saveTheInspectionIntervalForThisItemOrItsDevices')}
          variant="contained" onClick={() => save.mutate()}
          disabled={!canEdit || !draft.itemId || !intervalValid || !draft.nextDue || noDevices || (serialized && !assetsComplete) || save.isPending}>
          {t('maintenance.individualSchedules.saveSchedule')}
        </Button>
      </Box>

      {dateSchedules.length > 0 && <Stack spacing={1}>
        {dateSchedules.map((schedule) => {
          const overdue = scheduleIsOverdue(schedule);
          return <Card key={schedule.id} variant="outlined">
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 700 }}>{schedule.itemName}</Typography>
                    {schedule.assetCode && <Chip size="small" variant="outlined" label={schedule.assetCode} />}
                    {overdue && <Chip size="small" color="error" label={t('enum.value.overdue')} />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {maintenanceTypeLabel(schedule.maintenanceType)} · {t('maintenance.individualSchedules.everyIntervalValueDays', { intervalValue: String(schedule.intervalValue) })} · {t('maintenance.individualSchedules.dueOn')}: {formatDate(schedule.nextDueAt)}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                  <Button title={translate('maintenance.individualSchedules.fillInTheInspectionFormForThisSchedule')} size="small" onClick={() => onInspect(schedule)}>{t('maintenance.individualSchedules.inspect')}</Button>
                  {canEdit && <Button title={translate('maintenance.individualSchedules.editIntervalAndDueDate')} size="small" onClick={() => editSchedule(schedule)}>{t('common.edit')}</Button>}
                  {canEdit && <Button title={translate('common.retireThisMaintenanceSchedule')} size="small" color="error" disabled={retire.isPending} onClick={() => retire.mutate(schedule)}>{t('common.retire')}</Button>}
                </Stack>
              </Stack>
            </CardContent>
          </Card>;
        })}
      </Stack>}
    </Stack>
  </Paper>;
}
