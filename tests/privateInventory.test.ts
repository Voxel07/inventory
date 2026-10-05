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

test('revocation events remove cached private snapshots and refetch public data in place', async () => {
  const client = new QueryClient();
  client.setQueryData(['items'], [{ id: 'previously-shared', access: { privateResource: true } }]);
  client.setQueryData(['reports'], { total: 1 });
  invalidateForApiChange(client, { type: 'access.changed' });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(client.getQueryData(['items'])).toBeUndefined();
  expect(client.getQueryData(['reports'])).toEqual({ total: 1 });
  expect(client.getQueryState(['reports'])?.isInvalidated).toBe(true);
  client.clear();
});

test('a reconnect inside a batch is treated as a possible revocation', async () => {
  const client = new QueryClient();
  client.setQueryData(['items'], [{ id: 'shared', privateResource: true }]);
  invalidateForApiChange(client, { type: 'batch', changes: [{ type: 'stock.changed' }, { type: 'realtime.reconnected' }] });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(client.getQueryData(['items'])).toBeUndefined();
  client.clear();
});
