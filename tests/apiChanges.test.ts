import { expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { decodeServerChange, localWriteChange } from '../src/services/apiChanges';
import { createApiChangeCoalescer, invalidateForApiChange } from '../src/utils/realtimeInvalidation';

test('role changes discard cached organization data, including inactive event queries', async () => {
  const client = new QueryClient();
  const keys = [['event-reports'], ['event-logistics', 'event-a', 'attendees'], ['items'], ['users']];
  keys.forEach(key => client.setQueryData(key, [{ sensitive: 'organization data' }]));
  invalidateForApiChange(client, localWriteChange('/api/users/user-a'));
  await new Promise(resolve => setTimeout(resolve, 0));
  keys.forEach(key => expect(client.getQueryData(key)).toBeUndefined());
  client.clear();
});

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


test('attendee and timeline writes refresh event logistics of every event and the people registry only', () => {
  const client = new QueryClient();
  const keys = [['event-logistics', 'event-a', 'attendees'], ['event-logistics', 'event-b', 'attendees'], ['event-logistics', 'people'],
    ['event-reports', undefined], ['items']];
  keys.forEach(key => client.setQueryData(key, []));
  const change = localWriteChange('/api/events/event-a/attendees/attendee-1');
  expect(change.type).toBe('event_logistics.changed');
  invalidateForApiChange(client, change);
  // A rename of a shared person shows at other events, so all logistics readers refresh.
  keys.slice(0, 3).forEach(key => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
  expect(client.getQueryState(['event-reports', undefined])?.isInvalidated).toBe(false);
  expect(client.getQueryState(['items'])?.isInvalidated).toBe(false);
  expect(localWriteChange('/api/events/event-a/timeline').type).toBe('event_logistics.changed');
  client.clear();
});

test('server logistics events and event deletion both refresh logistics readers', () => {
  const client = new QueryClient();
  client.setQueryData(['event-logistics', 'event-a', 'timeline'], []);
  invalidateForApiChange(client, { type: 'event_logistics.changed' });
  expect(client.getQueryState(['event-logistics', 'event-a', 'timeline'])?.isInvalidated).toBe(true);

  client.setQueryData(['event-logistics', 'event-a', 'timeline'], []);
  invalidateForApiChange(client, localWriteChange('/api/events/event-a'));
  expect(client.getQueryState(['event-logistics', 'event-a', 'timeline'])?.isInvalidated).toBe(true);
  client.clear();
});

test('realtime payloads are decoded to string fields and always count as server changes', () => {
  expect(decodeServerChange({ type: 'order.changed', id: 'o1', itemId: 42, source: 'local', extra: 'x' }))
    .toEqual({ type: 'order.changed', id: 'o1', source: 'server' });
  expect(decodeServerChange('ping')).toEqual({ type: 'ping', source: 'server' });
  expect(decodeServerChange([1])).toEqual({ type: '1', source: 'server' });
  const nested = decodeServerChange({ type: 'batch', changes: [{ type: 'a', changes: [{ type: 'b', changes: [{ type: 'c', changes: [{ type: 'd' }] }] }] }] });
  expect(nested.changes?.[0]?.changes?.[0]).toEqual({ type: 'b', source: 'server' });
});

test('runtime bookings and item responsibility changes refresh their readers only', () => {
  const client = new QueryClient();
  const keys = [['items', 'item-a', 'assets', 'asset-a', 'runtime'], ['maintenance'], ['item-responsibility', 'item-a'],
    ['order-pickup-groups', 'order-a'], ['operations', 'vendors'], ['transactions']];
  keys.forEach(key => client.setQueryData(key, []));
  invalidateForApiChange(client, { type: 'runtime.changed' });
  expect(client.getQueryState(['items', 'item-a', 'assets', 'asset-a', 'runtime'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['maintenance'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['item-responsibility', 'item-a'])?.isInvalidated).toBe(false);
  expect(client.getQueryState(['operations', 'vendors'])?.isInvalidated).toBe(false);
  expect(client.getQueryState(['transactions'])?.isInvalidated).toBe(false);
  invalidateForApiChange(client, { type: 'item.changed' });
  expect(client.getQueryState(['item-responsibility', 'item-a'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['order-pickup-groups', 'order-a'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['operations', 'vendors'])?.isInvalidated).toBe(false);
  client.clear();
});
