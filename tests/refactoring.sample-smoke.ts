// Run explicitly: bun run tests/refactoring.sample-smoke.ts http://127.0.0.1:18085
// Writes sample data only to the loopback development API and its disposable database.
import { parseCsv } from '../src/utils/csv/core';
import { parseItemsFromCsv } from '../src/utils/csv/items';
import { parseAssembliesFromCsv } from '../src/utils/csv/assemblies';
import { buildStockHistory } from '../src/utils/stockHistory';
import type { Item, StorageLocation, StockTransaction } from '../src/types';
import assert from 'node:assert/strict';

const origin = process.argv[2] ?? 'http://127.0.0.1:18085';
assert.equal(new URL(origin).hostname, '127.0.0.1', 'Use only an isolated loopback API');
const actor = { 'X-Actor-Id': 'refactoring-sample-test', 'X-Actor-Name': 'Sample regression tester', 'X-Actor-Role': 'hq_admin' };
async function api(path: string, body?: unknown, expected = body ? 201 : 200) {
  const response = await fetch(`${origin}/api${path}`, { method: body ? 'POST' : 'GET', headers: { ...actor, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(payload)}`);
  return payload;
}
let rpcId = 0;
let sessionId = '';
async function mcp(method: string, params: unknown, notification = false) {
  const response = await fetch(`${origin}/mcp`, { method: 'POST', headers: { ...actor, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', ...(sessionId ? { 'Mcp-Session-Id': sessionId, 'MCP-Protocol-Version': '2025-03-26' } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: ++rpcId }), method, params }) });
  assert.ok(response.ok, `${method}: ${response.status} ${await (response.ok ? Promise.resolve('') : response.text())}`);
  sessionId = response.headers.get('Mcp-Session-Id') ?? sessionId;
  if (notification) return;
  const raw = await response.text();
  const data = response.headers.get('Content-Type')?.includes('text/event-stream') ? JSON.parse(raw.split('\n').find(line => line.startsWith('data:'))!.slice(5)) : JSON.parse(raw);
  assert.ok(!data.error, JSON.stringify(data.error));
  return data.result;
}
async function tool(name: string, args: unknown) {
  const result = await mcp('tools/call', { name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent ?? JSON.parse(result.content.find((part: { type: string }) => part.type === 'text').text);
}
await mcp('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'refactoring-sample-smoke', version: '1' } });
await mcp('notifications/initialized', {}, true);
const discovery = await mcp('tools/list', {});
assert.ok(discovery.tools.some((entry: { name: string }) => entry.name === 'create_item'));
const { rows } = parseCsv(await Bun.file('sample_imports/sample_stock.csv').text());
const locations: StorageLocation[] = await api('/storage-locations');
for (const name of new Set(rows.filter(row => row.Typ === 'Artikel').map(row => row.Lagerort).filter(Boolean))) {
  if (!locations.some(location => location.name === name)) locations.push(await api('/storage-locations', { name, locationType: 'warehouse', active: true }, 200));
}
async function allItems(): Promise<Item[]> {
  const catalog: Item[] = [];
  for (let page = 0; ; page++) {
    const batch: Item[] = await api(`/items?page=${page}&size=100`);
    catalog.push(...batch);
    if (batch.length < 100) return catalog;
  }
}
let items = await allItems();
const reference = { eventTypes: await api('/event-types'), factions: await api('/factions') };
const parsed = parseItemsFromCsv(rows, locations, items, reference);
for (const row of parsed) {
  if (row.isExisting) continue;
  assert.notEqual(row.status, 'error', row.statusMessage);
  const { isConsumable, ...input } = row.data;
  const item = await tool('create_item', { input: { ...input, consumable: isConsumable, storageLocation: row.storageLocationId || undefined } });
  items.push(item);
}
// Read through REST again to verify the MCP writes use the same stock projections.
items = await allItems();
const existingAssemblies = await api('/assemblies');
const parsedAssemblies = parseAssembliesFromCsv(rows, items, existingAssemblies, reference);
for (const row of parsedAssemblies) {
  if (row.status === 'duplicate') continue;
  assert.equal(row.status, 'valid', row.statusMessage);
  await tool('create_assembly', { input: row.data });
}
const target = items.find(item => item.name === 'Handfunkgerät-Ladestation')!;
assert.ok(target);
const before = await tool('get_item_details', { itemId: target.id });
const priorTransactions: StockTransaction[] = await api(`/transactions?itemId=${target.id}`);
const vendor = await api('/vendors', { name: `Sample vendor ${crypto.randomUUID()}` });
const purchase = await api('/purchase-orders', { vendorId: vendor.id, lines: [{ itemId: target.id, orderedQuantity: 5, unitPriceCents: 2000 }] });
await api(`/purchase-orders/${purchase.id}/transitions`, { status: 'ordered' }, 200);
const receipt = { purchaseOrderId: purchase.id, receivingLocationId: target.storageLocation, idempotencyKey: crypto.randomUUID(), lines: [{ purchaseOrderLineId: purchase.lines[0].id, acceptedQuantity: 5, damagedQuantity: 0, rejectedQuantity: 0 }] };
await api('/goods-receipts', receipt);
await api('/goods-receipts', receipt); // retry must not double-add stock or history
const received = await tool('get_item_details', { itemId: target.id });
assert.equal(received.stock.onHand, before.stock.onHand + 5);
const transactions: StockTransaction[] = await api(`/transactions?itemId=${target.id}`);
assert.equal(transactions.filter(entry => entry.transactionType === 'received' && entry.quantityChanged === 5).length, priorTransactions.filter(entry => entry.transactionType === 'received' && entry.quantityChanged === 5).length + 1);
assert.equal(buildStockHistory(transactions, received.stock.onHand).at(-1)!.stock, received.stock.onHand);
const destination = await api('/storage-locations', { name: `Sample transfer shelf ${crypto.randomUUID()}`, locationType: 'warehouse', active: true }, 200);
const transferInput = { sourceLocationId: target.storageLocation, destinationLocationId: destination.id, idempotencyKey: crypto.randomUUID(), lines: [{ itemId: target.id, quantity: received.stock.onHand + 1 }] };
await api('/transfers', transferInput, 409);
const transfer = await api('/transfers', { ...transferInput, idempotencyKey: crypto.randomUUID(), lines: [{ itemId: target.id, quantity: 2 }] });
await api(`/transfers/${transfer.id}/dispatch`, { idempotencyKey: crypto.randomUUID() }, 200);
await api(`/transfers/${transfer.id}/receive`, { idempotencyKey: crypto.randomUUID(), lines: [{ transferLineId: transfer.lines[0].id, receivedQuantity: 2, discrepancyQuantity: 0 }] }, 200);
const positions = await api(`/inventory-positions?itemId=${target.id}`);
assert.equal(positions.find((entry: { locationId: string }) => entry.locationId === destination.id).transferableQuantity, 2);
const count = await api('/inventory-counts', { itemId: target.id, blindCount: false });
assert.equal(count.status, 'counting');
assert.ok(count.lines.length >= 2);
const first = count.lines[0];
await api(`/inventory-counts/${count.id}/submit`, { lines: [{ lineId: first.id, quantity: first.expectedQuantity }] }, 200);
const resumed = (await api('/inventory-counts')).find((entry: { id: string }) => entry.id === count.id);
assert.equal(resumed.status, 'counting');
assert.equal(resumed.lines.find((entry: { id: string }) => entry.id === first.id).countedQuantity, first.expectedQuantity);
assert.ok(resumed.lines.some((entry: { countedQuantity: number | null }) => entry.countedQuantity == null));
await api(`/inventory-counts/${count.id}/submit`, { lines: count.lines.slice(1).map((line: { id: string; expectedQuantity: number }) => ({ lineId: line.id, quantity: line.expectedQuantity })) }, 200);
await api(`/inventory-counts/${count.id}/approve`, {}, 200);
await api(`/inventory-counts/${count.id}/post`, {}, 200);
const after = await tool('get_item_details', { itemId: target.id });
assert.equal(after.stock.onHand, received.stock.onHand);
const lotItem = items.find(item => item.name === 'Sample receipt with new lot') ?? await tool('create_item', { input: { name: 'Sample receipt with new lot', category: 'Sample regressions', trackingMode: 'lot_tracked', amount: 0, storageLocation: target.storageLocation } });
const lotOrderNumber = `PO-SAMPLE-LOT-${crypto.randomUUID().slice(0, 8)}`;
const lotOrder = await api('/purchase-orders', { orderNumber: lotOrderNumber, vendorId: vendor.id, lines: [{ itemId: lotItem.id, orderedQuantity: 4, unitPriceCents: 100 }] });
await api(`/purchase-orders/${lotOrder.id}/transitions`, { status: 'ordered' }, 200);
const lotBefore = await tool('get_item_details', { itemId: lotItem.id });
const lot = await api('/inventory-lots', { itemId: lotItem.id, lotNumber: `SAMPLE-${crypto.randomUUID().slice(0, 8)}`, status: 'available' });
const lotReceipt = { purchaseOrderId: lotOrder.id, receivingLocationId: target.storageLocation, idempotencyKey: crypto.randomUUID(),
  lines: [{ purchaseOrderLineId: lotOrder.lines[0].id, lotId: lot.id, acceptedQuantity: 4, damagedQuantity: 0, rejectedQuantity: 0 }] };
await api('/goods-receipts', lotReceipt);
await api('/goods-receipts', lotReceipt);
const lotAfter = await tool('get_item_details', { itemId: lotItem.id });
assert.equal(lotAfter.stock.onHand, lotBefore.stock.onHand + 4);
console.log(JSON.stringify({ mcpTools: discovery.tools.length, sampleItems: parsed.length, sampleAssemblies: parsedAssemblies.length, receiptAdded: 5,
  lotReceiptAdded: 4, transferred: 2, countResumedAndPosted: true, itemId: target.id, locationId: target.storageLocation }, null, 2));
