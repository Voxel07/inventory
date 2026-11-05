/** Local end-to-end CSV regression: preview and execute the full sample twice on a disposable API. */
import { buildCsvImportPlan } from '../src/utils/csv/importPlan';
import type { Item, Assembly, StorageLocation, EventType, Faction } from '../src/types';

const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:18080');
if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname) || origin.pathname !== '/')
  throw new Error('Use an isolated loopback API with development login and a disposable database.');
const source = await Bun.file('sample_imports/sample_stock.csv').text();
const headers = { 'Content-Type': 'application/json', 'X-Actor-Id': 'csv-sample-regression', 'X-Actor-Role': 'admin' };
async function request<T>(path: string, body?: unknown): Promise<{ data: T; more: boolean }> {
  const response = await fetch(new URL(path, origin), { headers,
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${await response.text()}`);
  return { data: await response.json() as T, more: response.headers.get('X-Has-More') === 'true' };
}
async function all<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 1000; page++) {
    const result = await request<T[]>(`${path}?page=${page}&size=100`);
    rows.push(...result.data);
    if (!result.more) return rows;
  }
  throw new Error(`Pagination did not finish: ${path}`);
}
async function catalog() {
  const [items, assemblies, storageLocations, eventTypes, factions] = await Promise.all([
    all<Item>('/api/items'), all<Assembly>('/api/assemblies'), all<StorageLocation>('/api/storage-locations'),
    all<EventType>('/api/event-types'), all<Faction>('/api/factions'),
  ]);
  return { items, assemblies, storageLocations, reference: { eventTypes, factions } };
}
interface Job {
  id: string; status: string; progress: number;
  result: { errors: string[]; successEvents: number; successOrders: number; successGeneralOrders: number };
}
let before = await catalog();
if (before.items.length || before.assemblies.length || before.storageLocations.length)
  throw new Error('Start with an empty disposable catalog; this test imports the entire sample twice.');
for (const pass of [1, 2]) {
  const preview = buildCsvImportPlan({ csvContent: source, tabType: 'combined', ...before,
    updateExistingItems: false, autoCreateReferences: true });
  const bad = [...preview.parsedItems, ...preview.parsedAssemblies, ...preview.parsedEvents, ...preview.parsedOrders,
    ...preview.parsedGeneralOrders, ...preview.parsedReturns, ...preview.parsedCheckouts, ...preview.parsedOperations]
    .filter(row => row.status === 'error');
  if (bad.length) throw new Error(`Pass ${pass} preview errors: ${JSON.stringify(bad.map(r => [r.index, r.statusMessage]))}`);
  const plan = JSON.parse(JSON.stringify({ ...preview, tabType: 'combined', autoCreateLocations: true,
    updateExistingItems: false }, (key, value) => key === 'rawRow' ? undefined : value));
  let job = (await request<Job>('/api/csv-imports', { commandId: crypto.randomUUID(), filename: 'sample_stock.csv',
    timezone: 'Europe/Berlin', plan })).data;
  const deadline = Date.now() + 15 * 60_000;
  let progress = -1;
  while (['queued', 'running'].includes(job.status)) {
    if (Date.now() > deadline) throw new Error(`Pass ${pass} timed out: ${JSON.stringify(job)}`);
    if (Math.floor(job.progress / 10) > progress) {
      progress = Math.floor(job.progress / 10);
      console.log(`Pass ${pass}: ${job.progress}%, ${job.result.errors.length} errors`);
    }
    await Bun.sleep(1000);
    job = (await request<Job>('/api/csv-imports/' + job.id)).data;
  }
  await Bun.write(`backend/target/csv-sample-pass-${pass}.json`, JSON.stringify(job, null, 2));
  if (job.status !== 'completed' || job.result.errors.length)
    throw new Error(`Pass ${pass} failed: ${JSON.stringify(job.result)}`);
  if (job.result.successEvents !== preview.validEventsCount || job.result.successOrders !== preview.validOrdersCount
      || job.result.successGeneralOrders !== preview.validGeneralOrdersCount)
    throw new Error(`Pass ${pass}: incomplete event/order execution: ${JSON.stringify(job.result)}`);
  const after = await catalog();
  if (pass === 2 && (after.items.length !== before.items.length || after.assemblies.length !== before.assemblies.length
      || after.storageLocations.length !== before.storageLocations.length))
    throw new Error('Re-import created duplicate catalog entries.');
  before = after;
  console.log(`Pass ${pass} passed: ${JSON.stringify(job.result)}`);
}
console.log('Full sample CSV passed twice: fresh catalog and populated-catalog preview/execution.');
