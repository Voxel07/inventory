# PostgreSQL logical replication

The primary app VPS publishes the `inventory` database. The storage/S3 VPS runs
an independent PostgreSQL 18 instance from `docker-compose.storage.yml` and
subscribes to that publication. This deployment does not use a physical standby,
custom PostgreSQL entrypoints, or automatic data-directory cloning.

## 1. Connect the hosts privately

Connect both VPS hosts through a private network or WireGuard. On the primary,
set `DB_REPLICATION_BIND_ADDRESS` to its private address and allow TCP port 5432
only from the storage VPS. Do not expose PostgreSQL to the public internet.

The official PostgreSQL image initializes host authentication with SCRAM when a
password is supplied. If you maintain a custom `pg_hba.conf`, allow only the
replication role and storage VPS address:

```text
host inventory inventory_replicator 10.0.0.20/32 scram-sha-256
```

## 2. Start both PostgreSQL instances

On the app VPS:

```bash
docker compose up -d postgres
```

On the storage VPS, set `REPLICA_DB_PASSWORD` and start the storage stack:

```bash
docker compose -f docker-compose.storage.yml up -d
```

Both Compose files use the native PostgreSQL 18 volume layout. They assume new
named volumes and contain no upgrade compatibility paths.

## 3. Initialize the application schema

Start `inventory-api` with the production profile against an empty disposable
primary so Flyway runs the canonical `V1.0.0__init.sql` baseline and Hibernate
validates it. Every profile uses this Flyway baseline and Hibernate validation; development
does not use Hibernate update. Logical replication does not copy
schema definitions, so copy only the matching schema to the storage database
before creating the subscription:

```bash
pg_dump --schema-only --no-owner --no-privileges \
  --dbname="postgresql://inventory:PRIMARY_PASSWORD@PRIMARY_PRIVATE_IP:5432/inventory" \
  --file=inventory-schema.sql

psql \
  --dbname="postgresql://inventory:REPLICA_PASSWORD@127.0.0.1:5433/inventory" \
  --file=inventory-schema.sql
```

DDL and sequence values are not replicated. Current application data is
disposable: after editing the baseline/entities, recreate empty primary and
subscriber databases and repeat initialization and subscription setup. This
repository does not provide incremental upgrades for existing data.

## 4. Create the publication

Connect to the primary `inventory` database as its administrator and run:

```sql
CREATE ROLE inventory_replicator
  WITH LOGIN REPLICATION PASSWORD 'replace-this-password';

GRANT CONNECT ON DATABASE inventory TO inventory_replicator;
GRANT USAGE ON SCHEMA public TO inventory_replicator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO inventory_replicator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO inventory_replicator;

CREATE PUBLICATION inventory_publication FOR ALL TABLES;
```

All application tables need a primary key or another replica identity for
`UPDATE` and `DELETE` replication.

## 5. Create the subscription

Connect to the storage VPS `inventory` database as its administrator and run the
following outside a transaction. Replace the connection values first:

```sql
CREATE SUBSCRIPTION inventory_subscription
  CONNECTION 'host=PRIMARY_PRIVATE_IP port=5432 dbname=inventory user=inventory_replicator password=REPLICATION_PASSWORD sslmode=disable'
  PUBLICATION inventory_publication
  WITH (copy_data = true, create_slot = true, enabled = true);
```

The supplied Compose configuration does not provision PostgreSQL TLS, so the
example uses `sslmode=disable` and relies on the WireGuard/private network from
step 1 for encryption. Do not use `sslmode=prefer`: it silently falls back to
plaintext. If the route leaves a private network, configure server certificates
on the primary and use `sslmode=verify-full` (or at least `require`). The
subscription creates and owns its logical replication slot on the primary.

## 6. Verify and operate it

On the primary:

```sql
SELECT slot_name, slot_type, active, restart_lsn
FROM pg_replication_slots;
```

On the storage database:

```sql
SELECT subname, pid, received_lsn, latest_end_lsn, latest_end_time
FROM pg_stat_subscription;
```

Treat the replica tables as read-only to avoid replication conflicts. This is an
asynchronous data copy, not a physical hot standby. Before using it for failover,
disable or drop the subscription, synchronize sequences and point the app at the
storage database explicitly. Most keys are UUIDs; the identity column of
`order_history` is the sequence that matters. On the promoted database:

```sql
SELECT setval(pg_get_serial_sequence('order_history', 'id'),
              COALESCE((SELECT max(id) FROM order_history), 0) + 1, false);
```

Monitor retained WAL on the primary;
`POSTGRES_MAX_SLOT_WAL_KEEP_SIZE` caps how much a disconnected logical slot may
retain before the subscriber must be resynchronized.
