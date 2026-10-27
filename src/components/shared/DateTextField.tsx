import { createContext, useContext, useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type Ref } from 'react';
import { Box, InputAdornment, Popover, Stack, TextField as MuiTextField, Typography, type TextFieldProps } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { DateField } from '@mui/x-date-pickers/DateField';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { DateTimeField } from '@mui/x-date-pickers/DateTimeField';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { PickerDay, type PickerDayProps } from '@mui/x-date-pickers/PickerDay';
import { TimeField } from '@mui/x-date-pickers/TimeField';
import dayjs, { type Dayjs } from 'dayjs';
import { type DateFieldValue } from '../../utils/dateFormat';
import { Button, IconButton } from './ActionButtons';
import { useT } from '../../utils/naming';

const DATE_FORMAT = 'DD-MM-YYYY';
const DATE_TIME_FORMAT = 'DD-MM-YYYY HH:mm';

/** Pickers exchange epoch milliseconds; date-only values represent midnight UTC. */
function toDayjs(value: unknown, withTime = false): Dayjs | null {
  if (value == null || value === '') return null;
  const epoch = Number(value);
  const date = new Date(epoch);
  const parsed = withTime ? dayjs(epoch) : dayjs(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return parsed.isValid() ? parsed : null;
}

function toValue(date: Dayjs | null, withTime: boolean): DateFieldValue | null {
  if (!date) return '';
  if (!date.isValid()) return null;
  return withTime ? date.valueOf() : Date.UTC(date.year(), date.month(), date.date());
}

/** Hidden picker inputs take part in native form validation, as DialogForm expects of date fields. */
function useDateValidity(message: string) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => { ref.current?.setCustomValidity(message); }, [message]);
  return (element: HTMLInputElement | null) => {
    ref.current = element;
    if (element) { element.dataset.dateField = 'true'; element.setCustomValidity(message); }
  };
}

/** Shared field: date and date-time types render MUI pickers that display DD-MM-YYYY. */
export function TextField(props: TextFieldProps) {
  return props.type === 'date' || props.type === 'datetime-local' ? <PickerField {...props} /> : <MuiTextField {...props} />;
}

function PickerField({ value, type, onChange, slotProps, label, required, fullWidth, size, error, helperText, disabled, sx, name, autoFocus }: TextFieldProps) {
  const t = useT();
  const withTime = type === 'datetime-local';
  const source: DateFieldValue = value == null || value === '' ? '' : Number(value);
  const [draft, setDraft] = useState<{ source: DateFieldValue; date: Dayjs | null }>({ source, date: toDayjs(source, withTime) });
  const date = draft.source === source ? draft.date : toDayjs(source, withTime);
  // Date callers supply ordinary slot objects, so retain their min/max and read-only constraints.
  const htmlInput = (typeof slotProps?.htmlInput === 'object' ? slotProps.htmlInput : {}) as InputHTMLAttributes<HTMLInputElement>;
  const input = typeof slotProps?.input === 'object' ? slotProps.input : {};
  const readOnly = Boolean((input as { readOnly?: boolean }).readOnly || htmlInput.readOnly);
  const min = toDayjs(htmlInput.min, withTime);
  const max = toDayjs(htmlInput.max, withTime);
  const unit = withTime ? 'minute' : 'day';
  const malformed = Boolean(date && !date.isValid());
  const outOfRange = Boolean(date?.isValid() && ((min && date.isBefore(min, unit)) || (max && date.isAfter(max, unit))));
  const message = malformed ? t('common.invalidDateFormat', { format: withTime ? DATE_TIME_FORMAT : DATE_FORMAT })
    : outOfRange ? t('common.dateOutsideRange') : '';
  const inputRef = useDateValidity(message);

  function change(next: Dayjs | null) {
    setDraft({ source: toValue(next, withTime) ?? source, date: next });
    const emitted = toValue(next, withTime);
    if (emitted !== null && emitted !== source) {
      onChange?.({ target: { value: String(emitted), name }, currentTarget: { value: String(emitted), name } } as unknown as ChangeEvent<HTMLInputElement>);
    }
  }

  const textField = { required, fullWidth, size, name, autoFocus, sx, error: Boolean(error) || Boolean(message), helperText: message || helperText };
  return withTime
    ? <DateTimePicker label={label} value={date} onChange={change} format={DATE_TIME_FORMAT} ampm={false} disabled={disabled} readOnly={readOnly}
      minDateTime={min ?? undefined} maxDateTime={max ?? undefined} inputRef={inputRef} slotProps={{ textField }} />
    : <DatePicker label={label} value={date} onChange={change} format={DATE_FORMAT} disabled={disabled} readOnly={readOnly}
      minDate={min ?? undefined} maxDate={max ?? undefined} inputRef={inputRef} slotProps={{ textField }} />;
}

type Bound = 'start' | 'end';
type RangeHighlight = { start: Dayjs | null; end: Dayjs | null; hover: Dayjs | null; picking: Bound; setHover: (day: Dayjs | null) => void };
const RangeContext = createContext<RangeHighlight | null>(null);

/** Calendar day that paints the span between start and end (and the hovered end while picking it). */
function RangeDay(props: PickerDayProps) {
  const range = useContext(RangeContext);
  const { day, outsideCurrentMonth } = props;
  const start = range?.start ?? null;
  const end = range?.end ?? (range?.picking === 'end' && range.hover && start && !range.hover.isBefore(start, 'day') ? range.hover : null);
  const isStart = Boolean(start?.isSame(day, 'day'));
  const isEnd = Boolean(end?.isSame(day, 'day'));
  const inside = Boolean(start && end && !day.isBefore(start, 'day') && !day.isAfter(end, 'day'));
  const preview = !range?.end && inside;
  return <Box onMouseEnter={() => range?.setHover(day)}
    sx={(theme) => ({
      display: 'flex',
      ...(inside && !outsideCurrentMonth && {
        bgcolor: alpha(theme.palette.primary.main, preview ? 0.08 : 0.18),
        ...(isStart && { borderTopLeftRadius: '50%', borderBottomLeftRadius: '50%' }),
        ...(isEnd && { borderTopRightRadius: '50%', borderBottomRightRadius: '50%' }),
      }),
    })}>
    <PickerDay {...props} selected={!outsideCurrentMonth && (isStart || (isEnd && !preview))} />
  </Box>;
}

type DateRangeFieldProps = {
  startLabel: string;
  endLabel: string;
  start: DateFieldValue;
  end: DateFieldValue;
  onChange: (range: { start: DateFieldValue; end: DateFieldValue }) => void;
  /** Date-time bounds keep their wall-clock time and add time fields below the calendar. */
  withTime?: boolean;
  /** `true` requires both bounds; `'start'` leaves the end optional. */
  required?: boolean | 'start';
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  disabled?: boolean;
  helperText?: string;
  /** Shown on the end field when it lies before the start. */
  rangeErrorText?: string;
  autoFocus?: boolean;
};

/** Start and end in one connected control: both fields open the same calendar, which highlights the span. */
export function DateRangeField({ startLabel, endLabel, start, end, onChange, withTime = false, required = false, size, fullWidth = true, disabled, helperText, rangeErrorText, autoFocus }: DateRangeFieldProps) {
  const t = useT();
  const anchor = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<Bound>('start');
  const [hover, setHover] = useState<Dayjs | null>(null);
  const [drafts, setDrafts] = useState<Record<Bound, { source: DateFieldValue; date: Dayjs | null }>>({
    start: { source: start, date: toDayjs(start, withTime) }, end: { source: end, date: toDayjs(end, withTime) },
  });
  const startDate = drafts.start.source === start ? drafts.start.date : toDayjs(start, withTime);
  const endDate = drafts.end.source === end ? drafts.end.date : toDayjs(end, withTime);
  const unit = withTime ? 'minute' : 'day';
  const format = withTime ? DATE_TIME_FORMAT : DATE_FORMAT;
  const malformed = (date: Dayjs | null) => Boolean(date && !date.isValid());
  const reversed = Boolean(startDate?.isValid() && endDate?.isValid() && endDate.isBefore(startDate, unit));
  const startMessage = malformed(startDate) ? t('common.invalidDateFormat', { format }) : '';
  const endMessage = malformed(endDate) ? t('common.invalidDateFormat', { format }) : reversed ? rangeErrorText ?? t('common.endBeforeStart') : '';
  const startRef = useDateValidity(startMessage);
  const endRef = useDateValidity(endMessage);

  function emit(next: Record<Bound, Dayjs | null>) {
    setDrafts({ start: { source: toValue(next.start, withTime) ?? start, date: next.start }, end: { source: toValue(next.end, withTime) ?? end, date: next.end } });
    const nextStart = toValue(next.start, withTime);
    const nextEnd = toValue(next.end, withTime);
    if (nextStart !== null && nextEnd !== null && (nextStart !== start || nextEnd !== end)) onChange({ start: nextStart, end: nextEnd });
  }

  function openCalendar(bound: Bound) {
    if (disabled) return;
    setPicking(bound);
    setOpen(true);
  }

  /** Calendar days keep each bound's time; a picked end before the start restarts the span there. */
  function pickDay(day: Dayjs | null) {
    if (!day) return;
    const withClock = (base: Dayjs | null, fallback: string) => {
      const [hours, minutes] = fallback.split(':').map(Number);
      const clock = base?.isValid() ? base : day.hour(hours).minute(minutes);
      return day.hour(clock.hour()).minute(clock.minute()).second(0).millisecond(0);
    };
    const validStart = startDate?.isValid() ? startDate : null;
    const validEnd = endDate?.isValid() ? endDate : null;
    if (picking === 'start' || (validStart && day.isBefore(validStart, 'day'))) {
      const nextStart = withClock(validStart, '00:00');
      emit({ start: nextStart, end: validEnd && validEnd.isBefore(nextStart, 'day') ? null : validEnd });
      setPicking('end');
      return;
    }
    emit({ start: validStart, end: withClock(validEnd, '23:59') });
    if (!withTime) setOpen(false);
  }

  const startRequired = required === true || required === 'start';
  const field = (bound: Bound) => {
    const props = {
      label: bound === 'start' ? startLabel : endLabel,
      value: bound === 'start' ? startDate : endDate,
      format,
      disabled,
      autoFocus: bound === 'start' && autoFocus,
      inputRef: (bound === 'start' ? startRef : endRef) as Ref<HTMLInputElement>,
      onChange: (date: Dayjs | null) => emit(bound === 'start' ? { start: date, end: endDate } : { start: startDate, end: date }),
      slotProps: { textField: {
        required: bound === 'start' ? startRequired : required === true,
        size,
        fullWidth: true,
        focused: open && picking === bound ? true : undefined,
        error: Boolean(bound === 'start' ? startMessage : endMessage),
        helperText: (bound === 'start' ? startMessage : endMessage) || undefined,
        slotProps: { input: { endAdornment: <InputAdornment position="end">
          <IconButton size="small" edge="end" title={t('common.openCalendar')} disabled={disabled} onClick={() => openCalendar(bound)}>
            <CalendarMonthOutlinedIcon fontSize="small" />
          </IconButton>
        </InputAdornment> } },
      } },
    };
    return withTime ? <DateTimeField {...props} ampm={false} /> : <DateField {...props} />;
  };

  return <Box sx={{ width: fullWidth ? '100%' : undefined, minWidth: 0 }}>
    <Stack ref={anchor} direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { sm: 'flex-start' }, gap: { xs: 1.5, sm: 0 } }}>
      <Box sx={{ flex: 1, minWidth: 0, '& .MuiPickersOutlinedInput-root': { borderTopRightRadius: { sm: 0 }, borderBottomRightRadius: { sm: 0 } } }}>{field('start')}</Box>
      <Typography aria-hidden color="text.secondary" sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', px: 1, alignSelf: 'stretch', maxHeight: size === 'small' ? 40 : 56,
        borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>–</Typography>
      <Box sx={{ flex: 1, minWidth: 0, '& .MuiPickersOutlinedInput-root': { borderTopLeftRadius: { sm: 0 }, borderBottomLeftRadius: { sm: 0 } } }}>{field('end')}</Box>
    </Stack>
    {helperText && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, mx: 1.75 }}>{helperText}</Typography>}
    <Popover open={open} anchorEl={() => anchor.current as HTMLElement} onClose={() => { setOpen(false); setHover(null); }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
      <Box sx={{ p: 1 }} onMouseLeave={() => setHover(null)}>
        <Typography variant="overline" color="text.secondary" sx={{ px: 2, display: 'block' }}>
          {picking === 'start' ? startLabel : endLabel}
        </Typography>
        <RangeContext.Provider value={{ start: startDate?.isValid() ? startDate : null, end: endDate?.isValid() ? endDate : null, hover, picking, setHover }}>
          <DateCalendar value={(picking === 'start' ? startDate : endDate)?.isValid() ? (picking === 'start' ? startDate : endDate) : null}
            referenceDate={startDate?.isValid() ? startDate : undefined}
            onChange={pickDay} slots={{ day: RangeDay }} />
        </RangeContext.Provider>
        {withTime && <Stack direction="row" spacing={1} sx={{ px: 2, pb: 1 }}>
          <TimeField label={startLabel} size="small" ampm={false} format="HH:mm" value={startDate?.isValid() ? startDate : null} disabled={!startDate?.isValid()}
            onChange={(time) => time?.isValid() && startDate && emit({ start: startDate.hour(time.hour()).minute(time.minute()), end: endDate })} />
          <TimeField label={endLabel} size="small" ampm={false} format="HH:mm" value={endDate?.isValid() ? endDate : null} disabled={!endDate?.isValid()}
            onChange={(time) => time?.isValid() && endDate && emit({ start: startDate, end: endDate.hour(time.hour()).minute(time.minute()) })} />
        </Stack>}
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', px: 2, pb: 1 }}>
          {required !== true && <Button size="small" onClick={() => emit(required === 'start' ? { start: startDate, end: null } : { start: null, end: null })}>
            {t('common.clear')}
          </Button>}
          <Button size="small" variant="contained" onClick={() => setOpen(false)}>{t('common.done')}</Button>
        </Stack>
      </Box>
    </Popover>
  </Box>;
}
