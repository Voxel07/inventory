#!/usr/bin/env bash
# Restores only into a fresh, isolated container and disposable media volume.
set -euo pipefail
umask 077
: "${1:?Usage: restore-drill.sh archive.tar.age}"
: "${AGE_IDENTITY:?Set the age identity file}"
work=$(mktemp -d)
name="inventory-restore-drill-$(date -u +%Y%m%d%H%M%S)-$RANDOM"
started=$(date +%s)
cleanup() { docker rm -f -v "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
age -d -i "$AGE_IDENTITY" "$1" >"$work/snapshot.tar"
# Reject links and escaping paths before extraction, even for a correctly encrypted archive.
python3 - "$work" <<'PY'
import pathlib, sys, tarfile
root = pathlib.Path(sys.argv[1])
with tarfile.open(root / 'snapshot.tar') as archive:
    for entry in archive:
        path = pathlib.PurePosixPath(entry.name)
        if path.is_absolute() or '..' in path.parts or not (entry.isfile() or entry.isdir()):
            raise SystemExit('Unsafe archive entry: ' + entry.name)
    archive.extractall(root, filter='data')
(root / 'snapshot.tar').unlink()
PY
(cd "$work" && sha256sum --check SHA256SUMS)
password=$(openssl rand -hex 24)
docker run -d --name "$name" --network none -e POSTGRES_PASSWORD="$password" postgres:18-alpine >/dev/null
for attempt in {1..60}; do docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$name" createdb -U postgres inventory_drill
docker exec -i "$name" pg_restore -U postgres -d inventory_drill --no-owner --no-acl --exit-on-error <"$work/database.dump"
docker exec "$name" psql -U postgres -d inventory_drill -v ON_ERROR_STOP=1 -c "select count(*) as movements from stock_transactions; select count(*) as positions from inventory_positions; select count(*) as attached_media from inventory_media_objects where resource_id is not null;"
[[ -d "$work/media" ]] || { echo 'Missing media snapshot' >&2; exit 1; }
printf 'Restore drill completed in %s seconds. Restored media and checksum evidence: %s\n' "$(( $(date +%s)-started ))" "$work"
# Evidence/media stay in the printed isolated directory for operator inspection.
