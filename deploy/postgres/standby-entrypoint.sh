#!/bin/sh
set -eu

: "${PGDATA:?PGDATA is required}"
: "${PRIMARY_DB_HOST:?PRIMARY_DB_HOST is required}"
: "${PRIMARY_DB_PORT:=5432}"
: "${PRIMARY_DB_SSLMODE:=prefer}"
: "${REPLICATION_USER:?REPLICATION_USER is required}"
: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD is required}"
: "${REPLICATION_SLOT:?REPLICATION_SLOT is required}"

case "$REPLICATION_USER:$REPLICATION_SLOT" in
  *[!a-zA-Z0-9_:]*)
    echo "Replication role and slot names contain unsupported characters." >&2
    exit 1
    ;;
esac

case "$PRIMARY_DB_HOST:$PRIMARY_DB_PORT" in
  *[!a-zA-Z0-9_.:-]*|*:*:*)
    echo "Primary database host or port contains unsupported characters." >&2
    exit 1
    ;;
esac

case "$PRIMARY_DB_SSLMODE" in
  disable|allow|prefer|require|verify-ca|verify-full) ;;
  *)
    echo "PRIMARY_DB_SSLMODE is not a supported libpq SSL mode." >&2
    exit 1
    ;;
esac

mkdir -p "$PGDATA"
chmod 700 "$PGDATA"

export PGPASSFILE=/var/lib/postgresql/.pgpass
escaped_password=$(printf '%s' "$REPLICATION_PASSWORD" | sed 's/\\/\\\\/g; s/:/\\:/g')
printf '%s:%s:replication:%s:%s\n' \
  "$PRIMARY_DB_HOST" "$PRIMARY_DB_PORT" "$REPLICATION_USER" "$escaped_password" > "$PGPASSFILE"
chmod 600 "$PGPASSFILE"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  if [ -n "$(find "$PGDATA" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    echo "PGDATA is not empty but is not a PostgreSQL cluster; refusing to delete it." >&2
    exit 1
  fi

  pg_basebackup \
    --dbname="host=$PRIMARY_DB_HOST port=$PRIMARY_DB_PORT user=$REPLICATION_USER sslmode=$PRIMARY_DB_SSLMODE passfile=$PGPASSFILE application_name=inventory_storage_standby" \
    --pgdata="$PGDATA" \
    --format=plain \
    --wal-method=stream \
    --checkpoint=fast \
    --slot="$REPLICATION_SLOT" \
    --write-recovery-conf \
    --progress
fi

exec postgres \
  -c hot_standby=on \
  -c hot_standby_feedback=on \
  -c primary_slot_name="$REPLICATION_SLOT"
