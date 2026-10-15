import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { InputAdornment, TextField as MuiTextField, type TextFieldProps } from '@mui/material';
import { useForkRef } from '@mui/material/utils';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { IconButton } from './ActionButtons';
import { formatDateInput, parseDateInput } from '../../utils/dateFormat';
import { useT } from '../../utils/naming';

/** Shared field: dates always display DD-MM-YYYY, with a native calendar available. */
export function TextField(props: TextFieldProps) {
  return props.type === 'date' || props.type === 'datetime-local' ? <DateField {...props} /> : <MuiTextField {...props} />;
}

function DateField({ value, type, onChange, slotProps, inputRef, ...props }: TextFieldProps) {
  const t = useT();
  const withTime = type === 'datetime-local';
  const source = String(value ?? '');
  const [draft, setDraft] = useState({ source, text: formatDateInput(source, withTime) });
  const text = draft.source === source ? draft.text : formatDateInput(source, withTime);
  const visibleRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const mergedRef = useForkRef(visibleRef, inputRef);
  const parsed = parseDateInput(text, withTime);
  // Date callers supply ordinary slot objects, so retain their min/max and read-only constraints.
  const htmlInput = (typeof slotProps?.htmlInput === 'object' ? slotProps.htmlInput : {}) as InputHTMLAttributes<HTMLInputElement>;
  const input = typeof slotProps?.input === 'object' ? slotProps.input : {};
  const min = htmlInput.min == null ? undefined : String(htmlInput.min).slice(0, withTime ? 16 : 10);
  const max = htmlInput.max == null ? undefined : String(htmlInput.max).slice(0, withTime ? 16 : 10);
  const invalid = parsed === null || Boolean(parsed && ((min && parsed < min) || (max && parsed > max)));
  const message = parsed === null ? t('common.invalidDateFormat', { format: withTime ? 'DD-MM-YYYY HH:mm' : 'DD-MM-YYYY' })
    : t('common.dateOutsideRange');

  useEffect(() => {
    visibleRef.current?.setCustomValidity(invalid ? message : '');
  }, [invalid, message, text]);

  function emit(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, next: string) {
    onChange?.({ ...event, target: { ...event.target, value: next, name: event.target.name, id: event.target.id }, currentTarget: { ...event.currentTarget, value: next } } as ChangeEvent<HTMLInputElement>);
  }

  return <>
    <MuiTextField {...props} type="text" value={text} placeholder={withTime ? 'DD-MM-YYYY HH:mm' : 'DD-MM-YYYY'}
      error={props.error || invalid} helperText={invalid ? message : props.helperText}
      inputRef={mergedRef}
      slotProps={{ ...slotProps, inputLabel: { ...(typeof slotProps?.inputLabel === 'object' ? slotProps.inputLabel : {}), shrink: true },
        htmlInput: { ...htmlInput, maxLength: withTime ? 16 : 10, 'data-date-field': true },
        input: { ...input, endAdornment: <>{input.endAdornment}<InputAdornment position="end">
          <IconButton size="small" title={t('common.openCalendar')} disabled={props.disabled || input.readOnly} onClick={() => pickerRef.current?.showPicker?.()}><CalendarMonthOutlinedIcon fontSize="small" /></IconButton>
        </InputAdornment></> } }}
      onChange={(event) => {
        const next = parseDateInput(event.target.value, withTime);
        setDraft({ source: next ?? source, text: event.target.value });
        if (next !== null) emit(event, next);
      }} />
    <input ref={pickerRef} type={type} value={parsed ?? source} min={min} max={max} disabled={props.disabled || input.readOnly}
      aria-hidden="true" tabIndex={-1} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft({ source: next, text: formatDateInput(next, withTime) });
        emit(event, next);
      }} />
  </>;
}
