import { expect, test } from 'bun:test';
import { parseItemsFromCsv } from '../src/utils/csv/items';
import { fixtureItem, fixtureLocation } from './fixtures/dto';
import { createItemLookup } from '../src/utils/csv/reference';

const locations = [fixtureLocation({ id: 'a', name: 'Shelf A' }), fixtureLocation({ id: 'b', name: 'Shelf B' })];
const items = [fixtureItem({ id: 'one', sku: 'SKU-ONE', name: 'Cable', storageLocation: 'a' }), fixtureItem({ id: 'two', sku: 'SKU-TWO', name: 'Cable', storageLocation: 'b' })];
const reference = { eventTypes: [], factions: [] };

test('same-name CSV items require a deliberate identity or unambiguous location', () => {
  expect(parseItemsFromCsv([{ Name: 'Cable' }], locations, items, reference)[0].status).toBe('error');
  expect(parseItemsFromCsv([{ Name: 'Cable', Lagerort: 'Shelf A' }], locations, items, reference)[0].existingId).toBe('one');
  expect(parseItemsFromCsv([{ Name: 'Cable', SKU: 'SKU-TWO' }], locations, items, reference)[0].existingId).toBe('two');
  expect(parseItemsFromCsv([{ Name: 'Cable', ItemId: 'one' }], locations, items, reference)[0].existingId).toBe('one');
  expect(parseItemsFromCsv([{ Name: 'Cable', ItemId: 'missing' }], locations, items, reference)[0].status).toBe('error');
});

test('references keep both same-name items and resolve stable aliases', () => {
  const lookup = createItemLookup(items);
  expect(lookup.get('cable')).toBeUndefined();
  expect(lookup.get('sku-one')?.id).toBe('one');
  expect(lookup.get('two')?.id).toBe('two');
});

test('CSV percentage metadata preserves integer-step quantities and existing measure', () => {
  const row = parseItemsFromCsv([{ Name: 'Diesel', Verbrauchsmaterial: 'Ja', Bestand: '250', Unit: 'L', QuantityDecimals: '2', UnitCapacity: '10' }], locations, [], reference)[0];
  expect(row.status).toBe('valid');
  expect(row.data).toMatchObject({ amount: 250, quantityDecimals: 2, unitCapacity: 10, unit: 'L' });
  const existing = fixtureItem({ id: 'fuel', name: 'Diesel', inventoryRole: 'consumable', unit: 'L', unitCapacity: 10, quantityDecimals: 2 });
  expect(parseItemsFromCsv([{ Name: 'Diesel' }], locations, [existing], reference)[0].data).toMatchObject({ inventoryRole: 'consumable', quantityDecimals: 2, unitCapacity: 10, unit: 'L' });
  expect(parseItemsFromCsv([{ Name: 'Fraction', Bestand: '1.5' }], locations, [], reference)[0].status).toBe('error');
});
