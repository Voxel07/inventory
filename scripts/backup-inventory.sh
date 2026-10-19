#!/usr/bin/env bash
# Coordinated single-node backup. Run from the Compose project directory.
set -euo pipefail
umask 077
: "${BACKUP_ROOT:?Set an absolute BACKUP_ROOT outside the application volumes}"
: "${AGE_RECIPIENT:?Set the age public recipient for encrypted backups}"
[[ "$BACKUP_ROOT" = /* ]] || { echo 'BACKUP_ROOT must be absolute' >&2; exit 2; }
command -v age >/dev/null
mkdir -p "$BACKUP_ROOT"
exec 9>"$BACKUP_ROOT/.backup.lock"
flock -n 9 || { echo 'A backup is already running' >&2; exit 1; }
work=$(mktemp -d "$BACKUP_ROOT/.pending.XXXXXXXX")
api=$(docker compose ps -q inventory-api)
[[ -n "$api" && $(wc -w <<<"$api") -eq 1 ]] || { echo 'Requires one running inventory-api; quiesce other writers separately' >&2; exit 2; }
resume=0
cleanup() { if [[ "$resume" = 1 ]]; then docker compose start inventory-api >/dev/null; fi; }
trap cleanup EXIT
docker compose stop inventory-api >/dev/null
resume=1
docker compose exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' >"$work/database.dump"
if [[ ${MEDIA_MODE:-local} = local ]]; then
  docker cp "$api:/data/media/." "$work/media"
else
  : "${MEDIA_RCLONE_SOURCE:?Set the configured rclone bucket/prefix}"
  rclone copy "$MEDIA_RCLONE_SOURCE" "$work/media" --immutable
fi
docker compose start inventory-api >/dev/null
resume=0
printf 'format=1\ncreated_utc=%s\nmedia_mode=%s\n' "$(date -u +%FT%TZ)" "${MEDIA_MODE:-local}" >"$work/manifest.txt"
(cd "$work" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS)
archive="$BACKUP_ROOT/inventory-$(date -u +%Y%m%dT%H%M%SZ).tar.age"
tar -C "$work" -cf - . | age -r "$AGE_RECIPIENT" -o "$archive.partial"
mv -- "$archive.partial" "$archive"
# Remove only this verified mktemp directory after successful encryption.
[[ "$work" = "$BACKUP_ROOT"/.pending.* && -d "$work" ]] && rm -rf -- "$work"
if [[ -n ${BACKUP_RCLONE_DESTINATION:-} ]]; then rclone copyto "$archive" "$BACKUP_RCLONE_DESTINATION/$(basename "$archive")" --immutable; fi
date -u +%FT%TZ >"$BACKUP_ROOT/last-success.txt"
echo "$archive"
