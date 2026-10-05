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
