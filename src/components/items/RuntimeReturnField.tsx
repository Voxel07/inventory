import { TextField } from '@mui/material';
import { useT } from '../../utils/naming';
import { parseHoursRun, readingAfter } from '../../utils/runtimeHours';

/** The hours a runtime-tracked unit ran at the event; asked for while the warehouse checks the return. */
export function RuntimeReturnField({ value, onChange, current, eventName, required = true, size = 'small' }: {
  value: string; onChange: (value: string) => void; current?: number; eventName?: string; required?: boolean; size?: 'small' | 'medium';
}) {
  const t = useT();
  const parsed = parseHoursRun(value);
  const invalid = value.trim() !== '' && parsed == null;
  const help = invalid ? t('items.runtimeReturnField.enterHoursZeroOrMore')
    : [eventName ? t('items.runtimeReturnField.bookedToEvent', { event: eventName }) : t('items.runtimeReturnField.bookedWithoutEvent'),
      t('items.runtimeReturnField.meterAfter', { reading: String(readingAfter(current, parsed ?? 0)) })].join(' · ');
  return <TextField size={size} type="number" label={t('items.runtimeReturnField.hoursRun')} value={value} required={required}
    error={invalid} helperText={help} onChange={(event) => onChange(event.target.value)}
    slotProps={{ htmlInput: { min: 0, step: 0.1, inputMode: 'decimal' } }} sx={{ minWidth: 200 }} />;
}
