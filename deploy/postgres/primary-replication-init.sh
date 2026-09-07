#!/bin/sh
set -eu

: "${REPLICATION_USER:?REPLICATION_USER is required}"
: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD is required}"
: "${REPLICATION_SLOT:?REPLICATION_SLOT is required}"
: "${REPLICATION_CIDR:?REPLICATION_CIDR is required}"

case "$REPLICATION_USER:$REPLICATION_SLOT" in
  *[!a-zA-Z0-9_:]*)
    echo "Replication role and slot names may only contain letters, numbers, and underscores." >&2
    exit 1
    ;;
esac

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=repl_user="$REPLICATION_USER" \
  --set=repl_password="$REPLICATION_PASSWORD" \
  --set=repl_slot="$REPLICATION_SLOT" <<'SQL'
SELECT format('CREATE ROLE %I WITH REPLICATION LOGIN PASSWORD %L', :'repl_user', :'repl_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'repl_user') \gexec

SELECT pg_create_physical_replication_slot(:'repl_slot')
WHERE NOT EXISTS (SELECT FROM pg_replication_slots WHERE slot_name = :'repl_slot');
SQL

replication_rule="host replication ${REPLICATION_USER} ${REPLICATION_CIDR} scram-sha-256"
if ! grep -Fqx "$replication_rule" "$PGDATA/pg_hba.conf"; then
  printf '%s\n' "$replication_rule" >> "$PGDATA/pg_hba.conf"
fi
