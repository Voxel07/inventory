#!/usr/bin/env python3
"""Independent infrastructure probes. --send is explicit; dry-run prints numeric signals only."""
import argparse, datetime, json, os, pathlib, shutil, socket, subprocess, time, urllib.request

SQL = """
select 'outbox_pending',count(*)::float8 from domain_event_outbox where status in ('pending','processing','failed')
union all select 'outbox_dead',count(*)::float8 from domain_event_outbox where status='dead_letter'
union all select 'notification_failed',count(*)::float8 from notifications where delivery_status='failed'
union all select 'postgres_connections',count(*)::float8 from pg_stat_activity
union all select 'retained_wal_bytes',coalesce(sum(pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)),0)::float8 from pg_replication_slots
union all select 'replication_lag_seconds',coalesce(max(extract(epoch from replay_lag)),0)::float8 from pg_stat_replication
"""

def collect():
    now = time.time()
    values = {'collector_alive': 1}
    try:
        result = subprocess.run(['docker', 'compose', 'exec', '-T', 'postgres', 'sh', '-c',
            'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -F "|" -v ON_ERROR_STOP=1'], input=SQL, text=True,
            capture_output=True, check=True, timeout=15)
        values.update({name: float(value) for name, value in (line.split('|') for line in result.stdout.splitlines() if line.strip())})
        values['postgres_probe_ok'] = 1
    except (OSError, subprocess.SubprocessError, ValueError):
        values['postgres_probe_ok'] = 0
    try:
        with urllib.request.urlopen(os.environ.get('INVENTORY_HEALTH_URL', 'http://127.0.0.1:8080/q/health/ready'), timeout=5) as response:
            values['api_ready'] = int(response.status == 200)
    except Exception:
        values['api_ready'] = 0
    usage = shutil.disk_usage(os.environ.get('INVENTORY_DATA_FILESYSTEM', '/'))
    values['disk_used_percent'] = (usage.total - usage.free) / usage.total * 100
    marker = pathlib.Path(os.environ.get('BACKUP_ROOT', '/var/backups/inventory')) / 'last-success.txt'
    try:
        completed = datetime.datetime.fromisoformat(marker.read_text().strip().replace('Z', '+00:00')).timestamp()
        values['backup_age_seconds'] = max(0, now - completed)
    except (OSError, ValueError):
        values['backup_age_seconds'] = 1e9
    return [{'_timestamp': int(now * 1e6), 'host': socket.gethostname(), 'signal': key, 'value': value} for key, value in values.items()]

def send(rows):
    base = os.environ['OPENOBSERVE_URL'].rstrip('/')
    if not base.startswith('https://'):
        raise ValueError('OpenObserve must use HTTPS')
    org = os.environ.get('OPENOBSERVE_ORG', 'default')
    request = urllib.request.Request(f'{base}/api/{org}/inventory_ops/_json', json.dumps(rows).encode(),
        {'Authorization': os.environ['OPENOBSERVE_AUTHORIZATION'], 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status not in (200, 201): raise RuntimeError('Metric ingestion failed')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--send', action='store_true'); args = parser.parse_args()
    rows = collect()
    if args.send: send(rows)
    else: print(json.dumps(rows, indent=2))
