import { Button } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import { useState } from 'react';
import { Alert, DialogActions, DialogContent, DialogTitle, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { AssetInstance } from '../../types';
import { useUpdateItemAsset } from '../../hooks/useItems';
import { useUIStore } from '../../store/uiStore';
import { translate, useLocalizedText } from '../../utils/naming';

type Mode = 'add' | 'total';

/** Logs the running hours of one serialized asset; meter-based maintenance plans read them live. */
export function OperatingHoursDialog({ itemId, asset, onClose }: { itemId: string; asset: AssetInstance | null; onClose: () => void }) {
    const t = useLocalizedText();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const update = useUpdateItemAsset(itemId);
    const [mode, setMode] = useState<Mode>('add');
    const [value, setValue] = useState('');
    const current = Number(asset?.operatingHours ?? 0);
    const parsed = Number(value.replace(',', '.'));
    const valid = value.trim() !== '' && Number.isFinite(parsed) && (mode === 'add' ? parsed > 0 : parsed >= current);
    const total = Math.round((mode === 'add' ? current + parsed : parsed) * 100) / 100;

    function close() {
        if (update.isPending) return;
        setValue('');
        setMode('add');
        onClose();
    }

    function save() {
        if (!asset || !valid) return;
        update.mutate({ assetId: asset.id, input: { operatingHours: total, expectedVersion: asset.version } }, {
            onSuccess: () => {
                showSnackbar(t(`Betriebsstunden für ${asset.assetCode}: ${total} h`, `Operating hours for ${asset.assetCode}: ${total} h`), 'success');
                close();
            },
            onError: (error) => showSnackbar(error instanceof Error ? error.message : t('Speichern fehlgeschlagen', 'Could not save'), 'error'),
        });
    }

    return (
        <Dialog open={Boolean(asset)} onClose={close} maxWidth="xs" fullWidth>
            <DialogTitle>{t('Betriebsstunden erfassen', 'Log operating hours')}: {asset?.assetCode}</DialogTitle>
            <DialogContent sx={{ pt: '8px !important' }}>
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                        {t('Aktueller Stand', 'Current reading')}: <strong>{current} h</strong>
                    </Typography>
                    <ToggleButtonGroup exclusive fullWidth size="small" value={mode} onChange={(_, next: Mode | null) => { if (next) { setMode(next); setValue(''); } }}
                        aria-label={t('Erfassungsart', 'Entry type')}>
                        <ToggleButton value="add" sx={{ textTransform: 'none' }}>{t('Stunden hinzufügen', 'Add hours')}</ToggleButton>
                        <ToggleButton value="total" sx={{ textTransform: 'none' }}>{t('Zählerstand eingeben', 'Enter meter reading')}</ToggleButton>
                    </ToggleButtonGroup>
                    <TextField
                        autoFocus
                        type="number"
                        label={mode === 'add' ? t('Gelaufene Stunden', 'Hours run') : t('Neuer Zählerstand (h)', 'New meter reading (h)')}
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); save(); } }}
                        error={value.trim() !== '' && !valid}
                        helperText={value.trim() !== '' && !valid
                            ? mode === 'add' ? t('Mehr als 0 Stunden eingeben', 'Enter more than 0 hours') : t(`Mindestens ${current} h`, `At least ${current} h`)
                            : valid ? t(`Neuer Stand: ${total} h`, `New reading: ${total} h`) : undefined}
                        slotProps={{ htmlInput: { min: mode === 'add' ? 0.1 : current, step: 0.1, inputMode: 'decimal' } }}
                    />
                    {update.isError && <Alert severity="error">{t('Die Stunden konnten nicht gespeichert werden. Bitte die Seite neu laden und erneut versuchen.', 'The hours could not be saved. Reload the page and try again.')}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button title={translate('Änderungen verwerfen und schließen', 'Discard changes and close')} onClick={close}>{t('Abbrechen', 'Cancel')}</Button>
                <Button title={translate('Die Betriebsstunden speichern', 'Save the operating hours')} variant="contained" onClick={save} disabled={!valid || update.isPending}>
                    {t('Speichern', 'Save')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
