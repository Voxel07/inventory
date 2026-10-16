"""Explicit local Docker benchmark. Requires Python httpx and cryptography.

Run --prepare after building inventory-benchmark:jvm; run --run after building
inventory-benchmark:native and inventory-benchmark:frontend. Artifacts go to the
ignored backend/target/native-memory-benchmark directory. Uses synthetic OIDC
credentials and a new disposable database; never reads repository .env files.
"""
import argparse
import asyncio
import base64
import collections
import json
import random
import re
import statistics
import struct
import subprocess
import time
import uuid
import zlib
from pathlib import Path

import httpx
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'backend/target/native-memory-benchmark'
PREFIX = 'inventory-membench-20261016'
ORIGIN = 'http://127.0.0.1:18085'
ISSUER = f'http://{PREFIX}-oidc:8000'
IMAGES = {'jvm': 'jvm', 'native': 'native', 'native-micro': 'native-micro', 'native-free64m': 'native',
          'jvm-x256': 'jvm', 'jvm-serial-x256': 'jvm', 'native-x256': 'native', 'native-x128': 'native',
          'native-x96': 'native', 'native-x256-mn128': 'native', 'native-x512-mn256': 'native',
          'native-valkey': 'native'}
# Native options are appended to the executable; JVM options go through JAVA_TOOL_OPTIONS.
RUNTIME_FLAGS = {'native-free64m': ['-XX:MaxHeapFree=64m'], 'native-x256': ['-Xmx256m'],
                 'native-x128': ['-Xmx128m'], 'native-x96': ['-Xmx96m'],
                 # Serial GC's young generation defaults to a small share of -Xmx; size it explicitly.
                 'native-x256-mn128': ['-Xmx256m', '-Xmn128m'], 'native-x512-mn256': ['-Xmx512m', '-Xmn256m'],
                 'native-valkey': ['-Xmx512m', '-Xmn256m']}
# Same tuned native process, but rate limiting and live events go through a Valkey container.
VALKEY_VARIANTS = {'native-valkey'}
VALKEY_IMAGE = 'valkey/valkey:8-alpine'
# The limit is raised so the benchmark is never throttled; a short window keeps the per-caller
# window as small as production's 300 requests/minute instead of ~13k entries per 60 s.
RATE_WINDOW_SECONDS = 60
JVM_OPTIONS = {'jvm-x256': '-Xmx256m -XX:+UseG1GC',
               'jvm-serial-x256': '-Xmx256m -XX:+UseSerialGC -XX:ReservedCodeCacheSize=64m -Xss512k'}
# Hard container limits prove the capped variants stay inside a budget instead of merely growing slower.
# A 512m limit OOM-killed the Serial JVM: off-heap (direct buffers, metaspace, code cache) exceeds 256m.
MEMORY_LIMITS = {'jvm-x256': '768m', 'jvm-serial-x256': '768m', 'native-x256': '512m',
                 'native-x128': '384m', 'native-x96': '320m', 'native-x256-mn128': '512m',
                 'native-x512-mn256': '768m', 'native-valkey': '768m'}


def docker(*args, check=True):
    result = subprocess.run(['docker', *map(str, args)], capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(f'docker {args[0]} failed: {result.stderr[-3000:]}')
    return result.stdout.strip()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2), encoding='utf-8')


def state():
    return json.loads((OUT / 'state.json').read_text())


def auth():
    return {'Authorization': f"Bearer {state()['token']}"}


def request(method, path, **kwargs):
    with httpx.Client(base_url=ORIGIN, headers=auth(), timeout=60, trust_env=False) as client:
        response = client.request(method, path, **kwargs)
        if not response.is_success:
            raise RuntimeError(f'{method} {path}: {response.status_code}: {response.text[:1500]}')
        return response


class MCP:
    def __init__(self):
        self.client = httpx.Client(base_url=ORIGIN, headers=auth(), timeout=60, trust_env=False)
        self.headers = {'Accept': 'application/json, text/event-stream'}
        self.rpc = 0
        self.call('initialize', {'protocolVersion': '2025-03-26', 'capabilities': {},
                                'clientInfo': {'name': 'native-memory-benchmark', 'version': '1'}})
        self.call('notifications/initialized', {}, notification=True)

    def call(self, method, params, notification=False):
        self.rpc += 1
        body = {'jsonrpc': '2.0', 'method': method, 'params': params}
        if not notification:
            body['id'] = self.rpc
        response = self.client.post('/mcp', headers=self.headers, json=body)
        response.raise_for_status()
        if 'Mcp-Session-Id' in response.headers:
            self.headers['Mcp-Session-Id'] = response.headers['Mcp-Session-Id']
            self.headers['MCP-Protocol-Version'] = '2025-03-26'
        if notification:
            return
        payload = parse_rpc(response)
        if 'error' in payload:
            raise RuntimeError(str(payload['error']))
        return payload['result']

    def tool(self, name, arguments):
        result = self.call('tools/call', {'name': name, 'arguments': arguments})
        if result.get('isError'):
            raise RuntimeError(str(result))
        return result.get('structuredContent') or json.loads(
            next(part['text'] for part in result['content'] if part['type'] == 'text'))

    def close(self):
        self.client.close()


def parse_rpc(response):
    if 'text/event-stream' in response.headers.get('Content-Type', ''):
        return json.loads(next(line[5:] for line in response.text.splitlines() if line.startswith('data:')))
    return response.json()


def start_api(variant):
    name = f'{PREFIX}-api'
    started = time.perf_counter()
    env = {
        'QUARKUS_PROFILE': 'prod', 'DB_URL': f'jdbc:postgresql://{PREFIX}-db:5432/inventory',
        'DB_USER': 'inventory', 'DB_PASSWORD': state()['db_password'],
        'OIDC_ENABLED': 'true', 'OIDC_AUTH_SERVER_URL': ISSUER,
        'OIDC_CLIENT_ID': 'inventory-benchmark', 'DEV_AUTH_ENABLED': 'false',
        'INVENTORY_BOOTSTRAP_ADMINS': 'benchmark@example.invalid',
        'OTEL_SDK_DISABLED': 'true', 'INVENTORY_LOG_LEVEL': 'INFO',
        'API_RATE_LIMIT_REQUESTS': '10000000', 'API_RATE_LIMIT_WINDOW_SECONDS': str(RATE_WINDOW_SECONDS),
        'MEDIA_LOCAL_DIRECTORY': '/data/media',
    }
    if variant in JVM_OPTIONS:
        env['JAVA_TOOL_OPTIONS'] = JVM_OPTIONS[variant]
    if variant in VALKEY_VARIANTS:
        start_valkey()
        env.update({'REDIS_URL': f'redis://{PREFIX}-valkey:6379', 'API_RATE_LIMIT_BACKEND': 'redis',
                    'EVENT_BACKEND': 'redis', 'REDIS_HEALTH_ENABLED': 'true'})
    args = ['run', '-d', '--name', name, '--network', PREFIX, '--cpus', '2',
            '-p', '127.0.0.1:18085:8080', '--tmpfs', '/data/media:uid=1001,gid=0,mode=0775']
    if variant in MEMORY_LIMITS:
        args += ['--memory', MEMORY_LIMITS[variant], '--memory-swap', MEMORY_LIMITS[variant]]
    for key, value in env.items():
        args += ['-e', f'{key}={value}']
    docker(*args, f'inventory-benchmark:{IMAGES[variant]}', *RUNTIME_FLAGS.get(variant, []))
    with httpx.Client(timeout=2, trust_env=False) as client:
        for _ in range(240):
            try:
                response = client.get(ORIGIN + '/q/health/ready')
                if response.status_code == 200:
                    return time.perf_counter() - started
            except httpx.HTTPError:
                pass
            if docker('inspect', '-f', '{{.State.Running}}', name) != 'true':
                raise RuntimeError(docker('logs', name))
            time.sleep(0.5)
    raise RuntimeError('API readiness timed out: ' + docker('logs', name))


def start_valkey():
    name = f'{PREFIX}-valkey'
    if docker('ps', '-a', '-q', '--filter', f'name=^/{name}$'):
        docker('rm', '-f', '-v', name)
    docker('run', '-d', '--name', name, '--network', PREFIX, '--cpus', '1', VALKEY_IMAGE,
           'valkey-server', '--save', '', '--appendonly', 'no', '--loglevel', 'warning')
    for _ in range(30):
        if docker('exec', name, 'valkey-cli', 'ping', check=False) == 'PONG':
            return
        time.sleep(0.5)
    raise RuntimeError('Valkey did not become ready')


def stop_api(log_name):
    name = f'{PREFIX}-api'
    logs = subprocess.run(['docker', 'logs', name], capture_output=True, text=True)
    (OUT / log_name).write_text(logs.stdout + logs.stderr, encoding='utf-8')
    docker('rm', '-f', name)


def prepare():
    OUT.mkdir(parents=True, exist_ok=True)
    if docker('network', 'ls', '--filter', f'name=^{PREFIX}$', '--format', '{{.Name}}'):
        raise RuntimeError(f'{PREFIX} already exists; refusing to overwrite a benchmark')
    docker('network', 'create', PREFIX)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    numbers = key.public_key().public_numbers()
    b64 = lambda data: base64.urlsafe_b64encode(data).rstrip(b'=')
    integer = lambda value: b64(value.to_bytes((value.bit_length() + 7) // 8, 'big')).decode()
    save('jwks.json', {'keys': [{'kty': 'RSA', 'kid': 'benchmark', 'use': 'sig', 'alg': 'RS256',
                               'n': integer(numbers.n), 'e': integer(numbers.e)}]})
    header = b64(json.dumps({'alg': 'RS256', 'kid': 'benchmark'}).encode())
    payload = b64(json.dumps({'iss': ISSUER, 'sub': 'benchmark', 'aud': 'inventory-benchmark',
                             'iat': int(time.time()), 'exp': int(time.time()) + 14400,
                             'email': 'benchmark@example.invalid', 'name': 'Memory benchmark',
                             'preferred_username': 'benchmark', 'groups': ['inventory']}).encode())
    signed = header + b'.' + payload
    token = (signed + b'.' + b64(key.sign(signed, padding.PKCS1v15(), hashes.SHA256()))).decode()
    save('state.json', {'token': token, 'db_password': str(uuid.uuid4())})
    (OUT / 'oidc.py').write_text('''import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        issuer = "''' + ISSUER + '''"
        if self.path.endswith('/.well-known/openid-configuration'):
            data = {'issuer': issuer, 'jwks_uri': issuer + '/jwks',
                    'authorization_endpoint': issuer + '/authorize', 'token_endpoint': issuer + '/token',
                    'introspection_endpoint': issuer + '/introspect', 'response_types_supported': ['code'],
                    'subject_types_supported': ['public'], 'id_token_signing_alg_values_supported': ['RS256']}
        elif self.path == '/jwks': data = json.loads(Path('/benchmark/jwks.json').read_text())
        else: self.send_error(404); return
        body = json.dumps(data).encode(); self.send_response(200)
        self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def log_message(self, *args): pass
ThreadingHTTPServer(('0.0.0.0', 8000), Handler).serve_forever()
''', encoding='utf-8')
    docker('run', '-d', '--name', f'{PREFIX}-oidc', '--network', PREFIX,
           '--mount', f'type=bind,source={OUT},target=/benchmark,readonly',
           'python:3.13-alpine', 'python', '/benchmark/oidc.py')
    docker('run', '-d', '--name', f'{PREFIX}-db', '--network', PREFIX, '--cpus', '2',
           '-e', 'POSTGRES_USER=inventory', '-e', f"POSTGRES_PASSWORD={state()['db_password']}",
           '-e', 'POSTGRES_DB=inventory', 'postgres:18-alpine')
    for _ in range(60):
        if 'accepting connections' in docker('exec', f'{PREFIX}-db', 'pg_isready', '-U', 'inventory', check=False):
            break
        time.sleep(1)
    start_api('jvm')
    me = request('GET', '/api/auth/me').json()
    assert me['role'] == 'admin', me
    locations = [request('POST', '/api/storage-locations', json={
        'name': f'Benchmark warehouse {i}', 'locationType': 'warehouse', 'active': True}).json() for i in range(5)]
    mcp = MCP()
    items = []
    for i in range(500):
        items.append(mcp.tool('create_item', {'input': {
            'name': f'Benchmark item {i:04d}', 'sku': f'BENCH-{i:04d}',
            'category': f'Category {i % 10}', 'description': 'Representative catalog metadata. ' * 8,
            'amount': 100 + i % 50, 'minStock': 10, 'value': 12.50,
            'storageLocation': locations[i % len(locations)]['id']}}))
        if i % 100 == 99:
            print(f'Seeded {i + 1} items through MCP', flush=True)
    for i in range(20):
        mcp.tool('create_assembly', {'input': {'name': f'Benchmark kit {i}',
                 'itemQuantities': {item['id']: 2 for item in items[i * 5:i * 5 + 5]}}})
    current = state()
    current['items'] = [item['id'] for item in items]
    save('state.json', current)
    mcp.close()
    stop_api('seed-jvm.log')
    print('Prepared isolated production-profile database: 500 items, 20 kits, 5 warehouses.', flush=True)


def sample(name):
    raw = docker('exec', name, 'cat', '/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory.peak',
                 '/sys/fs/cgroup/memory.stat', '/proc/1/status', '/sys/fs/cgroup/cpu.stat')
    def value(pattern):
        hit = re.search(pattern, raw, re.MULTILINE)
        return int(hit.group(1)) if hit else 0
    current = int(raw.splitlines()[0])
    inactive = value(r'^inactive_file (\d+)')
    return {'time': time.time(), 'cgroup_bytes': current,
            'cgroup_lifetime_peak_bytes': int(raw.splitlines()[1]),
            'working_set_bytes': max(0, current - inactive),
            'rss_bytes': value(r'^VmRSS:\s+(\d+)') * 1024,
            'cpu_usec': value(r'^usage_usec (\d+)'), 'threads': value(r'^Threads:\s+(\d+)')}


def png():
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
    rng = random.Random(42)
    pixels = b''.join(b'\0' + rng.randbytes(512 * 3) for _ in range(512))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!IIBBBBB', 512, 512, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')


def smoke():
    assert httpx.get(ORIGIN + '/api/items', trust_env=False).status_code == 401
    assert request('GET', '/api/auth/me').json()['role'] == 'admin'
    catalog = request('GET', '/api/items?size=100').json()
    assert len(catalog) == 100
    assert catalog[0]['description'] == 'Representative catalog metadata. ' * 8
    assert len(request('GET', '/api/assemblies?size=100').json()) == 20
    mcp = MCP()
    discovered = mcp.call('tools/list', {})
    original = {'name': 'Benchmark CRUD smoke', 'category': 'Smoke', 'amount': 0}
    created = mcp.tool('create_item', {'input': original})
    updated = mcp.tool('update_item', {'itemId': created['id'], 'input': {
        'name': 'Benchmark CRUD updated', 'category': 'Smoke'}})
    assert updated['name'] == 'Benchmark CRUD updated'
    assert mcp.tool('get_item_details', {'itemId': created['id']})['id'] == created['id']
    mcp.tool('delete_item', {'itemId': created['id']})
    assert request('GET', '/api/reports/availability?size=100').json()
    image = png()
    media = request('POST', '/api/media', files={'file': ('benchmark.png', image, 'image/png')}).json()
    media_path = '/api/media/' + media['key']
    assert request('GET', media_path).content == image
    return mcp, media_path, {'mcp_tools': len(discovered['tools']), 'crud': 'passed',
                           'oidc_and_unauthorized': 'passed', 'media_roundtrip_bytes': len(image),
                           'catalog_assemblies_reports': 'passed'}


async def workload(seconds, concurrency, mcp_headers, media_path, name):
    item_id = state()['items'][0]
    paths = ['/api/items?size=100', '/api/items?size=100&page=2', '/api/items?search=002&size=100',
             '/api/assemblies?size=100', '/api/inventory-summary',
             '/api/reports/availability?size=100', '/api/reports/availability?category=Category%203&size=100',
             '/api/items/' + item_id, media_path, '/mcp']
    deadline = time.perf_counter() + seconds
    latencies, statuses, samples, errors = [], collections.Counter(), [], []
    done = asyncio.Event()
    sse_events = [0]
    async with httpx.AsyncClient(base_url=ORIGIN, headers=auth(), timeout=30,
                                limits=httpx.Limits(max_connections=concurrency + 8), trust_env=False) as client:
        async def worker(index):
            counter = index
            while time.perf_counter() < deadline:
                path = paths[counter % len(paths)]
                started = time.perf_counter()
                try:
                    if path == '/mcp':
                        response = await client.post(path, headers=mcp_headers, json={
                            'jsonrpc': '2.0', 'id': index * 1000000 + counter, 'method': 'tools/call',
                            'params': {'name': 'get_item_details', 'arguments': {'itemId': item_id}}})
                        payload = parse_rpc(response) if response.is_success else {}
                        if 'error' in payload or payload.get('result', {}).get('isError'):
                            errors.append(response.text[:200])
                    else:
                        response = await client.get(path)
                    statuses[str(response.status_code)] += 1
                    if not response.is_success:
                        errors.append(f'{path} {response.status_code} {response.text[:150]}')
                except Exception as exception:
                    statuses['exception'] += 1
                    errors.append(str(exception))
                latencies.append((time.perf_counter() - started) * 1000)
                counter += 1

        async def collect():
            while not done.is_set():
                samples.append(await asyncio.to_thread(sample, name))
                try:
                    await asyncio.wait_for(done.wait(), 1)
                except asyncio.TimeoutError:
                    pass

        async def stream():
            async with client.stream('GET', '/api/events/stream', timeout=None) as response:
                assert response.status_code == 200
                async for line in response.aiter_lines():
                    if line.startswith('data:'):
                        sse_events[0] += 1

        collector = asyncio.create_task(collect())
        streams = [asyncio.create_task(stream()) for _ in range(4)]
        started = time.perf_counter()
        await asyncio.gather(*(worker(i) for i in range(concurrency)))
        elapsed = time.perf_counter() - started
        done.set()
        await collector
        for task in streams:
            task.cancel()
        stream_results = await asyncio.gather(*streams, return_exceptions=True)
        for result in stream_results:
            if isinstance(result, Exception) and not isinstance(result, asyncio.CancelledError):
                errors.append(f'SSE: {result}')
    ordered = sorted(latencies)
    return {'duration_seconds': elapsed, 'requests': len(latencies),
            'requests_per_second': len(latencies) / elapsed,
            'p50_ms': statistics.median(ordered), 'p95_ms': ordered[int(len(ordered) * .95)],
            'p99_ms': ordered[min(len(ordered) - 1, int(len(ordered) * .99))],
            'statuses': dict(statuses), 'errors': errors[:20], 'error_count': len(errors),
            'sse_events': sse_events[0], 'samples': samples}


def idle(seconds):
    samples = []
    for _ in range(seconds // 2):
        samples.append(sample(f'{PREFIX}-api'))
        time.sleep(2)
    return samples


def run_bench(rounds, warmup, duration, variants, result_file, cooldown=10):
    all_results = []
    for round_index in range(rounds):
        order = variants if round_index % 2 == 0 else list(reversed(variants))
        for variant in order:
            print(f'Round {round_index + 1}: starting {variant}', flush=True)
            startup = start_api(variant)
            mcp, media_path, checks = smoke()
            idle_before = idle(10)
            asyncio.run(workload(warmup, 16, mcp.headers, media_path, f'{PREFIX}-api'))
            measured = asyncio.run(workload(duration, 16, mcp.headers, media_path, f'{PREFIX}-api'))
            idle_after = idle(cooldown)
            result = {'round': round_index + 1, 'variant': variant, 'startup_ready_seconds': startup,
                      'smoke': checks, 'idle_before': idle_before, 'loaded': measured, 'idle_after': idle_after,
                      'runtime_flags': RUNTIME_FLAGS.get(variant, []),
                      'jvm_options': JVM_OPTIONS.get(variant), 'memory_limit': MEMORY_LIMITS.get(variant),
                      'oom_killed': docker('inspect', '-f', '{{.State.OOMKilled}}', f'{PREFIX}-api'),
                      'valkey_after_load': sample(f'{PREFIX}-valkey') if variant in VALKEY_VARIANTS else None,
                      'image': json.loads(docker('image', 'inspect', f'inventory-benchmark:{IMAGES[variant]}'))[0]['Id']}
            request('DELETE', media_path)
            mcp.close()
            stop_api(f'{variant}-round{round_index + 1}.log')
            all_results.append(result)
            save(result_file, all_results)
            brief = {'variant': variant, 'round': round_index + 1, 'rps': round(measured['requests_per_second'], 1),
                     'p95_ms': round(measured['p95_ms'], 1), 'errors': measured['error_count'],
                     'peak_working_set_mib': round(max(s['working_set_bytes'] for s in measured['samples']) / 2**20, 1),
                     'peak_rss_mib': round(max(s['rss_bytes'] for s in measured['samples']) / 2**20, 1),
                     'idle_after_mib': round(idle_after[-1]['working_set_bytes'] / 2**20, 1)}
            print(json.dumps(brief), flush=True)
            if measured['error_count']:
                raise RuntimeError('Workload errors; inspect results.json before continuing')
    print('Benchmark finished. Raw results: ' + str(OUT / result_file), flush=True)


async def frontend():
    origin = 'http://127.0.0.1:18086'
    async with httpx.AsyncClient(base_url=origin, trust_env=False, timeout=30) as client:
        page = await client.get('/')
        assert page.status_code == 200
        assets = re.findall(r'(?:src|href)="(/assets/[^"]+)"', page.text)
        assert assets
        for path in assets:
            assert (await client.get(path)).status_code == 200
        assert '18085' in (await client.get('/config.js')).text
        assert page.headers.get('content-security-policy')
        paths = ['/', '/config.js', *assets]
        before = await asyncio.to_thread(sample, f'{PREFIX}-frontend')
        samples, latencies, errors = [], [], []
        stop = asyncio.Event()
        deadline = time.perf_counter() + 30

        async def worker(index):
            while time.perf_counter() < deadline:
                started = time.perf_counter()
                try:
                    response = await client.get(paths[index % len(paths)])
                    if response.status_code != 200:
                        errors.append(str(response.status_code))
                except Exception as exception:
                    errors.append(str(exception))
                latencies.append((time.perf_counter() - started) * 1000)
                index += 1

        async def collect():
            while not stop.is_set():
                samples.append(await asyncio.to_thread(sample, f'{PREFIX}-frontend'))
                await asyncio.sleep(1)

        collector = asyncio.create_task(collect())
        started = time.perf_counter()
        await asyncio.gather(*(worker(i) for i in range(16)))
        stop.set()
        await collector
        result = {'smoke': 'HTML, assets, config.js and CSP passed', 'asset_count': len(assets),
                  'idle': before, 'loaded_samples': samples, 'requests': len(latencies),
                  'duration_seconds': time.perf_counter() - started, 'errors': errors[:20]}
        save('frontend-results.json', result)
        print('Frontend HTTP and RAM measurement passed: ' + str(len(latencies)) + ' requests', flush=True)


def cleanup():
    for suffix in ['api', 'frontend', 'oidc', 'db', 'valkey']:
        name = f'{PREFIX}-{suffix}'
        if docker('ps', '-a', '-q', '--filter', f'name=^/{name}$'):
            docker('rm', '-f', '-v', name)
    docker('network', 'rm', PREFIX)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--cleanup', action='store_true')
    parser.add_argument('--frontend', action='store_true')
    parser.add_argument('--rounds', type=int, default=2)
    parser.add_argument('--warmup', type=int, default=30)
    parser.add_argument('--duration', type=int, default=60)
    parser.add_argument('--variants', nargs='+', choices=IMAGES, default=['jvm', 'native', 'native-micro'])
    parser.add_argument('--results-file', default='results.json')
    parser.add_argument('--cooldown', type=int, default=10, help='idle seconds sampled after load')
    parser.add_argument('--rate-window', type=int, default=60, help='API rate-limit window seconds')
    args = parser.parse_args()
    RATE_WINDOW_SECONDS = args.rate_window
    if args.prepare:
        prepare()
    elif args.run:
        run_bench(args.rounds, args.warmup, args.duration, args.variants, args.results_file, args.cooldown)
    elif args.cleanup:
        cleanup()
    elif args.frontend:
        asyncio.run(frontend())
    else:
        parser.error('Choose --prepare, --run or --cleanup')
