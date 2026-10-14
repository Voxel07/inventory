import { expect, test } from 'bun:test';
import { parseCsv } from '../src/utils/csv/core';
import { buildCsvImportPlan } from '../src/utils/csv/importPlan';
import type { CsvImportType } from '../src/types/csvImport';
import type { CsvReference } from '../src/utils/csv/reference';
import type { EventType, Faction } from '../src/types';

const sample = await Bun.file('sample_imports/sample_stock.csv').text();
const { rows } = parseCsv(sample);
const factions: [EventType, string][] = [['DE', 'KGG'], ['DE', 'GOF'], ['DE', 'Enklave'], ['DE', 'Miliz'], ['LS', 'UCRF'], ['LS', 'TERA']];
const reference: CsvReference = {
  eventTypes: ['ASD', 'DE', 'LS', 'M24', 'TNO'],
  factions: factions.map(([eventType, name]) => ({ id: name, eventType, name, slug: name.toLowerCase() } as Faction)),
};
const plan = (csvContent: string, tabType: CsvImportType) => buildCsvImportPlan({
  csvContent, tabType, items: [], assemblies: [], storageLocations: [], updateExistingItems: false, reference,
});
const countType = (type: string) => rows.filter((row) => row.Typ === type).length;

test('items tab imports only item rows of a combined file', () => {
  const result = plan(sample, 'items');
  expect(result.parsedItems).toHaveLength(countType('Artikel'));
  expect(result.parsedAssemblies).toHaveLength(0);
  expect(result.totalToImport).toBe(result.validItemsCount);
});

test('assemblies tab imports only assembly rows of a combined file', () => {
  const result = plan(sample, 'assemblies');
  expect(result.parsedItems).toHaveLength(0);
  expect(result.parsedAssemblies).toHaveLength(countType('Baugruppe'));
  expect(result.totalToImport).toBe(result.validAssembliesCount);
});

test('untyped files are not parsed as both items and assemblies', () => {
  const assembliesCsv = 'Name;Komponenten\nSet A;"Schraube: 2"';
  const itemsCsv = 'Name;Kategorie;Menge\nSchraube;Kleinteile;10';
  expect(plan(assembliesCsv, 'items').parsedItems).toHaveLength(0);
  expect(plan(assembliesCsv, 'combined').parsedItems).toHaveLength(0);
  expect(plan(itemsCsv, 'assemblies').parsedAssemblies).toHaveLength(0);
  expect(plan(itemsCsv, 'combined').parsedAssemblies).toHaveLength(0);
  expect(plan('Baugruppe;Komponente;Menge\nSet B;Schraube;2', 'items').parsedItems).toHaveLength(0);
});

test('combined import validates orders against items created by the same file', () => {
  const result = plan(sample, 'combined');
  const errors = [...result.parsedOrders, ...result.parsedGeneralOrders].filter((row) => row.status === 'error');
  expect(errors.map((row) => `${row.index}: ${row.statusMessage}`)).toEqual([]);
  expect(result.parsedGeneralOrders.find((row) => row.data.name === 'Sanitätszelt LightSim 2025')?.status).toBe('valid');
});

test('sample orders are closed except those for 2027', () => {
  const result = plan(sample, 'combined');
  const orders = [
    ...result.parsedOrders.map((row) => ({ name: row.data.faction, date: row.data.eventDate, status: row.targetStatus })),
    ...result.parsedGeneralOrders.map((row) => ({ name: row.data.name, date: row.eventDate, status: row.targetStatus })),
  ];
  expect(orders.filter((order) => !order.date.startsWith('2027') && order.status !== 'closed')).toEqual([]);
  expect(orders.filter((order) => order.date.startsWith('2027') && order.status === 'closed')).toEqual([]);
});
