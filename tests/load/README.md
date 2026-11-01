# Production stress test (single VPS)

`stress.k6.js` drives the deployed API (and optionally the static app) with realistic member and warehouse traffic.
`vps-monitor.sh` runs on the VPS at the same time and records which resource saturates.
Nothing here runs against local dev mode.

## Safety

- **Read-only by default.** `WRITE=1` adds a staged image upload → download → delete loop (S3 put/get/delete).
  It creates no catalog data, and any leftover staged object is purged by the media cleanup worker.
- The run **aborts automatically** after one minute of more than 5% failed API requests or a p95 above 5 s.
- Run off-peak and tell users. Real users share the same CPU, database and rate limits.
- Run k6 from **another machine**, not the VPS. Otherwise the load generator competes with the app for CPU.

## Accounts and rate limit

Each account may make `API_RATE_LIMIT_REQUESTS` (default 300) API requests per minute. One VU makes about 70
(browse) to 110 (warehouse) per minute, so one account covers about 3 VUs. For `stress` and `spike` it is simpler to
raise the limit in `.env` for the test window (for example `API_RATE_LIMIT_REQUESTS=100000`) and restore it afterwards.
429 responses are counted separately (`rate_limited`). They are not counted as failures.

Test accounts must be members of the `inventory` group. Give at least one of them a role that sees orders and events
(for example `warehouse_crew`) so that the warehouse scenario is meaningful.

Ways to authenticate (production requires a login):

1. **Username and password** (recommended). `setup()` logs each account in once, stops with a clear error on wrong
   credentials, and every VU renews its token before it expires, so long runs work.

   | Variable | Meaning |
   |---|---|
   | `USERNAME`, `PASSWORD` | One account |
   | `OIDC_ACCOUNTS` | Several accounts: `user1:pw1,user2:pw2`. VUs are spread across them. |
   | `OIDC_ACCOUNTS_FILE` | A mounted file with one `username:password` per line (`#` comments allowed). Keeps passwords out of the shell history. With `chmod 600`, run the container as its owner (`--user "$(id -u)"`). |
   | `OIDC_ISSUER` | Issuer URL; the token endpoint is discovered from it (e.g. `https://auth.example.org/application/o/inventory/`) |
   | `OIDC_TOKEN_URL` | Token endpoint instead of discovery (e.g. `https://auth.example.org/application/o/token/`) |
   | `OIDC_CLIENT_ID` | The inventory OIDC client (`inventory`) |
   | `OIDC_CLIENT_SECRET` | Only needed for a confidential client |
   | `OIDC_GRANT` | `client_credentials` (default) or `password` |
   | `OIDC_SCOPE` | Default `openid profile email` |

   For Authentik, use a dedicated test user and an **app password** (user settings → Tokens and App passwords) as the
   password. Authentik's `client_credentials` and `password` grants take the username plus an app password or
   service-account token. A normal interactive login (with MFA or a custom flow) cannot be scripted.
2. `TOKENS=tok1,tok2,...` holds access tokens copied from logged-in sessions. Use this for short runs only; a run
   aborts when a token expires.

## Run

```bash
# On the VPS, from the compose directory (writes vps-monitor-*.tsv):
tests/load/vps-monitor.sh 5

# From another machine (or a single account: -e USERNAME=svc-load -e PASSWORD="$APP_PASSWORD"):
mkdir -p results
docker run --rm -i --network host --user "$(id -u)" -v "$PWD/tests/load:/load:ro" -v "$PWD/results:/out" \
  -e API_URL=https://api.example.org -e APP_URL=https://inventory.example.org -e OUT_DIR=/out \
  -v "$PWD/accounts.txt:/secrets/accounts.txt:ro" -e OIDC_ACCOUNTS_FILE=/secrets/accounts.txt \
  -e OIDC_ISSUER=https://auth.example.org/application/o/inventory/ -e OIDC_CLIENT_ID=inventory \
  -e PROFILE=stress -e SSE=50 -e WRITE=1 \
  grafana/k6:1.3.0 run /load/stress.k6.js
```

| `PROFILE` | Shape | Answers |
|---|---|---|
| `smoke` (default) | 3 VUs, 1 min | Do auth, discovery and every route work? Run this first. |
| `load` | 25 VUs, 10 min steady | Are latencies fine at the expected peak? |
| `stress` | 13 → 250 VUs in 4-minute steps | Where is the knee, and which resource causes it? |
| `spike` | 13 → 240 VUs within 20 s | Does the stack recover after a sudden surge? |
| `soak` | 38 VUs, 2 h | Are there leaks or slow growth (memory, connections, disk)? |
| `steady` | `VUS` (default 50) + a quarter as warehouse users for `DURATION` (default `5m`) | Fixed load, e.g. to profile queries with `pg_stat_statements` |

Other options: `SSE=<n>` opens n live-update streams, as open browser tabs do. `MEDIA_PER_MIN` sets the upload rate
for `WRITE=1` (default 30). `MEDIA_KB` sets the upload size (default 300). `THINK_SECONDS` sets the mean pause between
steps (default 2). `SUMMARY_SHARE` sets the share of warehouse iterations that open the team overview
(`/api/inventory-summary`, default 0.2), which is by far the most expensive read for non-admins.

## Reading the result

To see which queries cost the most, start Postgres with
`-c shared_preload_libraries=pg_stat_statements`, run `create extension pg_stat_statements`, reset it before a run with
`select pg_stat_statements_reset()`, and afterwards list the `toplevel` statements by `total_exec_time`.

k6 prints the request rate, failures, 429s and a per-route latency table sorted by p95, and writes the full JSON
to `OUT_DIR`. Match the time at which latency starts climbing with the monitor's columns:

| Symptom in `vps-monitor` / API logs | Limiting factor | Lever |
|---|---|---|
| Postgres near 100% × vCPUs, API much lower; `pg_stat_statements` tops with `inventory_resource_visible` | Privacy-filtered aggregate reads (team overview summary, order lists); measured locally as the first limit | Cache or rewrite those reads; lower `SUMMARY_SHARE` to see the next limit |
| Latency rises while `cpu_busy` stays low; `pg_active` stays at about 5; API log shows `acquisition timeout` | API DB pool (`DB_POOL_SIZE`, default **5**) | Raise `DB_POOL_SIZE` (e.g. 15–20; Postgres allows 100) |
| `cpu_busy` near 100%, mostly from the API container | API CPU (JSON, privacy filtering, summaries) | More vCPUs; check the slowest routes in the table |
| `cpu_busy` high from the postgres container; `pg_longest_active_s` grows | Query cost (summary, availability, positions) | `EXPLAIN` the slow route; add indexes |
| `pg_cache_hit` below ~99%, `disk_read_mb_s` up, `iowait` up | Postgres memory or disk | More RAM, `shared_buffers` (the compose file uses the default 128 MB) |
| API memory near its limit, `swap_used_mb` growing | JVM heap or host RAM | Set `-Xmx`/container limits; use the native image (see `docker-compose.native.yml`) |
| `media *` routes slow or failing while others are fine | Object storage / its network path | Garage resources, proxy limits |
| Many `rate_limited` | Per-account limit (expected) | More test accounts or a temporary higher limit |
