import { useState } from 'react';
import { Box, FormControlLabel, MenuItem, Stack, Switch, Typography } from '@mui/material';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import AddIcon from '@mui/icons-material/Add';
import { Button, IconButton } from '../shared/ActionButtons';
import { DialogForm, FormDialog } from '../shared/FormDialog';
import { TextField } from '../shared/DateTextField';
import { maintenanceTypeLabel } from '../maintenance/maintenanceSchedules';
import { MAINTENANCE_TYPES, type ScheduleIntervalType } from '../../types/operations';
import { oneOf } from '../../utils/operationForm';
import { useT } from '../../utils/naming';
import { daysFromToday, draftValid, newDraft, SCHEDULE_NUMBER, type ScheduleDraft } from './maintenanceScheduleDrafts';

/**
 * Item-wide maintenance intervals for an item that is being created. Nothing is saved here: the
 * intervals travel with the item's create request and are created in the same transaction.
 */
export function MaintenanceScheduleDialog({ open, initial, openingHours, onClose, onSave }: {
    open: boolean;
    initial: ScheduleDraft[];
    /** Meter reading the item starts with; operating-hour intervals fall due relative to it. */
    openingHours: number;
    onClose: () => void;
    onSave: (drafts: ScheduleDraft[]) => void;
}) {
    return <FormDialog open={open} onClose={onClose}>
        <ScheduleDraftsForm initial={initial} openingHours={openingHours} onClose={onClose} onSave={onSave} />
    </FormDialog>;
}

function ScheduleDraftsForm({ initial, openingHours, onClose, onSave }: {
    initial: ScheduleDraft[];
    openingHours: number;
    onClose: () => void;
    onSave: (drafts: ScheduleDraft[]) => void;
}) {
    const t = useT();
    const [drafts, setDrafts] = useState<ScheduleDraft[]>(() => initial.length ? initial : [newDraft('date', openingHours)]);
    const unit = (intervalType: ScheduleIntervalType) => intervalType === 'operating_hours' ? 'h'
        : intervalType === 'usage_count' ? t('maintenance.assetMaintenance.uses') : t('maintenance.assetMaintenance.days');

    function update(index: number, change: Partial<ScheduleDraft>) {
        setDrafts((current) => current.map((draft, i) => i === index ? { ...draft, ...change } : draft));
    }

    function changeInterval(index: number, draft: ScheduleDraft, value: string) {
        update(index, {
            intervalValue: value,
            ...(SCHEDULE_NUMBER.test(value) ? (draft.intervalType === 'date'
                ? { nextDueDate: daysFromToday(Number(value)) }
                : { nextDueValue: String((draft.intervalType === 'operating_hours' ? openingHours : 0) + Number(value)) }) : {}),
        });
    }

    function addDraft() {
        const unused = MAINTENANCE_TYPES.find((type) => !drafts.some((draft) => draft.type === type)) ?? 'dguv_v3';
        setDrafts((current) => [...current, newDraft('date', openingHours, unused)]);
    }

    const duplicate = (index: number) => drafts.some((other, i) => i < index && other.type === drafts[index].type);
    const valid = drafts.length > 0 && drafts.every((draft, index) => draftValid(draft) && !duplicate(index));

    return <DialogForm title={t('forms.itemForm.maintenanceSchedule')} onSubmit={() => onSave(drafts)} onCancel={onClose} noValidate submitDisabled={!valid}>
        <Typography variant="body2" color="text.secondary">{t('forms.itemForm.maintenanceScheduleIntro')}</Typography>
        {drafts.map((draft, index) => (
            <Stack key={index} spacing={2} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                    <TextField select fullWidth label={t('common.inspectionType')} value={draft.type}
                        onChange={(event) => update(index, { type: oneOf(event.target.value, MAINTENANCE_TYPES) })}
                        error={duplicate(index)} helperText={duplicate(index) ? t('maintenance.assetMaintenance.thisInspectionTypeAlreadyHasAnInterval') : undefined}>
                        {MAINTENANCE_TYPES.map((type) => <MenuItem key={type} value={type}>{maintenanceTypeLabel(type)}</MenuItem>)}
                    </TextField>
                    <IconButton title={t('forms.itemForm.removeInterval')} type="button" disabled={drafts.length === 1}
                        onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))} sx={{ mt: 1 }}>
                        <DeleteOutlinedIcon />
                    </IconButton>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField select fullWidth label={t('maintenance.assetMaintenance.intervalBy')} value={draft.intervalType}
                        onChange={(event) => {
                            const intervalType = event.target.value as ScheduleIntervalType;
                            update(index, { ...newDraft(intervalType, openingHours, draft.type), checkoutBlocking: draft.checkoutBlocking });
                        }}>
                        <MenuItem value="date">{t('enum.value.date')}</MenuItem>
                        <MenuItem value="operating_hours">{t('enum.value.operating_hours')}</MenuItem>
                        <MenuItem value="usage_count">{t('maintenance.assetMaintenance.usageCount')}</MenuItem>
                    </TextField>
                    <TextField fullWidth type="number" label={`${t('maintenance.assetMaintenance.interval')} (${unit(draft.intervalType)})`}
                        value={draft.intervalValue} onChange={(event) => changeInterval(index, draft, event.target.value)}
                        error={draft.intervalValue !== '' && !(SCHEDULE_NUMBER.test(draft.intervalValue) && Number(draft.intervalValue) > 0)}
                        slotProps={{ htmlInput: { min: 1, step: draft.intervalType === 'operating_hours' ? 0.5 : 1 } }} />
                </Stack>
                {draft.intervalType === 'date'
                    ? <TextField fullWidth type="date" label={t('common.nextDueDate')} value={draft.nextDueDate}
                        onChange={(event) => update(index, { nextDueDate: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                    : <TextField fullWidth type="number" label={`${t('maintenance.assetMaintenance.dueAt2')} (${unit(draft.intervalType)})`}
                        value={draft.nextDueValue} onChange={(event) => update(index, { nextDueValue: event.target.value })}
                        helperText={draft.intervalType === 'operating_hours' ? t('forms.itemForm.openingReadingHoursH', { hours: openingHours }) : undefined}
                        slotProps={{ htmlInput: { min: 0, step: draft.intervalType === 'operating_hours' ? 0.5 : 1 } }} />}
                <FormControlLabel control={<Switch checked={draft.checkoutBlocking} onChange={(_, checked) => update(index, { checkoutBlocking: checked })} />}
                    label={t('maintenance.assetMaintenance.blockCheckoutWhenDue')} />
            </Stack>
        ))}
        <Box>
            <Button title={t('forms.itemForm.addAnotherInterval')} startIcon={<AddIcon />} onClick={addDraft}
                disabled={drafts.length >= MAINTENANCE_TYPES.length}>
                {t('forms.itemForm.addAnotherInterval')}
            </Button>
        </Box>
    </DialogForm>;
}
