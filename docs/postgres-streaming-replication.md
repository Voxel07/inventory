# PostgreSQL streaming replication

The primary database runs with WAL senders and a physical replication slot. The storage VPS runs `docker-compose.storage.yml`, which initializes a PostgreSQL 18 hot standby from `pg_basebackup` and then continuously streams WAL from the primary.

The primary Compose file explicitly retains `/var/lib/postgresql/data` as `PGDATA` so an existing named volume remains usable after moving to the PostgreSQL 18 image. The new standby follows the PostgreSQL 18 parent-volume layout under `/var/lib/postgresql`.

## Network requirements

Connect both VPS hosts through a private network or WireGuard. Set `DB_REPLICATION_BIND_ADDRESS` to the primary VPS private address and restrict `REPLICATION_CIDR` to the storage VPS address or private subnet. Do not expose PostgreSQL port 5432 to the public internet.

Use the same `REPLICATION_USER`, `REPLICATION_PASSWORD`, and `REPLICATION_SLOT` values on both hosts.
Set these values before the first primary startup; the Compose file deliberately has no default replication password.

## New primary database

For a new `inventory-postgres` volume, `docker-compose.yml` automatically creates the replication role, physical slot, and `pg_hba.conf` entry through `deploy/postgres/primary-replication-init.sh`.

Start the primary services first:

```powershell
docker compose up -d postgres valkey inventory-api inventory-app
```

## Existing primary database

Docker initialization scripts do not rerun for an existing database volume. Create the role and slot once inside the existing primary:

```sql
CREATE ROLE inventory_replicator WITH REPLICATION LOGIN PASSWORD 'replace-this-password';
SELECT pg_create_physical_replication_slot('inventory_storage_standby');
```

Append this narrowly scoped rule to the primary database's `pg_hba.conf`, replacing the CIDR with the storage VPS private address:

```text
host replication inventory_replicator 10.0.0.20/32 scram-sha-256
```

Then reload PostgreSQL configuration. Also ensure the primary container is recreated with the replication command-line settings in `docker-compose.yml`.

## Start the storage VPS

Copy the repository deployment files and `garage.toml` to the storage VPS, configure its `.env`, and run:

```powershell
docker compose -f docker-compose.storage.yml up -d
```

The standby bootstrap is intentionally non-destructive. If its data volume contains an incomplete cluster, it stops instead of deleting data. Resolve the cause and explicitly recreate only the `inventory-postgres-standby` volume before trying again.

## Verify replication

On the primary:

```sql
SELECT application_name, client_addr, state, sync_state, replay_lag
FROM pg_stat_replication;

SELECT slot_name, active, restart_lsn
FROM pg_replication_slots;
```

On the standby:

```sql
SELECT pg_is_in_recovery();
SELECT status, sender_host, slot_name, latest_end_lsn
FROM pg_stat_wal_receiver;
```

`pg_is_in_recovery()` must return `true`. This setup is asynchronous: it provides a hot standby and a second copy of the database, but promotion and application failover remain explicit operational actions.

Monitor retained WAL on the primary. A physical slot prevents required WAL from being removed while the standby is offline, which can fill the primary disk; `POSTGRES_MAX_SLOT_WAL_KEEP_SIZE` limits that exposure.
