import { expect, test } from 'bun:test';
import { formatDate, formatDateTime } from '../src/utils/dateFormat';

test('dates render as DD-MM-YYYY regardless of browser locale', () => {
  expect(formatDate('2027-06-12')).toBe('12-06-2027');
  expect(formatDate(new Date(2026, 0, 5, 23, 59))).toBe('05-01-2026');
});

test('date-times render as DD-MM-YYYY HH:mm in 24 h format', () => {
  expect(formatDateTime(new Date(2026, 9, 5, 14, 7))).toBe('05-10-2026 14:07');
  expect(formatDateTime(new Date(2026, 9, 5, 0, 0))).toBe('05-10-2026 00:00');
});

test('missing or invalid values use the fallback', () => {
  expect(formatDate(undefined)).toBe('—');
  expect(formatDate('', '')).toBe('');
  expect(formatDateTime('not a date')).toBe('—');
});
