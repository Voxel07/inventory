import { calendarDate, formatDate } from '../../utils/dateFormat';
import { Button } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import { useState } from 'react';
import { Alert, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { AssetInstance } from '../../types';
import { useLogAssetRuntime } from '../../hooks/useItems';
import { useEventReports } from '../../hooks/useEvents';
import { useUIStore } from '../../store/uiStore';
import { translate, useT } from '../../utils/naming';

type Mode = 'add' | 'total';

/** Books running hours of one serialized asset against the event it ran at; meter-based maintenance plans read them live. */
export function OperatingHoursDialog({ itemId, asset, onClose }: { itemId: string; asset: AssetInstance | null; onClose: () => void }) {
    const t = useT();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const log = useLogAssetRuntime(itemId);
    const { data: events = [] } = useEventReports();
    const [mode, setMode] = useState<Mode>('add');
    const [value, setValue] = useState('');
    const [notes, setNotes] = useState('');
    // Default to the event running today, else no event; recent events first.
    const today = calendarDate();
    const sortedEvents = [...events].sort((a, b) => (b.startDate - a.startDate));
    const runningEvent = sortedEvents.find((event) => event.startDate <= today && event.endDate >= today);
    const [eventId, setEventId] = useState<string | null>(null);
    const selectedEventId = eventId ?? runningEvent?.id ?? '';
    const current = Number(asset?.operatingHours ?? 0);
    const parsed = Number(value.replace(',', '.'));
    const valid = value.trim() !== '' && Number.isFinite(parsed) && (mode === 'add' ? parsed > 0 : parsed > current);
    const total = Math.round((mode === 'add' ? current + parsed : parsed) * 100) / 100;

    function close() {
        if (log.isPending) return;
        setValue('');
        setNotes('');
        setEventId(null);
        setMode('add');
        onClose();
    }

    function save() {
        if (!asset || !valid) return;
        log.mutate({ assetId: asset.id, input: {
            ...(mode === 'add' ? { hours: parsed } : { reading: parsed }),
            eventOccurrenceId: selectedEventId || undefined, notes: notes.trim() || undefined, expectedVersion: asset.version,
        } }, {
            onSuccess: () => {
                showSnackbar(t('items.operatingHoursDialog.operatingHoursForAssetCodeTotalH', { assetCode: String(asset.assetCode), total: total }), 'success');
                close();
            },
            onError: (error) => showSnackbar(error instanceof Error ? error.message : t('items.operatingHoursDialog.couldNotSave'), 'error'),
        });
    }

    return (
        <Dialog open={Boolean(asset)} onClose={close} maxWidth="xs" fullWidth>
            <DialogTitle>{t('items.operatingHoursDialog.logOperatingHours')}: {asset?.assetCode}</DialogTitle>
            <DialogContent sx={{ pt: '8px !important' }}>
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                        {t('items.operatingHoursDialog.currentReading')}: <strong>{current} h</strong>
                    </Typography>
                    <TextField select label={t('items.operatingHoursDialog.event')} value={selectedEventId}
                        onChange={(event) => setEventId(event.target.value)} helperText={t('items.operatingHoursDialog.whereTheUnitRan')}>
                        <MenuItem value="">{t('items.operatingHoursDialog.noEvent')}</MenuItem>
                        {sortedEvents.map((event) => <MenuItem key={event.id} value={event.id}>{event.name} · {formatDate(event.startDate)}</MenuItem>)}
                    </TextField>
                    <ToggleButtonGroup exclusive fullWidth size="small" value={mode} onChange={(_, next: Mode | null) => { if (next) { setMode(next); setValue(''); } }}
                        aria-label={t('items.operatingHoursDialog.entryType')}>
                        <ToggleButton value="add" sx={{ textTransform: 'none' }}>{t('items.operatingHoursDialog.addHours')}</ToggleButton>
                        <ToggleButton value="total" sx={{ textTransform: 'none' }}>{t('items.operatingHoursDialog.enterMeterReading')}</ToggleButton>
                    </ToggleButtonGroup>
                    <TextField
                        autoFocus
                        type="number"
                        label={mode === 'add' ? t('items.operatingHoursDialog.hoursRun') : t('items.operatingHoursDialog.newMeterReadingH')}
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); save(); } }}
                        error={value.trim() !== '' && !valid}
                        helperText={value.trim() !== '' && !valid
                            ? mode === 'add' ? t('items.operatingHoursDialog.enterMoreThan0Hours') : t('items.operatingHoursDialog.atLeastCurrentH', { current: current })
                            : valid ? t('items.operatingHoursDialog.newReadingTotalH', { total: total }) : undefined}
                        slotProps={{ htmlInput: { min: mode === 'add' ? 0.1 : current, step: 0.1, inputMode: 'decimal' } }}
                    />
                    <TextField label={t('common.notes')} value={notes} onChange={(event) => setNotes(event.target.value)} />
                    {log.isError && <Alert severity="error">{t('items.operatingHoursDialog.theHoursCouldNotBeSavedReloadThePageAnd')}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button title={translate('common.discardChangesAndClose')} onClick={close}>{t('common.cancel')}</Button>
                <Button title={translate('items.operatingHoursDialog.saveTheOperatingHours')} variant="contained" onClick={save} disabled={!valid || log.isPending}>
                    {t('common.save')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
