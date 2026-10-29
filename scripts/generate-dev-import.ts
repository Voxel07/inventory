/**
 * Regenerate the dev SQL snapshot through the existing CSV import rules.
 * Start a fresh local backend with the dev seed disabled, then run:
 * bun scripts/generate-dev-import.ts http://127.0.0.1:8081 <dev-postgres-container-id>
 * MCP handles supported catalog/order writes; other operations use the REST importer.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { User } from '../src/types';

const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:8081');
const container = process.argv[3];
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.pathname !== '/')
  throw new Error('Generate fixtures only against an isolated loopback development API.');
if (!container || !/^[a-f0-9]{12,64}$/.test(container))
  throw new Error('Supply the disposable Dev Services PostgreSQL container ID.');

async function docker(args: string[]) {
  const child = Bun.spawn(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [output, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw new Error(`docker ${args[0]} failed: ${error}`);
  return output;
}
const image = (await docker(['inspect', '--format', '{{.Config.Image}}', container])).trim();
if (!/^postgres:18(?:\.|-)/.test(image)) throw new Error(`Expected the disposable PostgreSQL 18 container, got ${image}.`);

// The importer is shared with the browser. These in-memory browser primitives are
// confined to this offline authoring tool; the running application is unchanged.
class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}
const browser = Object.assign(new EventTarget(), {
  __ENV__: { API_URL: origin.origin },
  location: origin,
});
Object.defineProperty(globalThis, 'window', { value: browser, configurable: true });
Object.defineProperty(globalThis, 'document', { value: { documentElement: { lang: 'en' } }, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: new MemoryStorage(), configurable: true });
const network = { onLine: false };
Object.defineProperty(globalThis, 'navigator', { value: network, configurable: true });
for (const key of ['VITE_API_URL', 'VITE_OIDC_AUTHORITY', 'VITE_OIDC_CLIENT_ID']) process.env[key] = '';

const transport = globalThis.fetch.bind(globalThis);
const loginResponse = await transport(`${origin.origin}/api/auth/dev-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@localhost' }),
});
if (!loginResponse.ok) throw new Error(`Development login failed: ${await loginResponse.text()}`);
const login = await loginResponse.json() as { token: string; user: User };
const headers = { Authorization: `Bearer ${login.token}`, 'X-Actor-Id': login.token.slice(4), 'X-Actor-Name': login.user.name,
  'X-Actor-Role': 'admin', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };

let requestId = 0;
let sessionId = '';
async function mcp(method: string, params: unknown, notification = false): Promise<Record<string, unknown>> {
  const response = await transport(`${origin.origin}/mcp`, { method: 'POST',
    headers: { ...headers, ...(sessionId ? { 'Mcp-Session-Id': sessionId, 'MCP-Protocol-Version': '2025-03-26' } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: ++requestId }), method, params }) });
  if (!response.ok) throw new Error(`MCP ${method}: ${response.status} ${await response.text()}`);
  sessionId = response.headers.get('Mcp-Session-Id') ?? sessionId;
  if (notification) return {};
  const raw = await response.text();
  const payload = JSON.parse(response.headers.get('Content-Type')?.includes('text/event-stream')
    ? raw.split('\n').find(line => line.startsWith('data:'))!.slice(5) : raw);
  if (payload.error) throw new Error(JSON.stringify(payload.error));
  return payload.result;
}
await mcp('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'dev-sql-authoring', version: '1' } });
await mcp('notifications/initialized', {}, true);
const discovery = await mcp('tools/list', {});
const available = new Set((discovery.tools as { name: string }[]).map(tool => tool.name));
async function tool(name: string, args: unknown) {
  if (!available.has(name)) throw new Error(`MCP tool not available: ${name}`);
  const result = await mcp('tools/call', { name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  if (result.isError) throw new Error(content.filter(part => part.type === 'text').map(part => part.text).join('\n'));
  // Quarkus represents a List return value as one MCP text block per element.
  if (name === 'save_items') return content.filter(part => part.type === 'text').map(part => JSON.parse(part.text));
  return result.structuredContent ?? JSON.parse(content.find(part => part.type === 'text')!.text);
}

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== origin.origin) throw new Error(`Unexpected authoring request origin: ${url.origin}`);
  if (url.pathname === '/api/events/stream') return new Response(null, { status: 204 });
  const method = options.method ?? 'GET';
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : undefined;
  let operation: { name: string; args: unknown } | undefined;
  if (method === 'POST') {
    const creates: Record<string, string> = { '/api/items/batch': 'save_items', '/api/assemblies': 'create_assembly',
      '/api/events': 'create_event', '/api/orders/faction': 'create_faction_order', '/api/orders/general': 'create_general_order' };
    if (creates[url.pathname]) operation = { name: creates[url.pathname], args: { input: body } };
    const order = /^\/api\/orders\/(?:faction|general)\/([^/]+)\/(prepare|return|transitions\/([^/]+))$/.exec(url.pathname);
    if (order) operation = { name: order[2] === 'prepare' ? 'prepare_order' : order[2] === 'return' ? 'return_order' : 'transition_order',
      args: { orderId: order[1], input: body, ...(order[3] ? { status: order[3] } : {}) } };
  }
  if (method === 'PATCH' && /^\/api\/events\/[^/]+$/.test(url.pathname))
    operation = { name: 'update_event', args: { eventId: url.pathname.split('/').at(-1), input: body } };
  if (operation) {
    try { return Response.json(await tool(operation.name, operation.args)); }
    catch (error) { return Response.json({ message: String(error) }, { status: 400 }); }
  }
  return transport(input, options);
};

const { initializeI18n } = await import('../src/i18n');
await initializeI18n();
const { setDevelopmentSession } = await import('../src/services/authManager');
setDevelopmentSession(login.token, login.user);
network.onLine = true;
const { apiRequest } = await import('../src/services/apiClient');
if ((await apiRequest<unknown[]>('/api/items', { query: { size: 1 } })).length)
  throw new Error('The authoring database must be empty. Restart with a fresh Dev Services container and seed loading disabled.');
const { buildCsvImportPlan } = await import('../src/utils/csv/importPlan');
const { runCsvImport } = await import('../src/services/csvImportService');
const { translate } = await import('../src/utils/naming');
const source = await Bun.file(resolve('sample_imports/sample_stock.csv')).text();
const plan = buildCsvImportPlan({ csvContent: source, tabType: 'combined', items: [], assemblies: [], storageLocations: [],
  updateExistingItems: false, autoCreateReferences: true,
  reference: { eventTypes: await apiRequest('/api/event-types'), factions: await apiRequest('/api/factions') } });
if (plan.totalErrorsCount) throw new Error(`Sample has ${plan.totalErrorsCount} invalid rows: ${JSON.stringify([
  ...plan.parsedItems, ...plan.parsedAssemblies, ...plan.parsedEvents, ...plan.parsedOrders, ...plan.parsedGeneralOrders,
  ...plan.parsedReturns, ...plan.parsedCheckouts, ...plan.parsedOperations,
].filter(row => row.status === 'error').map(row => ({ index: row.index, message: row.statusMessage })))}`);
let lastProgress = -10;
const result = await runCsvImport({ ...plan, storageLocations: [], autoCreateLocations: true, tabType: 'combined', items: [],
  updateExistingItems: false, t: translate, setImportedCounts: () => {}, setImportStatusText: () => {},
  setImportProgress: value => { if (value >= lastProgress + 10) { console.log(`Import ${Math.round(value)}%`); lastProgress = value; } } });
await Bun.write(resolve('backend/target/dev-import-result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, errors: result.errors.slice(0, 10), errorCount: result.errors.length }));
if (result.errors.length) throw new Error('Import must finish without errors before exporting a seed.');

const dump = await docker(['exec', container, 'pg_dump', '-U', 'quarkus', '-d', 'inventory', '--data-only', '--column-inserts',
  '--no-owner', '--no-privileges', '--exclude-table=public.flyway_schema_history', '--exclude-table=public.source_revisions',
  '--exclude-table=public.stock_history_pending', '--exclude-table=public.operational_reports', '--exclude-table=public.report_rebuild_jobs']);
const inserts = dump.split('\n').filter(line => !line.startsWith('\\') && !line.startsWith('SET ')
  && !line.startsWith('SELECT pg_catalog.set_config')).join('\n').replace(/^SELECT pg_catalog\.setval/gm, 'PERFORM pg_catalog.setval');
const target = resolve('backend/src/main/resources/db/dev/afterMigrate__import.sql');
const sql = `-- Development-only sample data. Generated by scripts/generate-dev-import.ts.\n`
  + `-- Source: sample_imports/sample_stock.csv; SHA-256 ${createHash('sha256').update(source).digest('hex')}\n`
  + `-- Import counts: ${JSON.stringify(result)}\n`
  + `-- Skip populated databases and live reloads. Flyway executes this callback transactionally.\n`
  + `DO $dev_seed$\nBEGIN\n`
  + `IF EXISTS (SELECT 1 FROM public.app_users) OR EXISTS (SELECT 1 FROM public.items) THEN RETURN; END IF;\n`
  + `-- The fresh baseline contains only faction reference rows; their snapshot IDs must match the fixture references.\n`
  + `DELETE FROM public.factions;\n${inserts}\n`
  + `-- The dump already includes stock history. Discard the pending trigger work from restoring it.\n`
  + `DELETE FROM public.stock_history_pending;\nEND\n$dev_seed$;\n`;
await Bun.write(target, sql);
console.log(`Wrote ${target} (${sql.length} characters).`);
process.exit(0);
