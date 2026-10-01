import { beforeEach, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { clearPrivateResourceIds, containsPrivateInventory, markPrivateInventoryResponse, referencesPrivateInventory } from '../src/services/privateInventoryCache';
import { invalidateForApiChange } from '../src/utils/realtimeInvalidation';

beforeEach(clearPrivateResourceIds);

test('mixed catalog responses protect private commands while public locations remain usable offline', () => {
  const rows = [{ id: 'private-item', access: { privateResource: true }, expand: { storageLocation: { id: 'public-location', access: { privateResource: false } } } },
    { id: 'public-item', access: { privateResource: false } }];
  markPrivateInventoryResponse(rows);
  expect(containsPrivateInventory(rows)).toBe(true);
  expect(referencesPrivateInventory({ itemId: 'private-item' })).toBe(true);
  expect(referencesPrivateInventory({ requestedQuantities: { 'private-item': 2 } })).toBe(true);
  expect(referencesPrivateInventory('/api/items/private-item/assets')).toBe(true);
  expect(referencesPrivateInventory({ itemId: 'public-item', locationId: 'public-location' })).toBe(false);
});

test('operational projections inherit protection and resetting the account clears known IDs', () => {
  const projection = [{ id: 'private-transaction', details: { id: 'private-asset' } }];
  markPrivateInventoryResponse(projection);
  expect(referencesPrivateInventory({ assetInstanceId: 'private-asset' })).toBe(true);
  clearPrivateResourceIds();
  expect(referencesPrivateInventory({ assetInstanceId: 'private-asset' })).toBe(false);
  expect(containsPrivateInventory(projection)).toBe(true);
});

test('revocation events remove cached snapshots instead of leaving stale private data visible', async () => {
  const client = new QueryClient();
  client.setQueryData(['items'], [{ id: 'previously-shared' }]);
  client.setQueryData(['reports'], { total: 1 });
  invalidateForApiChange(client, { type: 'access.invalidated' });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(client.getQueryData(['items'])).toBeUndefined();
  expect(client.getQueryData(['reports'])).toBeUndefined();
  client.clear();
});
