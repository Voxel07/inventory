import { dateFieldValue } from '../../utils/dateFormat';
import { useState, type ReactNode } from 'react';
import { Autocomplete, Checkbox, FormControlLabel, Stack } from '@mui/material';
import { DateRangeField, TextField } from '../shared/DateTextField';
import { useOperationCommand } from '../../hooks/useOperations';
import { DialogForm, FormDialog } from '../shared/FormDialog';

import { ItemAutocomplete } from '../shared/ItemAutocomplete';
import { PagedAutocomplete } from '../shared/PagedAutocomplete';
import type { Field, Values } from '../../types/operationForm';
import { formatQuantity, usesPercentage } from '../../utils/stock';
import { useT } from '../../utils/naming';

export function Fields({ fields, values, onChange }: { fields: Field[]; values: Values; onChange: (values: Values) => void }) {
  const t = useT();
  return <Stack spacing={2}>{fields.map((field) => {
    const value = values[field.key] ?? '';
    const update = (next: string | number | boolean) => onChange({ ...values, ...field.reset, [field.key]: next });
    if (field.type === 'quantity') {
      const percentage = usesPercentage(field.measure);
      const label = percentage ? `${field.label} (%)` : field.measure?.unit ? `${field.label} (${field.measure.unit})` : field.label;
      const help = [percentage && t('forms.itemForm.percentageCapacity', { quantity: formatQuantity(field.measure, 100) }),
        value !== '' && formatQuantity(field.measure, Number(value)), field.help].filter(Boolean).join(' · ');
      return <TextField key={field.key} fullWidth type="number" label={label} value={value} required={field.required} helperText={help}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: field.min ?? 0, max: field.max, step: 1 } }}
        onChange={(event) => { const next = event.target.value; if (next === '' || Number.isSafeInteger(Number(next))) update(next); }} />;
    }
    if (field.type === 'item') return <ItemAutocomplete key={field.key} label={field.label} required={field.required} helperText={field.help}
      value={value === '' ? null : String(value)} filter={field.itemFilter} onChange={(item) => update(item?.id ?? '')} />;
    if (field.type === 'dateRange' && field.endKey) {
      const endKey = field.endKey;
      return <DateRangeField key={field.key} startLabel={field.label} endLabel={field.endLabel ?? endKey} required={field.required} helperText={field.help}
        start={dateFieldValue(value)} end={dateFieldValue(values[endKey])} onChange={(range) => onChange({ ...values, ...field.reset, [field.key]: range.start, [endKey]: range.end })} />;
    }
    if (field.type === 'checkbox') return <FormControlLabel key={field.key} label={field.label} control={<Checkbox checked={Boolean(value)} onChange={(_, checked) => update(checked)} />} />;
    if (field.pagedOptions) return <PagedAutocomplete key={field.key} {...field.pagedOptions} value={String(value)} onChange={update} label={field.label} required={field.required} helperText={field.help} />;
    if (field.options) return <Autocomplete key={field.key} options={field.options} value={field.options.find((option) => option.value === value) ?? null} getOptionLabel={(option) => option.label} isOptionEqualToValue={(a, b) => a.value === b.value} onChange={(_, option) => update(option?.value ?? '')} renderInput={(params) => <TextField {...params} label={field.label} required={field.required} helperText={field.help} />} />;
    return <TextField key={field.key} fullWidth label={field.label} value={value} type={field.type ?? 'text'} required={field.required} multiline={field.multiline} minRows={field.multiline ? 2 : undefined} helperText={field.help} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: field.min, max: field.max, step: field.step ?? 1 } }} onChange={(event) => update(['number', 'date', 'datetime-local'].includes(field.type ?? '') && event.target.value !== '' ? Number(event.target.value) : event.target.value)} />;
  })}</Stack>;
}

export function OperationForm({ title, fields, initial = {}, onSave, onClose, children, submitLabel }: { title: string; fields: Field[] | ((values: Values) => Field[]); initial?: Values; onSave: (values: Values) => Promise<unknown>; onClose: () => void; children?: ReactNode; submitLabel?: string }) {
  const [values, setValues] = useState(initial);
  const command = useOperationCommand();
  const close = () => { if (!command.isPending) onClose(); };
  return <FormDialog open onClose={close}>
    <DialogForm title={title} onCancel={close} submitLabel={submitLabel} pending={command.isPending} error={command.error?.message}
      onSubmit={() => command.mutate(() => onSave(values), { onSuccess: onClose })}>
      {children}<Fields fields={typeof fields === 'function' ? fields(values) : fields} values={values} onChange={setValues} />
    </DialogForm>
  </FormDialog>;
}
