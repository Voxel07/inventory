import { expect, test } from 'bun:test';
import { calendarDayInstant, formatDate, formatDateTime } from '../src/utils/dateFormat';

test('dates render as DD-MM-YYYY regardless of browser locale', () => {
  expect(formatDate(Date.UTC(2027, 5, 12))).toBe('12-06-2027');
  expect(formatDate(Date.UTC(2026, 0, 5))).toBe('05-01-2026');
});

test('date-times render as DD-MM-YYYY HH:mm in 24 h format', () => {
  expect(formatDateTime(new Date(2026, 9, 5, 14, 7))).toBe('05-10-2026 14:07');
  expect(formatDateTime(new Date(2026, 9, 5, 0, 0))).toBe('05-10-2026 00:00');
});

test('missing or invalid values use the fallback', () => {
  expect(formatDate(undefined)).toBe('—');
  expect(formatDate(null, '')).toBe('');
  expect(formatDateTime(NaN)).toBe('—');
});

test('transaction calendar bounds include the full end day across daylight-saving changes', () => {
  const originalZone = process.env.TZ;
  process.env.TZ = 'Europe/Berlin';
  try {
    expect(calendarDayInstant(Date.UTC(2026, 9, 1))).toBe(Date.parse('2026-09-30T22:00:00.000Z'));
    expect(calendarDayInstant(Date.UTC(2026, 9, 24), true)).toBe(Date.parse('2026-10-24T22:00:00.000Z'));
    expect(calendarDayInstant(Date.UTC(2026, 9, 25), true)).toBe(Date.parse('2026-10-25T23:00:00.000Z'));
    expect(calendarDayInstant(Date.UTC(2026, 2, 29), true)).toBe(Date.parse('2026-03-29T22:00:00.000Z'));
    expect(calendarDayInstant(Date.UTC(2026, 9, 25))).toBe(Date.parse('2026-10-24T22:00:00.000Z'));
    expect(calendarDayInstant(undefined)).toBeUndefined();
    expect(calendarDayInstant(undefined, true)).toBeUndefined();
  } finally {
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  }
});
