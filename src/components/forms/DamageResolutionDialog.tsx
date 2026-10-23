import { useState } from 'react';
import { DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import type { DamageReport } from '../../types';
import { useT } from '../../utils/naming';

interface Props {
    report: DamageReport;
    targetName: string;
    canWriteOff: boolean;
    isUpdating: boolean;
    onClose: () => void;
    onSubmit: (id: string, status: 'repaired' | 'written_off', amount: number, notes: string) => Promise<void>;
}

export function DamageResolutionDialog({ report, targetName, canWriteOff, isUpdating, onClose, onSubmit }: Props) {
    const t = useT();
    const maxAmount = Math.max(0, report.amount - (report.repairedAmount ?? 0) - (report.writtenOffAmount ?? 0));
    const [status, setStatus] = useState<'repaired' | 'written_off'>('repaired');
    const [amount, setAmount] = useState(String(maxAmount));
    const [notes, setNotes] = useState('');
    const parsedAmount = Number(amount);
    const validAmount = Number.isInteger(parsedAmount) && parsedAmount >= 1 && parsedAmount <= maxAmount;
    const valid = validAmount && Boolean(notes.trim()) && (status !== 'written_off' || canWriteOff);

    async function submit() {
        if (!valid || isUpdating) return;
        try {
            await onSubmit(report.id, status, parsedAmount, notes.trim());
            onClose();
        } catch {
            // The page displays the error; retain the entered quantity and comment for retry.
        }
    }

    return <Dialog open onClose={isUpdating ? undefined : onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{t('lists.damageReportsList.startRepair')}</DialogTitle>
        <DialogContent sx={{ pt: '20px !important' }}>
            <Stack spacing={2}>
                <Typography sx={{ fontWeight: 600 }}>{targetName}</Typography>
                <Stack spacing={0.5}>
                    <Typography variant="subtitle2">{t('common.description')}</Typography>
                    <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{report.description}</Typography>
                </Stack>
                <TextField select fullWidth label={t('lists.damageReportsList.resolution')} value={status} disabled={isUpdating}
                    onChange={(event) => setStatus(event.target.value as 'repaired' | 'written_off')}>
                    <MenuItem value="repaired">{t('lists.damageReportsList.repairUnits')}</MenuItem>
                    <MenuItem value="written_off" disabled={!canWriteOff}>{t('lists.damageReportsList.writeOffUnits')}</MenuItem>
                </TextField>
                <TextField fullWidth type="number" required label={t('common.quantity')} value={amount} disabled={isUpdating}
                    onChange={(event) => setAmount(event.target.value)} error={amount !== '' && !validAmount}
                    helperText={t('lists.damageReportsList.maxResolutionAmountDamagedUnitsRemain', { maxResolutionAmount: maxAmount })}
                    slotProps={{ htmlInput: { min: 1, max: maxAmount, step: 1 } }} />
                <TextField fullWidth multiline minRows={3} required label={t('lists.damageReportsList.whatWasDone')}
                    value={notes} onChange={(event) => setNotes(event.target.value)} disabled={isUpdating} />
            </Stack>
        </DialogContent>
        <DialogActions>
            <Button color="inherit" disabled={isUpdating} onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="contained" color={status === 'written_off' ? 'error' : 'success'}
                disabled={!valid || isUpdating} onClick={() => { void submit(); }}>
                {status === 'repaired' ? t('lists.damageReportsList.recordRepair') : t('lists.damageReportsList.recordWriteOff')}
            </Button>
        </DialogActions>
    </Dialog>;
}
