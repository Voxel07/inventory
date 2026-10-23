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
  expect(orders.filter((order) => new Date(order.date).getUTCFullYear() !== 2027 && order.status !== 'closed')).toEqual([]);
  expect(orders.filter((order) => new Date(order.date).getUTCFullYear() === 2027 && order.status === 'closed')).toEqual([]);
});

test('admin combined import bootstraps the sample from an empty reference catalog', () => {
  const result = buildCsvImportPlan({ csvContent: sample, tabType: 'combined', items: [], assemblies: [],
    storageLocations: [], updateExistingItems: false, reference: { eventTypes: [], factions: [] }, autoCreateReferences: true });
  expect(result.totalErrorsCount).toBe(0);
  expect(result.validEventsCount).toBe(14);
  expect(result.validOrdersCount).toBe(22);
  expect(result.validGeneralOrdersCount).toBe(11);
  expect(result.validCheckoutsCount).toBe(countType('Ausleihe'));
  expect(result.validCheckoutsCount).toBeGreaterThan(0);
  expect(result.newFactions.map((faction) => `${faction.eventType}:${faction.name}`).sort()).toEqual(
    factions.map(([type, name]) => `${type}:${name}`).sort());
  expect(result.parsedItems.find((row) => row.data.name === 'Hesco-Barriere klein (1x1m)')?.data.eventTypes)
    .toEqual(['LS', 'DE', 'TNO']);
  const ids = new Set(result.newFactions.map((faction) => faction.id));
  expect(result.parsedEvents.flatMap((row) => row.attendees.flatMap((person) => person.roles))
    .filter((role) => role.factionId).every((role) => ids.has(role.factionId!))).toBe(true);
});

test('strict reference validation remains available when auto-creation is disabled', () => {
  const result = buildCsvImportPlan({ csvContent: sample, tabType: 'combined', items: [], assemblies: [],
    storageLocations: [], updateExistingItems: false, reference: { eventTypes: [], factions: [] } });
  expect(result.validEventsCount).toBe(0);
  expect(result.validOrdersCount).toBe(0);
  expect(result.validGeneralOrdersCount).toBe(0);
  expect(result.validCheckoutsCount).toBe(0);
  expect(result.newFactions).toEqual([]);
});

test('reference planning reuses catalog IDs and does not create factions for excluded or invalid rows', () => {
  const input = { csvContent: sample, tabType: 'combined' as const, items: [], assemblies: [], storageLocations: [],
    updateExistingItems: false, reference, autoCreateReferences: true };
  const existing = buildCsvImportPlan(input);
  expect(existing.totalErrorsCount).toBe(0);
  expect(existing.newFactions).toEqual([]);
  expect(existing.parsedEvents.find((row) => row.data.eventType === 'DE')?.attendees[0].roles[0].factionId).toBe('KGG');
  expect(buildCsvImportPlan({ ...input, tabType: 'items', reference: { eventTypes: [], factions: [] } }).newFactions).toEqual([]);
  const invalid = buildCsvImportPlan({ ...input, reference: { eventTypes: [], factions: [] },
    csvContent: 'Typ;Name;Eventtyp;Eventdatum;Fraktion\nBestellung;Invalid;DE;17-10-2026;New\nAusleihe;Unknown;DE;;Other' });
  expect(invalid.newFactions).toEqual([]);
  expect(invalid.totalErrorsCount).toBe(2);
});

test('reference auto-creation does not accept missing event types or checkout factions', () => {
  const result = buildCsvImportPlan({ csvContent: 'Typ;Name;Kategorie;Menge;Eventtyp;Eventdatum;Fraktion\nArtikel;Radio;Equipment;2;;;\nEvent;Unnamed;;;;17-10-2026;\nAusleihe;Radio;;1;DE;;',
    tabType: 'combined', items: [], assemblies: [], storageLocations: [], updateExistingItems: false,
    reference: { eventTypes: [], factions: [] }, autoCreateReferences: true });
  expect(result.parsedEvents[0].status).toBe('error');
  expect(result.parsedCheckouts[0].status).toBe('error');
  expect(result.newFactions).toEqual([]);
});
