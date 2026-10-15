import { Button } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import { useState } from 'react';
import { Alert, DialogActions, DialogContent, DialogTitle, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { AssetInstance } from '../../types';
import { useUpdateItemAsset } from '../../hooks/useItems';
import { useUIStore } from '../../store/uiStore';
import { translate, useT } from '../../utils/naming';

type Mode = 'add' | 'total';

/** Logs the running hours of one serialized asset; meter-based maintenance plans read them live. */
export function OperatingHoursDialog({ itemId, asset, onClose }: { itemId: string; asset: AssetInstance | null; onClose: () => void }) {
    const t = useT();
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
                    {update.isError && <Alert severity="error">{t('items.operatingHoursDialog.theHoursCouldNotBeSavedReloadThePageAnd')}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button title={translate('common.discardChangesAndClose')} onClick={close}>{t('common.cancel')}</Button>
                <Button title={translate('items.operatingHoursDialog.saveTheOperatingHours')} variant="contained" onClick={save} disabled={!valid || update.isPending}>
                    {t('common.save')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
