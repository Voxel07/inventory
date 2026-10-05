import { expect, test } from 'bun:test';
import type { Assembly, FactionOrder, Item, StorageLocation } from '../src/types';
import { getItemStock } from '../src/utils/stock';
import { assemblyAvailability } from '../src/utils/factionOrderQuantities';
import { factionOrderItemBaseline, factionOrderAssemblyBaseline, findPreviousFactionOrder } from '../src/utils/factionOrderHistory';
import { isDescendant, locationPath } from '../src/utils/locationHierarchy';
import { calculateImageCrop } from '../src/utils/prepareItemImage';
import { parseCsv, parseInlineComponents } from '../src/utils/csv/core';
import { buildCsvImportPlan } from '../src/utils/csv/importPlan';

test('catalog and assemblies use server availability even when legacy amount disagrees', () => {
  const item = { amount: 999, stock: { totalOwned: 9, onHand: 6, checkedOut: 2, inTransit: 1, damaged: 1, reserved: 2, available: 3, ordered: 10 } } as Item;
  expect(getItemStock(item)).toEqual({ totalStock: 9, checkedOut: 2, inTransit: 1, damaged: 1, remaining: 3 });
  const kit = { itemQuantities: { radio: 2, cable: 1 } } as Assembly;
  expect(assemblyAvailability(kit, id => id === 'radio' ? getItemStock(item).remaining : 5)).toBe(1);
  expect(assemblyAvailability(kit, id => id === 'cable' ? 0 : 3)).toBe(0);
  expect(assemblyAvailability({ itemQuantities: {} } as Assembly, () => 99)).toBe(0);
});

const order = (id: string, date: string, status: FactionOrder['status'] = 'closed', faction = 'KGG', eventType = 'DE'): FactionOrder => ({
  id, eventDate: date, status, faction, eventType, requestedQuantities: { radio: 8 }, preparedQuantities: { radio: 5 },
  requestedAssemblyQuantities: { kit: 3 }, preparedAssemblyQuantities: { kit: 2 },
} as FactionOrder);

test('previous-year comparison ignores current-year, cancelled, other-faction and other-event orders', () => {
  const previous = order('previous', '2025-06-12');
  const candidates = [order('current', '2026-01-01'), order('cancelled', '2025-12-01', 'cancelled'),
    order('other-faction', '2025-11-01', 'closed', 'GOF'), order('other-event', '2025-10-01', 'closed', 'KGG', 'LS'),
    order('older', '2024-06-12'), previous];
  const values = { eventType: 'DE', faction: 'KGG', eventDate: '2026-06-12' };
  expect(findPreviousFactionOrder(candidates, values)).toBe(previous);
  expect(findPreviousFactionOrder(candidates, { ...values, excludeId: 'previous' })?.id).toBe('older');
  expect(findPreviousFactionOrder(candidates, { ...values, eventDate: 'invalid' })).toBeUndefined();
  expect(findPreviousFactionOrder([], values)).toBeUndefined();
});

test('historical baselines compare handed-over preparation; open orders compare demand', () => {
  for (const status of ['picked_up', 'partially_returned', 'returned', 'closed'] as const) {
    const source = order('history', '2025-06-12', status);
    expect(factionOrderItemBaseline(source)).toEqual({ radio: 5 });
    expect(factionOrderAssemblyBaseline(source)).toEqual({ kit: 2 });
  }
  for (const status of ['draft', 'submitted', 'preparing', 'ready'] as const) {
    const source = order('open', '2026-06-12', status);
    expect(factionOrderItemBaseline(source)).toEqual({ radio: 8 });
    expect(factionOrderAssemblyBaseline(source)).toEqual({ kit: 3 });
  }
  const empty = { ...order('empty', '2025-06-12'), preparedQuantities: {}, preparedAssemblyQuantities: {} };
  expect(factionOrderItemBaseline(empty)).toEqual({ radio: 8 });
  expect(factionOrderAssemblyBaseline(empty)).toEqual({ kit: 3 });
});

test('location paths and subtree membership handle missing ancestors and cycles', () => {
  const root = { id: 'root', name: 'Room' } as StorageLocation;
  const child = { id: 'child', name: 'Shelf', parentLocationId: 'root', warehouseName: 'Depot' } as StorageLocation;
  expect(locationPath(child, [root, child])).toBe('Depot / Room / Shelf');
  expect(isDescendant(child, 'root', [root, child])).toBe(true);
  expect(isDescendant(root, 'child', [root, child])).toBe(false);
  expect(locationPath(child, [child])).toBe('Depot / Shelf');
  const cyclic = { ...root, parentLocationId: 'child' };
  expect(locationPath(child, [cyclic, child])).toBe('Depot / Room / Shelf');
  expect(isDescendant(child, 'missing', [cyclic, child])).toBe(false);
});

test('crop positions select image boundaries and zoom preserves the requested aspect', () => {
  expect(calculateImageCrop(2048, 1024, 1, 1, 0, 0)).toEqual({ x: 0, y: 0, width: 1024, height: 1024 });
  expect(calculateImageCrop(2048, 1024, 1, 1, 1, 1)).toEqual({ x: 1024, y: 0, width: 1024, height: 1024 });
  expect(calculateImageCrop(2048, 1024, 1, 2, 0.5, 0.5)).toEqual({ x: 768, y: 256, width: 512, height: 512 });
});

test('CSV parsing preserves quoted delimiters, escaped quotes, multiline fields, BOM and CRLF', () => {
  expect(parseCsv('\uFEFFName;Beschreibung;Menge\r\nRadio;"Cable; ""long""\nsecond line";2\r\n').rows)
    .toEqual([{ Name: 'Radio', Beschreibung: 'Cable; "long"\nsecond line', Menge: '2' }]);
  for (const delimiter of [',', '\t', '|']) {
    expect(parseCsv(`Name${delimiter}Menge\nRadio${delimiter}2`).rows).toEqual([{ Name: 'Radio', Menge: '2' }]);
  }
  expect(parseCsv('  ')).toEqual({ headers: [], rows: [] });
  expect(parseInlineComponents('Benzingenerator 3,5 kW: 2; 3x Kabel')).toEqual([
    { name: 'Benzingenerator 3,5 kW', quantity: 2 }, { name: 'Kabel', quantity: 3 },
  ]);
});

test('combined CSV preview resolves new items before dependent assemblies and counts invalid rows', () => {
  const input = { csvContent: 'Typ;Name;Kategorie;Menge;Komponenten\nArtikel;Radio;Equipment;4;\nBaugruppe;Kit;;;Radio: 2\nBaugruppe;Broken;;;Unknown: 1',
    tabType: 'combined' as const, items: [], assemblies: [], storageLocations: [], updateExistingItems: false,
    reference: { eventTypes: ['DE'], factions: [] } };
  const plan = buildCsvImportPlan(input);
  expect(plan.parsedItems).toHaveLength(1);
  expect(plan.parsedAssemblies[0].status).toBe('valid');
  expect(plan.parsedAssemblies[0].data.itemQuantities).toEqual({ 'csv-new-1': 2 });
  expect(plan.parsedAssemblies[1].status).toBe('error');
  expect(plan.totalErrorsCount).toBe(1);
  expect(plan.totalToImport).toBe(2);
  expect(buildCsvImportPlan({ ...input, tabType: 'items' }).parsedAssemblies).toEqual([]);
  expect(buildCsvImportPlan({ ...input, csvContent: '' }).totalToImport).toBe(0);
});
