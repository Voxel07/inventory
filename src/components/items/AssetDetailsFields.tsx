import { Stack, TextField } from '@mui/material';
import type { AssetInstanceInput } from '../../types';
import { useT } from '../../utils/naming';

type Change = (patch: Partial<AssetInstanceInput>) => void;

const optionalNumber = (value: string) => value === '' ? undefined : Number(value);

/** Manufacturer, model and purchase data of one unit. */
export function AssetDetailsFields({ value, onChange }: { value: AssetInstanceInput; onChange: Change }) {
    const t = useT();
    return <>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('items.assetDetailsFields.manufacturer')} value={value.manufacturer ?? ''} onChange={(e) => onChange({ manufacturer: e.target.value })} fullWidth />
            <TextField label={t('items.assetDetailsFields.model')} value={value.model ?? ''} onChange={(e) => onChange({ model: e.target.value })} fullWidth />
        </Stack>
        <TextField label={t('items.assetDetailsFields.purchaseDate')} type="date" value={value.purchaseDate ?? ''} onChange={(e) => onChange({ purchaseDate: e.target.value === '' ? undefined : Number(e.target.value) })}
            slotProps={{ inputLabel: { shrink: true } }} fullWidth />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('items.assetDetailsFields.purchasePrice')} type="number" value={value.purchasePrice ?? ''} onChange={(e) => onChange({ purchasePrice: optionalNumber(e.target.value) })}
                slotProps={{ htmlInput: { min: 0, step: 0.01, inputMode: 'decimal' } }} fullWidth />
            <TextField label={t('items.assetDetailsFields.replacementValue')} type="number" value={value.replacementValue ?? ''} onChange={(e) => onChange({ replacementValue: optionalNumber(e.target.value) })}
                slotProps={{ htmlInput: { min: 0, step: 0.01, inputMode: 'decimal' } }} fullWidth />
        </Stack>
    </>;
}

/** Everything an editor may change on an existing unit; the meter field is a correction that is logged as such. */
export function AssetEditFields({ value, onChange, tracksRuntime }: { value: AssetInstanceInput; onChange: Change; tracksRuntime: boolean }) {
    const t = useT();
    return <>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('items.assetInstancesList.assetCode')} value={value.assetCode ?? ''} onChange={(e) => onChange({ assetCode: e.target.value })} fullWidth />
            <TextField label={t('items.assetInstancesList.serialNumber2')} value={value.serialNumber ?? ''} onChange={(e) => onChange({ serialNumber: e.target.value })} fullWidth />
        </Stack>
        <AssetDetailsFields value={value} onChange={onChange} />
        {tracksRuntime && <TextField label={t('items.assetDetailsFields.meterCorrection')} type="number" value={value.operatingHours ?? ''}
            onChange={(e) => onChange({ operatingHours: optionalNumber(e.target.value) })}
            helperText={t('items.assetDetailsFields.meterCorrectionHelp')} slotProps={{ htmlInput: { min: 0, step: 0.1, inputMode: 'decimal' } }} fullWidth />}
        <TextField label={t('items.assetInstancesList.notes')} multiline rows={2} value={value.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value })} fullWidth />
    </>;
}
