#!/usr/bin/env python3
"""Review local payloads by default. --apply upserts alerts into the explicitly configured organization."""
import argparse, json, os, pathlib, urllib.parse, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[1] / 'deploy' / 'observability'

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--apply', action='store_true'); args = parser.parse_args()
    alerts = json.loads((ROOT / 'alerts.json').read_text())
    if not args.apply:
        print(json.dumps(alerts, indent=2)); return
    base = os.environ['OPENOBSERVE_URL'].rstrip('/')
    if not base.startswith('https://'): raise ValueError('OpenObserve must use HTTPS')
    org = urllib.parse.quote(os.environ.get('OPENOBSERVE_ORG', 'default'), safe='')
    def request(method, path, payload=None):
        body = None if payload is None else json.dumps(payload).encode()
        with urllib.request.urlopen(urllib.request.Request(base+path, body,
                {'Authorization': os.environ['OPENOBSERVE_AUTHORIZATION'], 'Content-Type': 'application/json'}, method=method), timeout=20) as response:
            data = response.read(); return json.loads(data) if data else None
    path = f'/api/v2/{org}/alerts'
    existing = {row['name']: row['alert_id'] for row in request('GET', path)['list']}
    destination = os.environ['OPENOBSERVE_ALERT_DESTINATION']
    for alert in alerts:
        alert['destinations'] = [destination]
        if alert['name'] in existing: request('PUT', path+'/'+existing[alert['name']], alert)
        else: request('POST', path, alert)
    # Dashboard JSON is imported separately in the chosen folder to preserve operator layout changes.
    print(f'Provisioned {len(alerts)} alerts; import deploy/observability/dashboard.json in Dashboards.')

if __name__ == '__main__': main()
