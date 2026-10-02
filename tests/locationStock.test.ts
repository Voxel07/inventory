import { expect, test } from 'bun:test';
import type { AssetInstance, Item } from '../src/types';
import type { Position } from '../src/types/operations';
import { getLocationInventory } from '../src/utils/locationStock';

const item = (id: string, trackingMode: Item['trackingMode'] = 'bulk') => ({ id, trackingMode, storageLocation: 'a', amount: 999 } as Item);
const position = (itemId: string, locationId: string, quantity: number, available = quantity, damaged = 0) =>
  ({ itemId, locationId, quantityOnHand: quantity, availableQuantity: available, quantityDamaged: damaged } as Position);
const asset = (itemId: string, overrides: Partial<AssetInstance> = {}) =>
  ({ itemId, currentLocationId: 'a', active: true, conditionStatus: 'good', availabilityStatus: 'available', ...overrides } as AssetInstance);

test('location stock aggregates lots once per item, uses local availability and ignores home location and empty positions', () => {
  const catalog = [item('bulk'), item('lot', 'lot_tracked'), item('empty'), item('elsewhere'), item('home-only')];
  const before = JSON.stringify(catalog);
  const positions = [position('bulk', 'a', 4, 2, 1), position('bulk', 'b', 100), position('lot', 'a', 3),
    position('lot', 'a', 2, 0, 2), position('empty', 'a', 0), position('elsewhere', 'b', 10)];
  const inventory = getLocationInventory(catalog, positions, [], 'a');
  expect(inventory.items.map(row => row.id)).toEqual(['bulk', 'lot']);
  expect(inventory.stockByItemId.get('bulk')).toEqual({ totalStock: 4, remaining: 2, damaged: 1, checkedOut: 0, inTransit: 0 });
  expect(inventory.stockByItemId.get('lot')).toEqual({ totalStock: 5, remaining: 3, damaged: 2, checkedOut: 0, inTransit: 0 });
  expect(JSON.stringify(catalog)).toBe(before);
  expect(getLocationInventory(catalog, positions, [], 'b').stockByItemId.get('bulk')?.totalStock).toBe(100);
  expect(getLocationInventory(catalog, positions, [], null).items).toEqual([]);
});

test('serialized location stock counts reserved and damaged devices, excludes custody, inactive, transit and unconfirmed returns', () => {
  const catalog = [item('camera', 'serialized'), item('ghost', 'serialized')];
  const assets = [asset('camera'), asset('camera', { availabilityStatus: 'reserved' }),
    asset('camera', { conditionStatus: 'unsafe' }), asset('camera', { availabilityStatus: 'damaged' }),
    asset('camera', { currentLocationId: 'b' }), asset('camera', { active: false }),
    asset('camera', { conditionStatus: 'lost' }), asset('camera', { currentLocationId: undefined }),
    ...(['in_custody', 'in_field', 'returned_pending_check', 'in_transit', 'lost', 'written_off'] as const)
      .map(availabilityStatus => asset('ghost', { availabilityStatus }))];
  const inventory = getLocationInventory(catalog, [position('camera', 'a', 500)], assets, 'a');
  expect(inventory.items.map(row => row.id)).toEqual(['camera']);
  expect(inventory.stockByItemId.get('camera')).toEqual({ totalStock: 4, remaining: 1, damaged: 2, checkedOut: 0, inTransit: 0 });
  expect(getLocationInventory(catalog, [], assets, 'b').stockByItemId.get('camera')?.totalStock).toBe(1);
});
