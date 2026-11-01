// Production stress test for the single-VPS deployment. Read-only by default.
// Usage and safety notes: tests/load/README.md
//
//   docker run --rm -i --network host -v "$PWD/tests/load:/load" \
//     -e API_URL=https://api.example.org -e APP_URL=https://inventory.example.org \
//     -e TOKENS="$TOKENS" -e PROFILE=stress grafana/k6:1.3.0 run /load/stress.k6.js
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import exec from 'k6/execution';
import encoding from 'k6/encoding';
import { Counter, Rate, Trend } from 'k6/metrics';

const API = (__ENV.API_URL || '').replace(/\/$/, '');
const APP = (__ENV.APP_URL || '').replace(/\/$/, '');
const PROFILE = __ENV.PROFILE || 'smoke';
const WRITE = __ENV.WRITE === '1';
const SSE = Number(__ENV.SSE || 0);
const MEDIA_KB = Number(__ENV.MEDIA_KB || 300);
const THINK = Number(__ENV.THINK_SECONDS || 2);
const SUMMARY_SHARE = Number(__ENV.SUMMARY_SHARE ?? 0.2); // share of warehouse iterations that open the team overview
if (!API.startsWith('http')) fail('Set API_URL to the API origin, e.g. https://api.example.org');

const rateLimited = new Counter('rate_limited');
const serverErrors = new Counter('server_errors');
const apiFailed = new Rate('api_failed');
const mediaDownloadBytes = new Trend('media_download_bytes');

// Ramps double the load in steps so the knee of the latency curve is visible per stage.
const PROFILES = {
  smoke: { browse: [{ duration: '5s', target: 2 }, { duration: '1m', target: 2 }], warehouse: [{ duration: '5s', target: 1 }, { duration: '1m', target: 1 }] },
  load: {
    browse: [{ duration: '2m', target: 20 }, { duration: '10m', target: 20 }, { duration: '1m', target: 0 }],
    warehouse: [{ duration: '2m', target: 5 }, { duration: '10m', target: 5 }, { duration: '1m', target: 0 }],
  },
  stress: {
    browse: [10, 25, 50, 100, 150, 200].flatMap(t => [{ duration: '1m', target: t }, { duration: '3m', target: t }]).concat([{ duration: '1m', target: 0 }]),
    warehouse: [3, 6, 12, 25, 35, 50].flatMap(t => [{ duration: '1m', target: t }, { duration: '3m', target: t }]).concat([{ duration: '1m', target: 0 }]),
  },
  spike: {
    browse: [{ duration: '1m', target: 10 }, { duration: '20s', target: 200 }, { duration: '3m', target: 200 }, { duration: '20s', target: 10 }, { duration: '3m', target: 10 }],
    warehouse: [{ duration: '1m', target: 3 }, { duration: '20s', target: 40 }, { duration: '3m', target: 40 }, { duration: '20s', target: 3 }, { duration: '3m', target: 3 }],
  },
  soak: {
    browse: [{ duration: '5m', target: 30 }, { duration: '2h', target: 30 }, { duration: '2m', target: 0 }],
    warehouse: [{ duration: '5m', target: 8 }, { duration: '2h', target: 8 }, { duration: '2m', target: 0 }],
  },
};
// steady: hold VUS browse users (plus a quarter as warehouse users) for DURATION, e.g. to profile the database.
const VUS = Number(__ENV.VUS || 50), DURATION = __ENV.DURATION || '5m';
PROFILES.steady = {
  browse: [{ duration: '30s', target: VUS }, { duration: DURATION, target: VUS }],
  warehouse: [{ duration: '30s', target: Math.max(1, Math.round(VUS / 4)) }, { duration: DURATION, target: Math.max(1, Math.round(VUS / 4)) }],
};
const stages = PROFILES[PROFILE] || fail(`Unknown PROFILE ${PROFILE}; use ${Object.keys(PROFILES).join(', ')}`);
const total = s => s.reduce((sum, stage) => sum + (stage.duration.endsWith('h') ? 3600 : stage.duration.endsWith('m') ? 60 : 1) * parseInt(stage.duration), 0);

const scenarios = {
  browse: { executor: 'ramping-vus', exec: 'browse', startVUs: 0, stages: stages.browse, gracefulRampDown: '30s' },
  warehouse: { executor: 'ramping-vus', exec: 'warehouse', startVUs: 0, stages: stages.warehouse, gracefulRampDown: '30s' },
};
if (SSE > 0) scenarios.streams = { executor: 'constant-vus', exec: 'stream', vus: SSE, duration: `${total(stages.browse)}s` };
if (WRITE) scenarios.media = { executor: 'constant-arrival-rate', exec: 'media', rate: Number(__ENV.MEDIA_PER_MIN || 30), timeUnit: '1m',
  duration: `${total(stages.browse)}s`, preAllocatedVUs: 5, maxVUs: 20 };

// k6 only reports per-route latency for sub-metrics that have a threshold; these never fail.
const ROUTES = ['auth/me', 'notifications/unread-count', 'action-inbox', 'items list', 'items search', 'item detail',
  'item stock-history', 'inventory-positions', 'storage-locations', 'orders/faction list', 'orders/faction detail',
  'orders/general list', 'orders/general detail', 'events list', 'event detail', 'equipment-availability',
  'assemblies list', 'assembly detail', 'inventory-summary', 'custody-balances', 'media download', 'media upload',
  'media staged download', 'media delete', 'index.html', 'config.js'];

export const options = {
  scenarios,
  discardResponseBodies: false,
  thresholds: {
    // Abort early instead of hurting real users: sustained errors or very slow responses stop the run.
    api_failed: [{ threshold: 'rate<0.05', abortOnFail: PROFILE !== 'smoke', delayAbortEval: '1m' }],
    'http_req_duration{kind:api}': ['p(95)<800', 'p(99)<2000', { threshold: 'p(95)<5000', abortOnFail: true, delayAbortEval: '1m' }],
    'http_req_duration{kind:page}': ['p(95)<500'],
    'http_req_duration{kind:media}': ['p(95)<1500'],
    server_errors: ['count<10'],
    ...Object.fromEntries(ROUTES.map(name => [`http_req_duration{name:${name}}`, ['max>=0']])),
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  userAgent: 'inventory-stress-test/1 (k6)',
};

// ---- authentication -------------------------------------------------------------------------------------------
// Either TOKENS (comma-separated bearer tokens), or username/password logins against the identity provider:
//   USERNAME + PASSWORD                  one account
//   OIDC_ACCOUNTS="user:pw,user2:pw2"    several accounts (VUs are spread across them)
//   OIDC_ACCOUNTS_FILE=/load/accounts.txt  one "user:password" per line (keeps secrets out of the shell history)
// plus OIDC_ISSUER (token endpoint discovered via .well-known) or OIDC_TOKEN_URL, OIDC_CLIENT_ID, optional
// OIDC_CLIENT_SECRET, OIDC_GRANT (client_credentials | password; default client_credentials) and OIDC_SCOPE.
// setup() logs every account in once and fails fast on bad credentials; each VU renews its token before it expires.
const STATIC_TOKENS = (__ENV.TOKENS || '').split(',').map(t => t.trim()).filter(Boolean);
const parseAccount = line => {
  const at = line.indexOf(':');
  if (at < 1) fail(`Account entries must be "username:password", got "${line.slice(0, 20)}..."`);
  return { username: line.slice(0, at), password: line.slice(at + 1) };
};
const ACCOUNTS = [
  ...(__ENV.USERNAME && __ENV.PASSWORD ? [{ username: __ENV.USERNAME, password: __ENV.PASSWORD }] : []),
  ...(__ENV.OIDC_ACCOUNTS || '').split(',').map(a => a.trim()).filter(Boolean).map(parseAccount),
  ...(__ENV.OIDC_ACCOUNTS_FILE ? open(__ENV.OIDC_ACCOUNTS_FILE).split('\n').map(l => l.trim())
    .filter(l => l && !l.startsWith('#')).map(parseAccount) : []),
];
const GRANT = __ENV.OIDC_GRANT || 'client_credentials';
if (!STATIC_TOKENS.length && !ACCOUNTS.length)
  fail('Set TOKENS, or USERNAME/PASSWORD (or OIDC_ACCOUNTS / OIDC_ACCOUNTS_FILE) with OIDC_ISSUER or OIDC_TOKEN_URL');
if (ACCOUNTS.length && !STATIC_TOKENS.length) {
  if (!__ENV.OIDC_CLIENT_ID) fail('Set OIDC_CLIENT_ID (the inventory OIDC client) for username/password logins');
  if (!__ENV.OIDC_TOKEN_URL && !__ENV.OIDC_ISSUER) fail('Set OIDC_ISSUER or OIDC_TOKEN_URL for username/password logins');
  if (!['client_credentials', 'password'].includes(GRANT)) fail('OIDC_GRANT must be client_credentials or password');
}

function expiry(token) {
  try { return JSON.parse(encoding.b64decode(token.split('.')[1], 'rawurl', 's')).exp || 0; } catch { return 0; }
}
function tokenUrl() {
  if (__ENV.OIDC_TOKEN_URL) return __ENV.OIDC_TOKEN_URL;
  const res = http.get(`${__ENV.OIDC_ISSUER.replace(/\/$/, '')}/.well-known/openid-configuration`, { tags: { kind: 'auth', name: 'discovery' } });
  if (res.status !== 200 || !res.json('token_endpoint')) fail(`OIDC discovery at ${__ENV.OIDC_ISSUER} failed: ${res.status}`);
  return res.json('token_endpoint');
}
function fetchToken(account, url) {
  const form = { grant_type: GRANT, client_id: __ENV.OIDC_CLIENT_ID, username: account.username, password: account.password,
    scope: __ENV.OIDC_SCOPE || 'openid profile email' };
  if (__ENV.OIDC_CLIENT_SECRET) form.client_secret = __ENV.OIDC_CLIENT_SECRET;
  const res = http.post(url, form, { tags: { kind: 'auth', name: 'token' }, responseCallback: http.expectedStatuses(200) });
  if (res.status !== 200 || !res.json('access_token'))
    fail(`Login of ${account.username} failed (${res.status}): ${String(res.body).slice(0, 300)}`);
  return res.json('access_token');
}
// Per-VU state: the logins from setup(), then this VU's own renewals.
let seeded = null, vuToken = null, vuTokenUrl = null;
function useSetup(data) { if (!seeded) { seeded = data.tokens || []; vuTokenUrl = data.tokenUrl; } }
function token() {
  const slot = exec.vu.idInTest - 1;
  if (STATIC_TOKENS.length) {
    const t = STATIC_TOKENS[slot % STATIC_TOKENS.length];
    if (expiry(t) && expiry(t) < Date.now() / 1000 + 10) fail('A static token expired; use USERNAME/PASSWORD for long runs');
    return t;
  }
  const index = slot % ACCOUNTS.length;
  const current = vuToken || (seeded && seeded[index]);
  if (!current || expiry(current) < Date.now() / 1000 + 60) vuToken = fetchToken(ACCOUNTS[index], vuTokenUrl || tokenUrl());
  else vuToken = current;
  return vuToken;
}

// ---- request helpers ------------------------------------------------------------------------------------------
function record(res, name) {
  const limited = res.status === 429;
  if (limited) rateLimited.add(1, { name });
  if (res.status >= 500 || res.status === 0) serverErrors.add(1, { name, status: String(res.status) });
  apiFailed.add(!limited && (res.status === 0 || res.status >= 400), { name });
  return res;
}
function get(path, name, params = {}) {
  const res = http.get(API + path, { headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
    tags: { kind: 'api', name }, timeout: '30s', ...params });
  record(res, name);
  check(res, { [`${name} 2xx`]: r => r.status >= 200 && r.status < 300 || r.status === 429 });
  return res;
}
function json(res, fallback) {
  try { return res.status === 200 ? res.json() : fallback; } catch { return fallback; }
}
const pick = list => list[Math.floor(Math.random() * list.length)];
const think = () => sleep(THINK * (0.5 + Math.random()));

// ---- discovery (runs once, before load) -----------------------------------------------------------------------
export function setup() {
  let tokens = [], url = null;
  if (!STATIC_TOKENS.length) {
    url = tokenUrl();
    tokens = ACCOUNTS.map(account => fetchToken(account, url));
    console.log(`setup: ${tokens.length} account(s) logged in with the ${GRANT} grant`);
  }
  const auth = { Authorization: `Bearer ${STATIC_TOKENS[0] || tokens[0]}` };
  const read = path => { const r = http.get(API + path, { headers: auth, tags: { kind: 'setup' } }); return r.status === 200 ? r.json() : []; };
  const me = http.get(API + '/api/auth/me', { headers: auth });
  if (me.status !== 200) fail(`GET /api/auth/me returned ${me.status}: check API_URL and the token (audience, issuer, inventory group)`);
  const items = [];
  for (let page = 0; page < 5; page++) {
    const batch = read(`/api/items?page=${page}&size=100`);
    items.push(...batch);
    if (batch.length < 100) break;
  }
  const data = {
    tokens, tokenUrl: url,
    role: me.json('role'),
    items: items.map(i => i.id),
    names: items.map(i => String(i.name || '').split(' ')[0]).filter(n => n.length > 2).slice(0, 200),
    images: items.flatMap(i => i.images || []).slice(0, 200),
    locations: read('/api/storage-locations?size=100').map(l => l.id),
    events: read('/api/events?size=50').map(e => e.id),
    assemblies: read('/api/assemblies?size=100').map(a => a.id),
    factionOrders: read('/api/orders/faction?size=50').map(o => o.id),
    generalOrders: read('/api/orders/general?size=50').map(o => o.id),
  };
  if (!data.items.length) fail('The first account sees no items; the browse scenario needs catalog data');
  console.log(`setup: role=${data.role} items=${data.items.length} images=${data.images.length} locations=${data.locations.length} ` +
    `events=${data.events.length} orders=${data.factionOrders.length + data.generalOrders.length} tokens=${STATIC_TOKENS.length || ACCOUNTS.length}`);
  return data;
}

// ---- scenarios ------------------------------------------------------------------------------------------------
/** A member opening the app, searching the catalog and looking at items. */
export function browse(data) {
  useSetup(data);
  if (APP) {
    const page = http.get(APP + '/', { tags: { kind: 'page', name: 'index.html' } });
    check(page, { 'app index 200': r => r.status === 200 });
    http.get(APP + '/config.js', { tags: { kind: 'page', name: 'config.js' } });
  }
  get('/api/auth/me', 'auth/me');
  get('/api/notifications/unread-count', 'notifications/unread-count');
  get('/api/action-inbox', 'action-inbox');
  think();
  const page = Math.floor(Math.random() * Math.max(1, Math.ceil(data.items.length / 50)));
  get(`/api/items?page=${page}&size=50`, 'items list');
  think();
  if (data.names.length && Math.random() < 0.6) {
    get(`/api/items?page=0&size=50&search=${encodeURIComponent(pick(data.names))}`, 'items search');
    think();
  }
  for (let n = 0; n < 2; n++) {
    const id = pick(data.items);
    const item = json(get(`/api/items/${id}`, 'item detail'), {});
    get(`/api/items/${id}/stock-history?page=0&size=50`, 'item stock-history');
    get(`/api/inventory-positions?itemId=${id}`, 'inventory-positions');
    const images = (item.images && item.images.length) ? item.images : (data.images.length ? [pick(data.images)] : []);
    if (images.length) {
      const res = http.get(`${API}/api/media/${images[0]}`, { headers: { Authorization: `Bearer ${token()}` },
        responseType: 'binary', tags: { kind: 'media', name: 'media download' }, timeout: '30s' });
      record(res, 'media download');
      if (res.status === 200) mediaDownloadBytes.add(res.body.byteLength);
    }
    think();
  }
  if (data.locations.length) get('/api/storage-locations?size=100', 'storage-locations');
  think();
}

/** Warehouse / organizer views: orders, events, assemblies and the heavier summary reads. */
export function warehouse(data) {
  useSetup(data);
  get('/api/auth/me', 'auth/me');
  get('/api/orders/faction?page=0&size=50', 'orders/faction list');
  if (data.factionOrders.length) get(`/api/orders/faction/${pick(data.factionOrders)}`, 'orders/faction detail');
  think();
  get('/api/orders/general?page=0&size=50', 'orders/general list');
  if (data.generalOrders.length) get(`/api/orders/general/${pick(data.generalOrders)}`, 'orders/general detail');
  think();
  get('/api/events?size=50', 'events list');
  if (data.events.length) {
    const event = pick(data.events);
    get(`/api/events/${event}`, 'event detail');
    get(`/api/equipment-availability?eventId=${event}`, 'equipment-availability');
  }
  think();
  get('/api/assemblies?size=100', 'assemblies list');
  if (data.assemblies.length) get(`/api/assemblies/${pick(data.assemblies)}`, 'assembly detail');
  // Team overview only; non-admin summaries are computed per request and are by far the most expensive read.
  if (Math.random() < SUMMARY_SHARE) get('/api/inventory-summary', 'inventory-summary');
  get('/api/custody-balances?size=50', 'custody-balances');
  think();
}

/** Open live-update streams, as every open browser tab does. Each request is held for up to 55 s. */
export function stream(data) {
  useSetup(data);
  const res = http.get(`${API}/api/events/stream`, { headers: { Authorization: `Bearer ${token()}`, Accept: 'text/event-stream' },
    tags: { kind: 'sse', name: 'events/stream' }, timeout: '55s' });
  if (res.status !== 0 && res.status !== 200) record(res, 'events/stream');
  sleep(1);
}

/**
 * WRITE=1 only. Staged image upload -> download -> delete: exercises S3 put/get/delete and the upload path's DB
 * connection without creating catalog data. Abandoned staged uploads are purged by the server anyway.
 */
let MEDIA = null; // built on first use, so only VUs of the media scenario allocate it
function mediaBytes() {
  if (!MEDIA) {
    const bytes = new Uint8Array(MEDIA_KB * 1024);
    for (let i = 0; i < bytes.length; i += 4096) bytes[i] = (i * 2654435761) >>> 24;
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    MEDIA = bytes.buffer;
  }
  return MEDIA;
}
export function media(data) {
  useSetup(data);
  const MEDIA = mediaBytes();
  const auth = { Authorization: `Bearer ${token()}` };
  const up = http.post(`${API}/api/media`, { file: http.file(MEDIA, 'stress-test.png', 'image/png') },
    { headers: auth, tags: { kind: 'media', name: 'media upload' }, timeout: '60s' });
  record(up, 'media upload');
  if (!check(up, { 'media upload 200': r => r.status === 200 })) return;
  const key = up.json('key');
  const down = http.get(`${API}/api/media/${key}`, { headers: auth, responseType: 'binary', tags: { kind: 'media', name: 'media staged download' } });
  record(down, 'media staged download');
  check(down, { 'staged media intact': r => r.status === 200 && r.body.byteLength === MEDIA.byteLength });
  record(http.del(`${API}/api/media/${key}`, null, { headers: auth, tags: { kind: 'media', name: 'media delete' } }), 'media delete');
}

// ---- report ---------------------------------------------------------------------------------------------------
export function handleSummary(summary) {
  delete summary.setup_data; // holds the access tokens from setup()
  const rows = [];
  for (const [key, metric] of Object.entries(summary.metrics)) {
    const match = key.match(/^http_req_duration\{name:(.+)\}$/);
    if (match && metric.values) rows.push([match[1], metric.values]);
  }
  const fmt = v => (v === undefined ? '-' : v.toFixed(0)).padStart(7);
  const lines = rows.sort((a, b) => (b[1]['p(95)'] || 0) - (a[1]['p(95)'] || 0))
    .map(([name, v]) => `${name.padEnd(32)}${fmt(v.med)}${fmt(v['p(95)'])}${fmt(v['p(99)'])}${fmt(v.max)}`);
  const m = summary.metrics;
  const text = [
    `\nProfile ${PROFILE} against ${API}`,
    `requests ${m.http_reqs ? m.http_reqs.values.count : 0}, ${m.http_reqs ? m.http_reqs.values.rate.toFixed(1) : 0}/s; ` +
      `api failure rate ${m.api_failed ? (m.api_failed.values.rate * 100).toFixed(2) : 0}%; ` +
      `429 rate-limited ${m.rate_limited ? m.rate_limited.values.count : 0}; 5xx/timeouts ${m.server_errors ? m.server_errors.values.count : 0}`,
    `\n${'endpoint (ms)'.padEnd(32)}${'med'.padStart(7)}${'p95'.padStart(7)}${'p99'.padStart(7)}${'max'.padStart(7)}`,
    ...lines, '',
  ].join('\n');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return { stdout: text, [`${__ENV.OUT_DIR || '.'}/stress-${PROFILE}-${stamp}.json`]: JSON.stringify(summary, null, 2) };
}
