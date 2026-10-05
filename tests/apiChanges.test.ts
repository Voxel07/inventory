import { expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { localWriteChange } from '../src/services/apiChanges';
import { createApiChangeCoalescer, invalidateForApiChange } from '../src/utils/realtimeInvalidation';

test('a reminder write invalidates inbox queries without refetching stock or reports', () => {
  const client = new QueryClient();
  for (const key of [['action-inbox'], ['items'], ['reports', 'events'], ['operations', 'assets:item']]) {
    client.setQueryData(key, []);
  }
  invalidateForApiChange(client, localWriteChange('/api/action-inbox/reminders'));
  expect(client.getQueryState(['action-inbox'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['items'])?.isInvalidated).toBe(false);
  expect(client.getQueryState(['reports', 'events'])?.isInvalidated).toBe(false);
  expect(client.getQueryState(['operations', 'assets:item'])?.isInvalidated).toBe(false);
  client.clear();
});

test('a mixed batch invalidates the union once, including operation subdomains', () => {
  const client = new QueryClient();
  const keys = [['operations', 'assets:item'], ['operations', 'documents:vendor'], ['operations', 'vendors'], ['items']];
  keys.forEach(key => client.setQueryData(key, []));
  let calls = 0;
  const invalidate = client.invalidateQueries.bind(client);
  client.invalidateQueries = (...args: Parameters<typeof invalidate>) => { calls++; return invalidate(...args); };
  invalidateForApiChange(client, { type: 'batch', changes: [
    localWriteChange('/api/transactions'), localWriteChange('/api/vendor-documents'),
  ] });
  expect(calls).toBe(1);
  expect(client.getQueryState(keys[0])?.isInvalidated).toBe(true);
  expect(client.getQueryState(keys[1])?.isInvalidated).toBe(true);
  expect(client.getQueryState(keys[2])?.isInvalidated).toBe(false);
  expect(client.getQueryState(keys[3])?.isInvalidated).toBe(true);
  client.clear();
});

test('an unknown event within a batch conservatively invalidates every reader', () => {
  const client = new QueryClient();
  client.setQueryData(['operations', 'vendors'], []);
  invalidateForApiChange(client, { type: 'batch', changes: [{ type: 'reminder.changed' }, { type: 'future.event' }] });
  expect(client.getQueryState(['operations', 'vendors'])?.isInvalidated).toBe(true);
  client.clear();
});

test('server events carry only the family and map to the same domains as local writes', () => {
  const client = new QueryClient();
  for (const key of [['items'], ['operations', 'vendors'], ['action-inbox']]) client.setQueryData(key, []);
  invalidateForApiChange(client, { type: 'vendor.changed' });
  expect(client.getQueryState(['operations', 'vendors'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['items'])?.isInvalidated).toBe(false);
  client.clear();
});

test('bursts of changes are coalesced into one invalidation', async () => {
  const client = new QueryClient();
  client.setQueryData(['items'], []);
  let calls = 0;
  const invalidate = client.invalidateQueries.bind(client);
  client.invalidateQueries = (...args: Parameters<typeof invalidate>) => { calls++; return invalidate(...args); };
  const coalescer = createApiChangeCoalescer(client, 5);
  coalescer.push({ type: 'stock.changed' });
  coalescer.push({ type: 'order.changed' });
  coalescer.push({ type: 'catalog.changed', resource: 'items' });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(calls).toBe(1);
  expect(client.getQueryState(['items'])?.isInvalidated).toBe(true);
  coalescer.dispose();
  client.clear();
});

