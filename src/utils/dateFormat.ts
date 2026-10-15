type DateValue = string | number | Date | null | undefined;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (value: number) => String(value).padStart(2, '0');

/** Date-only ISO strings are calendar days; parsing them as UTC would shift them west of Greenwich. */
function toDate(value: DateValue): Date | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const day = DATE_ONLY.exec(value);
    if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** DD-MM-YYYY; empty or invalid values render as the fallback. */
export function formatDate(value: DateValue, fallback = '—'): string {
  const date = toDate(value);
  return date ? `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}` : fallback;
}

/** DD-MM-YYYY HH:mm (24 h). */
export function formatDateTime(value: DateValue, fallback = '—'): string {
  const date = toDate(value);
  return date ? `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}` : fallback;
}

/** Form fields preserve the event's wall-clock time and exchange ISO values with the API. */
export function formatDateInput(value: string, withTime: boolean): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}${withTime ? ` ${match[4] ?? '00:00'}` : ''}` : value;
}

/** Null means incomplete/invalid input; an empty string clears an optional field. */
export function parseDateInput(value: string, withTime: boolean): string | null {
  if (!value.trim()) return '';
  const match = (withTime ? /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/ : /^(\d{2})-(\d{2})-(\d{4})$/).exec(value.trim());
  if (!match) return null;
  const day = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null;
  if (withTime && (Number(match[4]) > 23 || Number(match[5]) > 59)) return null;
  return withTime ? `${day}T${match[4]}:${match[5]}` : day;
}
