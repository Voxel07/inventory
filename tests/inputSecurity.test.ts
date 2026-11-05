import { expect, test } from 'bun:test';
import { parseCsv } from '../src/utils/csv/core';
import { csvCell } from '../src/utils/csvExport';
import { translate } from '../src/utils/naming';

test('CSV exports escape formulas including leading whitespace and newlines', () => {
  for (const value of ['=1+1', ' +SUM(1)', '\n@SUM(1)', '\ttext', '-1+2', '\uFEFF=1']) {
    expect(csvCell(value)).toBe(`"'${value}"`);
  }
  expect(csvCell('a,"b"')).toBe('"a,""b"""');
  expect(csvCell('normal')).toBe('"normal"');
});

test('CSV parser rejects malformed and excessive input before preview work', () => {
  expect(() => parseCsv('name\n"unclosed')).toThrow(translate('inputSecurity.csvUnterminated'));
  expect(() => parseCsv('name,Name\na,b')).toThrow(translate('inputSecurity.csvHeaders'));
  expect(() => parseCsv('name\nx\0y')).toThrow(translate('inputSecurity.csvNul'));
  expect(() => parseCsv('name\n' + 'x'.repeat(16001))).toThrow(translate('inputSecurity.csvFieldLength'));
  expect(() => parseCsv(Array.from({ length: 129 }, (_, i) => `col${i}`).join(','))).toThrow(translate('inputSecurity.csvColumns'));
  expect(() => parseCsv('name\n' + 'a\n'.repeat(50001))).toThrow(translate('inputSecurity.csvRows'));
  expect(() => parseCsv('x'.repeat(8000001))).toThrow(translate('inputSecurity.csvTooLarge'));
});

test('CSV headers cannot inject inherited object properties', () => {
  const { rows } = parseCsv('__proto__,constructor,name\na,b,"quoted, name"');
  expect(Object.getPrototypeOf(rows[0])).toBeNull();
  expect(Object.hasOwn(rows[0], '__proto__')).toBe(true);
  expect(rows[0].name).toBe('quoted, name');
});
