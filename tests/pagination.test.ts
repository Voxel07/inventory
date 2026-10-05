import { expect, test } from 'bun:test';
import { isFullPage, recordFilteredRows } from '../src/services/pageCompleteness';

test('a page shortened by the privacy filter is not mistaken for the last page', () => {
  const filtered = Array.from({ length: 97 }, (_, index) => ({ id: String(index) }));
  recordFilteredRows(filtered, 3);
  expect(isFullPage(filtered, 100)).toBe(true);
  expect(isFullPage(filtered.slice(), 100)).toBe(false);
  expect(isFullPage(Array.from({ length: 100 }), 100)).toBe(true);
});
