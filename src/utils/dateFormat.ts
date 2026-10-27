/** Dates cross API/storage boundaries as signed epoch milliseconds. Calendar days use midnight UTC. */
type DateValue = number | Date | null | undefined;
export type DateFieldValue = number | '';
const pad = (value: number) => String(value).padStart(2, '0');

function toDate(value: DateValue): Date | null {
  if (value == null || (typeof value !== 'number' && !(value instanceof Date))) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Calendar-day display is independent of the viewer's time zone. */
export function formatDate(value: DateValue, fallback = '—'): string {
  const date = toDate(value);
  return date ? `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}` : fallback;
}

/** Actual instants display in the viewer's local time, with the same DD-MM-YYYY date convention. */
export function formatDateTime(value: DateValue, fallback = '—'): string {
  const date = toDate(value);
  return date ? `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}` : fallback;
}

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
  const match = (withTime ? /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/ : /^(\d{2})-(\d{2})-(\d{4})$/).exec(value.trim());
  if (!match) return null;
  const [, day, month, year, hours = '0', minutes = '0'] = match;
  const date = withTime ? new Date(+year, +month - 1, +day, +hours, +minutes) : new Date(Date.UTC(+year, +month - 1, +day));
  const formatted = formatDateInput(date.getTime(), withTime);
  return Number.isSafeInteger(date.getTime()) && formatted === value.trim() ? date.getTime() : null;
}

export const dateFieldValue = (value: unknown): DateFieldValue => value == null || value === '' ? '' : Number(value);
export const formatTime = (value: number): string => { const date = new Date(value); return `${pad(date.getHours())}:${pad(date.getMinutes())}`; };

/** Report facts are typed by their column key; numeric quantities must remain quantities. */
export function formatReportValue(key: string, value: unknown, fallback = '—'): string {
  if (value == null) return fallback;
  if (typeof value === 'number') {
    if (key === 'date' || key === 'due' || /Date$/.test(key) || key === 'returnDue' || key === 'availableFrom' || key === 'availableUntil') return formatDate(value, fallback);
    if (/At$/.test(key) || key === 'timestamp') return formatDateTime(value, fallback);
  }
  return String(value);
}
