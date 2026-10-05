import { expect, test } from 'bun:test';
import { parseCsv } from '../src/utils/csv/core';
import { parseFactionOrdersFromCsv, parseGeneralOrdersFromCsv } from '../src/utils/csv/orders';
import type { CsvReference } from '../src/utils/csv/reference';
import type { EventType, Faction, Item } from '../src/types';

const { rows } = parseCsv(await Bun.file('sample_imports/sample_stock.csv').text());
const items = rows.filter((row) => row.Typ === 'Artikel').map((row, index) => ({
  id: `item-${index}`, name: row.Name, isConsumable: row.Verbrauchsmaterial === 'Ja',
} as Item));
const factions: [EventType, string][] = [['DE', 'KGG'], ['DE', 'GOF'], ['DE', 'Enklave'], ['DE', 'Miliz'], ['LS', 'UCRF'], ['LS', 'TERA']];
const reference: CsvReference = {
  eventTypes: ['ASD', 'DE', 'LS', 'M24', 'TNO'],
  factions: factions.map(([eventType, name]) => ({ id: name, eventType, name, slug: name.toLowerCase() } as Faction)),
};

test('every sample order row is valid', () => {
  const faction = parseFactionOrdersFromCsv(rows, items, reference);
  const general = parseGeneralOrdersFromCsv(rows, items, reference);
  expect(faction.filter((row) => row.status === 'error').map((row) => `${row.index}: ${row.statusMessage}`)).toEqual([]);
  expect(general.filter((row) => row.status === 'error').map((row) => `${row.index}: ${row.statusMessage}`)).toEqual([]);
});

test('sample has finished orders of past events and open ones to prepare', () => {
  const today = '2026-10-05';
  const faction = parseFactionOrdersFromCsv(rows, items, reference);
  const general = parseGeneralOrdersFromCsv(rows, items, reference);
  const finished = ['returned', 'closed'];
  expect(faction.some((row) => row.data.eventType === 'DE' && finished.includes(row.targetStatus))).toBe(true);
  expect(faction.filter((row) => row.data.eventDate < today).every((row) => finished.includes(row.targetStatus))).toBe(true);
  expect(general.filter((row) => row.eventDate < today && finished.includes(row.targetStatus)).length).toBeGreaterThanOrEqual(5);
  expect(faction.some((row) => row.targetStatus === 'submitted' && row.data.eventDate > today)).toBe(true);
});

test('orders past "ready" need an exact pickup point', () => {
  const header = 'Typ;Eventtyp;Eventdatum;Fraktion;Bestellte Artikel;Bestellstatus;Abholpunkt';
  const parse = (status: string, point: string) => parseFactionOrdersFromCsv(
    parseCsv(`${header}\nBestellung;LS;2025-06-14;TERA;Biertisch: 1;${status};${point}`).rows, items, reference)[0];
  expect(parse('Abgeschlossen', '').status).toBe('error');
  expect(parse('Abgeschlossen', 'irgendwo').status).toBe('error');
  expect(parse('Eingereicht', '').status).toBe('valid');
  const valid = parse('Abgeschlossen', '50.5520, 9.6800');
  expect(valid.status).toBe('valid');
  expect(valid.pickupPoint).toEqual({ latitude: 50.552, longitude: 9.68 });
});
