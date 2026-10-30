/**
 * App-wide date format for display, picker input and CSV import. Change it here only.
 * Day.js tokens; supported: DD, MM, YYYY, HH, mm. Any other characters are literal separators.
 */
export const DATE_FORMAT = 'DD.MM.YYYY';
export const TIME_FORMAT = 'HH:mm';
export const DATE_TIME_FORMAT = `${DATE_FORMAT} ${TIME_FORMAT}`;

/** Dates cross API/storage boundaries as signed epoch milliseconds. Calendar days use midnight UTC. */
type DateValue = number | Date | null | undefined;
export type DateFieldValue = number | '';
type Token = 'DD' | 'MM' | 'YYYY' | 'HH' | 'mm';
type DateParts = Record<Token, number>;
const TOKENS = /YYYY|MM|DD|HH|mm/g;
const pad = (value: number) => String(value).padStart(2, '0');

function render(format: string, parts: DateParts): string {
  return format.replace(TOKENS, (token) => token === 'YYYY' ? String(parts.YYYY) : pad(parts[token as Token]));
}

/** Anchored regex for a format; the token order records which capture group holds which part. */
function compile(format: string) {
  const order: Token[] = [];
  const source = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(TOKENS, (token) => { order.push(token as Token); return token === 'YYYY' ? '(\\d{4})' : '(\\d{2})'; });
  return { regex: new RegExp(`^${source}$`), order };
}
const DATE_PATTERN = compile(DATE_FORMAT);
const DATE_TIME_PATTERN = compile(DATE_TIME_FORMAT);

const utcParts = (date: Date): DateParts => ({ YYYY: date.getUTCFullYear(), MM: date.getUTCMonth() + 1, DD: date.getUTCDate(), HH: date.getUTCHours(), mm: date.getUTCMinutes() });
const localParts = (date: Date): DateParts => ({ YYYY: date.getFullYear(), MM: date.getMonth() + 1, DD: date.getDate(), HH: date.getHours(), mm: date.getMinutes() });

function toDate(value: DateValue): Date | null {
  if (value == null || (typeof value !== 'number' && !(value instanceof Date))) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Calendar-day display is independent of the viewer's time zone. */
export function formatDate(value: DateValue, fallback = '—'): string {
  const date = toDate(value);
  return date ? render(DATE_FORMAT, utcParts(date)) : fallback;
}

/** Actual instants display in the viewer's local time, with the same date convention. */
export function formatDateTime(value: DateValue, fallback = '—'): string {
  const date = toDate(value);
  return date ? render(DATE_TIME_FORMAT, localParts(date)) : fallback;
}

/** The viewer's local day of an actual instant, without the time. */
export function formatInstantDate(value: DateValue, fallback = '—'): string {
  const date = toDate(value);
  return date ? render(DATE_FORMAT, localParts(date)) : fallback;
}

/** Whether text has the shape of the configured format; it may still name an impossible day. */
export const matchesDateFormat = (value: string, withTime: boolean): boolean => (withTime ? DATE_TIME_PATTERN : DATE_PATTERN).regex.test(value.trim());

export function calendarDate(value: Date = new Date()): number {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
}

/** Convert a calendar day to a local day boundary; advancing the calendar handles DST. */
export function calendarDayInstant(value: number | undefined, nextDay = false): number | undefined {
  if (value == null) return undefined;
  const date = new Date(value);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + (nextDay ? 1 : 0)).getTime();
}

/** Set a local clock on a UTC calendar date, for new event and maintenance forms. */
export function dateAtTime(value: number, hours = 0, minutes = 0): number {
  const day = new Date(value);
  return new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours, minutes).getTime();
}

function formatDateInput(value: number, withTime: boolean): string {
  return withTime ? formatDateTime(value, '') : formatDate(value, '');
}

/** Null means invalid/incomplete; empty clears an optional field. */
export function parseDateInput(value: string, withTime: boolean): DateFieldValue | null {
  if (!value.trim()) return '';
  const { regex, order } = withTime ? DATE_TIME_PATTERN : DATE_PATTERN;
  const match = regex.exec(value.trim());
  if (!match) return null;
  const parts: DateParts = { YYYY: 0, MM: 0, DD: 0, HH: 0, mm: 0 };
  order.forEach((token, index) => { parts[token] = Number(match[index + 1]); });
  const { YYYY: year, MM: month, DD: day, HH: hours, mm: minutes } = parts;
  const date = withTime ? new Date(year, month - 1, day, hours, minutes) : new Date(Date.UTC(year, month - 1, day));
  const formatted = formatDateInput(date.getTime(), withTime);
  return Number.isSafeInteger(date.getTime()) && formatted === value.trim() ? date.getTime() : null;
}

export const dateFieldValue = (value: unknown): DateFieldValue => value == null || value === '' ? '' : Number(value);
export const formatTime = (value: number): string => render(TIME_FORMAT, localParts(new Date(value)));

/** Report facts are typed by their column key; numeric quantities must remain quantities. */
export function formatReportValue(key: string, value: unknown, fallback = '—'): string {
  if (value == null) return fallback;
  if (typeof value === 'number') {
    if (key === 'date' || key === 'due' || /Date$/.test(key) || key === 'returnDue' || key === 'availableFrom' || key === 'availableUntil') return formatDate(value, fallback);
    if (/At$/.test(key) || key === 'timestamp') return formatDateTime(value, fallback);
  }
  return String(value);
}
