import { Button } from '../shared/ActionButtons';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Box, Chip, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import { useOperationList } from '../../hooks/useOperations';
import { operationsApi } from '../../services/operationsService';
import { useUIStore } from '../../store/uiStore';
import { formatDate } from '../../utils/dateFormat';
import { translate, useLocalizedText } from '../../utils/naming';
import type { AssetInstance, Item } from '../../types';
import type { Schedule, ScheduleInput } from '../../types/operations';
import { MAINTENANCE_TYPES, maintenanceTypeLabel, scheduleIsOverdue, type MaintenanceType } from './maintenanceSchedules';

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
  const t = useLocalizedText();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const schedules = useOperationList<Schedule>(`schedules:item:${item.id}`, operationsApi.schedules({ itemId: item.id }));
  const active = (schedules.data ?? []).filter((schedule) => schedule.active);
  const own = active.filter((schedule) => schedule.assetInstanceId === asset.id);
  const inherited = active.filter((schedule) => !schedule.assetInstanceId && !own.some((mine) => mine.maintenanceType === schedule.maintenanceType));
  const hours = Number(asset.operatingHours ?? 0);
  const [draft, setDraft] = useState<Draft | null>(null);

  const unit = (intervalType: string) => intervalType === 'operating_hours' ? 'h' : intervalType === 'usage_count' ? t('Nutzungen', 'uses') : t('Tage', 'days');
  const describe = (schedule: Schedule) => {
    const every = t(`alle ${schedule.intervalValue} ${unit(schedule.intervalType)}`, `every ${schedule.intervalValue} ${unit(schedule.intervalType)}`);
    const due = schedule.intervalType === 'date'
      ? `${t('fällig am', 'due on')} ${formatDate(schedule.nextDueAt)}`
      : `${t('fällig bei', 'due at')} ${schedule.nextDueValue ?? '—'} ${unit(schedule.intervalType)}`;
    return `${maintenanceTypeLabel(schedule.maintenanceType)} · ${every} · ${due}`;
  };
  const meterDue = (schedule: Schedule) => schedule.intervalType === 'operating_hours' && schedule.nextDueValue != null && hours >= schedule.nextDueValue;

  function startDraft(from?: Schedule, ownSchedule = false) {
    const intervalType = (from?.intervalType ?? 'date') as IntervalType;
    const intervalValue = from ? String(from.intervalValue) : '365';
    setDraft({
      id: ownSchedule ? from?.id : undefined,
      type: (from?.maintenanceType ?? 'dguv_v3') as MaintenanceType,
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
      showSnackbar(t('Wartungsplan gespeichert', 'Maintenance schedule saved'), 'success');
      setDraft(null);
    },
    onError: (err) => showSnackbar(err instanceof Error ? err.message : t('Fehler beim Speichern', 'Failed to save'), 'error'),
  });
  const retire = useMutation({
    mutationFn: (schedule: Schedule) => operationsApi.retireSchedule(schedule.id),
    onSuccess: () => showSnackbar(t('Wartungsplan stillgelegt', 'Maintenance schedule retired'), 'success'),
    onError: (err) => showSnackbar(err instanceof Error ? err.message : t('Fehler beim Speichern', 'Failed to save'), 'error'),
  });

  const intervalValid = draft ? /^\d+(\.\d+)?$/.test(draft.intervalValue) && Number(draft.intervalValue) > 0 : false;
  const dueValid = draft ? (draft.intervalType === 'date' ? Boolean(draft.nextDueDate) : draft.nextDueValue !== '' && Number(draft.nextDueValue) >= 0) : false;
  const duplicateType = draft && !draft.id && own.some((schedule) => schedule.maintenanceType === draft.type);

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><EventRepeatIcon />{t('Wartung dieses Geräts', 'Maintenance of this asset')}</Typography>
        {canEdit && !draft && <Button title={translate('Ein eigenes Wartungsintervall für dieses Gerät anlegen', 'Create a maintenance interval for this asset')} size="small" variant="outlined" onClick={() => startDraft()}>
          {t('Intervall hinzufügen', 'Add interval')}
        </Button>}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('Eigene Intervalle gelten nur für dieses Gerät und ersetzen den artikelweiten Plan desselben Prüftyps. Betriebsstunden-Intervalle zählen die Stunden dieses Geräts.',
          'Own intervals apply to this asset only and replace the item-wide plan of the same inspection type. Operating-hour intervals count this asset’s hours.')}
      </Typography>
      {schedules.isError && <Alert severity="error" sx={{ mb: 2 }}>{t('Wartungspläne konnten nicht geladen werden.', 'Could not load maintenance schedules.')}</Alert>}
      <Stack spacing={1}>
        {own.map((schedule) => (
          <Box key={schedule.id} sx={{ display: 'flex', gap: 1, alignItems: { sm: 'center' }, justifyContent: 'space-between', flexDirection: { xs: 'column', sm: 'row' }, border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 600 }}>{describe(schedule)}</Typography>
                {(scheduleIsOverdue(schedule) || meterDue(schedule)) && <Chip size="small" color="error" label={t('Fällig', 'Due')} />}
                {schedule.checkoutBlocking && <Chip size="small" variant="outlined" label={t('Sperrt Ausgabe', 'Blocks checkout')} />}
              </Stack>
            </Box>
            {canEdit && <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <Button title={translate('Intervall und Fälligkeit bearbeiten', 'Edit interval and due date')} size="small" onClick={() => startDraft(schedule, true)}>{t('Bearbeiten', 'Edit')}</Button>
              <Button title={translate('Diesen Wartungsplan stilllegen', 'Retire this maintenance schedule')} size="small" color="error" disabled={retire.isPending} onClick={() => retire.mutate(schedule)}>{t('Stilllegen', 'Retire')}</Button>
            </Stack>}
          </Box>
        ))}
        {inherited.map((schedule) => (
          <Box key={schedule.id} sx={{ display: 'flex', gap: 1, alignItems: { sm: 'center' }, justifyContent: 'space-between', flexDirection: { xs: 'column', sm: 'row' }, border: 1, borderStyle: 'dashed', borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography>{describe(schedule)}</Typography>
              <Typography variant="caption" color="text.secondary">{t('Artikelweiter Plan für alle Einheiten', 'Item-wide plan for all units')}</Typography>
            </Box>
            {canEdit && <Button title={translate('Für dieses Gerät ein eigenes Intervall statt des artikelweiten Plans festlegen', 'Set an own interval for this asset instead of the item-wide plan')} size="small" onClick={() => startDraft(schedule)}>
              {t('Eigenes Intervall', 'Own interval')}
            </Button>}
          </Box>
        ))}
        {!schedules.isLoading && own.length === 0 && inherited.length === 0 && !draft && (
          <Typography variant="body2" color="text.secondary">{t('Für dieses Gerät ist kein Wartungsintervall hinterlegt.', 'No maintenance interval is set for this asset.')}</Typography>
        )}
      </Stack>
      {draft && (
        <Stack spacing={2} sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField select fullWidth label={t('Prüftyp', 'Inspection type')} value={draft.type} disabled={Boolean(draft.id)}
              onChange={(event) => setDraft({ ...draft, type: event.target.value as MaintenanceType })}
              error={Boolean(duplicateType)} helperText={duplicateType ? t('Für diesen Prüftyp gibt es bereits ein Intervall.', 'This inspection type already has an interval.') : undefined}>
              {MAINTENANCE_TYPES.map((type) => <MenuItem key={type} value={type}>{maintenanceTypeLabel(type)}</MenuItem>)}
            </TextField>
            <TextField select fullWidth label={t('Intervall nach', 'Interval by')} value={draft.intervalType}
              onChange={(event) => changeIntervalType(event.target.value as IntervalType)}>
              <MenuItem value="date">{t('Kalender (Tage)', 'Calendar (days)')}</MenuItem>
              <MenuItem value="operating_hours">{t('Betriebsstunden', 'Operating hours')}</MenuItem>
              <MenuItem value="usage_count">{t('Nutzungen', 'Usage count')}</MenuItem>
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField fullWidth type="number" label={`${t('Intervall', 'Interval')} (${unit(draft.intervalType)})`} value={draft.intervalValue}
              onChange={(event) => changeInterval(event.target.value)} error={draft.intervalValue !== '' && !intervalValid}
              slotProps={{ htmlInput: { min: 1, step: draft.intervalType === 'operating_hours' ? 0.5 : 1 } }} />
            {draft.intervalType === 'date'
              ? <TextField fullWidth type="date" label={t('Nächste Fälligkeit', 'Next due date')} value={draft.nextDueDate}
                onChange={(event) => setDraft({ ...draft, nextDueDate: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              : <TextField fullWidth type="number" label={`${t('Fällig bei', 'Due at')} (${unit(draft.intervalType)})`} value={draft.nextDueValue}
                onChange={(event) => setDraft({ ...draft, nextDueValue: event.target.value })}
                helperText={draft.intervalType === 'operating_hours' ? t(`Aktuell ${hours} h`, `Currently ${hours} h`) : undefined}
                slotProps={{ htmlInput: { min: 0, step: draft.intervalType === 'operating_hours' ? 0.5 : 1 } }} />}
          </Stack>
          <FormControlLabel control={<Switch checked={draft.checkoutBlocking} onChange={(_, checked) => setDraft({ ...draft, checkoutBlocking: checked })} />}
            label={t('Ausgabe sperren, wenn fällig', 'Block checkout when due')} />
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button title={translate('Änderungen verwerfen', 'Discard changes')} onClick={() => setDraft(null)} disabled={save.isPending}>{t('Abbrechen', 'Cancel')}</Button>
            <Button title={translate('Das Wartungsintervall für dieses Gerät speichern', 'Save the maintenance interval for this asset')} variant="contained"
              disabled={!intervalValid || !dueValid || Boolean(duplicateType) || save.isPending} onClick={() => save.mutate(draft)}>
              {t('Speichern', 'Save')}
            </Button>
          </Stack>
        </Stack>
      )}
    </Paper>
  );
}
