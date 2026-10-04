import { useState, type ReactNode } from 'react';
import { Autocomplete, Checkbox, FormControlLabel, Stack, TextField } from '@mui/material';
import { useOperationCommand } from '../../hooks/useOperations';
import { DialogForm, FormDialog } from '../shared/FormDialog';

export type Values = Record<string, string | number | boolean>;
export type Option = { value: string; label: string };
export type Field = { key: string; label: string; type?: 'number' | 'date' | 'datetime-local' | 'checkbox' | 'text'; required?: boolean; min?: number; max?: number; step?: number; options?: Option[]; multiline?: boolean; help?: string; reset?: Values };

export function Fields({ fields, values, onChange }: { fields: Field[]; values: Values; onChange: (values: Values) => void }) {
  return <Stack spacing={2}>{fields.map((field) => {
    const value = values[field.key] ?? '';
    const update = (next: string | number | boolean) => onChange({ ...values, ...field.reset, [field.key]: next });
    if (field.type === 'checkbox') return <FormControlLabel key={field.key} label={field.label} control={<Checkbox checked={Boolean(value)} onChange={(_, checked) => update(checked)} />} />;
    if (field.options) return <Autocomplete key={field.key} options={field.options} value={field.options.find((option) => option.value === value) ?? null} getOptionLabel={(option) => option.label} isOptionEqualToValue={(a, b) => a.value === b.value} onChange={(_, option) => update(option?.value ?? '')} renderInput={(params) => <TextField {...params} label={field.label} required={field.required} helperText={field.help} />} />;
    return <TextField key={field.key} fullWidth label={field.label} value={value} type={field.type ?? 'text'} required={field.required} multiline={field.multiline} minRows={field.multiline ? 2 : undefined} helperText={field.help} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: field.min, max: field.max, step: field.step ?? 1 } }} onChange={(event) => update(field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} />;
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
