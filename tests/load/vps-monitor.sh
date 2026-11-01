#!/usr/bin/env bash
# Samples the VPS while tests/load/stress.k6.js runs, to see which resource limits throughput.
# Run on the VPS from the compose directory:  tests/load/vps-monitor.sh [interval-seconds] [output.tsv]
# Read-only: it only reads /proc, `docker stats` and PostgreSQL statistics views. Stop with Ctrl-C.
set -euo pipefail

INTERVAL="${1:-5}"
OUT="${2:-vps-monitor-$(date +%Y%m%d-%H%M%S).tsv}"
COMPOSE="${COMPOSE:-docker compose}"
PG_CONTAINER="$($COMPOSE ps -q postgres)"
[ -n "$PG_CONTAINER" ] || { echo "postgres service not found; run from the compose directory or set COMPOSE" >&2; exit 1; }

psql() { docker exec "$PG_CONTAINER" psql -U inventory -d inventory -AtF $'\t' -c "$1" 2>/dev/null; }
cpu_totals() { awk '/^cpu /{idle=$5+$6; total=0; for(i=2;i<=NF;i++) total+=$i; print total, idle, $6}' /proc/stat; }
# Whole physical disks only (vda, sda, nvme0n1), so partitions are not counted twice.
DISKS="$(ls /sys/block | grep -vE '^(loop|ram|zram|dm-|sr)' | tr '\n' ' ')"
disk_totals() { awk -v disks=" $DISKS" 'index(disks, " " $3 " ") {r+=$6; w+=$10; t+=$13} END {print r+0, w+0, t+0}' /proc/diskstats; }

printf 'time\tload1\tcpu_busy%%\tiowait%%\tmem_avail_mb\tswap_used_mb\tdisk_read_mb_s\tdisk_write_mb_s\tdisk_busy%%\tpg_conns\tpg_active\tpg_idle_in_tx\tpg_waiting_lock\tpg_longest_active_s\tpg_commits_s\tpg_cache_hit%%\tcontainers(cpu%%/mem)\n' | tee "$OUT"

read -r c_total c_idle c_iowait < <(cpu_totals)
read -r d_read d_write d_busy < <(disk_totals)
commits="$(psql "select sum(xact_commit) from pg_stat_database")"
while true; do
  sleep "$INTERVAL"
  read -r n_total n_idle n_iowait < <(cpu_totals)
  read -r n_read n_write n_busy < <(disk_totals)
  dt=$((n_total - c_total)); [ "$dt" -gt 0 ] || dt=1
  busy=$(( 100 * (dt - (n_idle - c_idle)) / dt )); iowait=$(( 100 * (n_iowait - c_iowait) / dt ))
  rmb=$(awk -v a="$d_read" -v b="$n_read" -v s="$INTERVAL" 'BEGIN{printf "%.1f", (b-a)*512/1048576/s}')
  wmb=$(awk -v a="$d_write" -v b="$n_write" -v s="$INTERVAL" 'BEGIN{printf "%.1f", (b-a)*512/1048576/s}')
  dbusy=$(awk -v a="$d_busy" -v b="$n_busy" -v s="$INTERVAL" 'BEGIN{v=(b-a)/(s*10); if (v>100) v=100; printf "%.0f", v}')
  mem=$(awk '/MemAvailable/{printf "%d", $2/1024}' /proc/meminfo)
  swap=$(awk '/SwapTotal/{t=$2} /SwapFree/{f=$2} END{printf "%d", (t-f)/1024}' /proc/meminfo)
  pg=$(psql "select count(*), count(*) filter (where state='active'), count(*) filter (where state like 'idle in transaction%'),
      count(*) filter (where wait_event_type='Lock'), coalesce(round(extract(epoch from max(now()-query_start) filter (where state='active'))::numeric,1),0)
      from pg_stat_activity where datname='inventory' and pid<>pg_backend_pid()")
  new_commits="$(psql "select sum(xact_commit) from pg_stat_database")"
  cps=$(( (new_commits - commits) / INTERVAL ))
  hit=$(psql "select round(100*sum(blks_hit)/nullif(sum(blks_hit+blks_read),0),1) from pg_stat_database where datname='inventory'")
  stats=$(docker stats --no-stream --format '{{.Name}}={{.CPUPerc}}/{{.MemUsage}}' | sed 's/ \/ [^ ]*//' | tr '\n' ' ')
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date +%H:%M:%S)" "$(cut -d' ' -f1 /proc/loadavg)" \
    "$busy" "$iowait" "$mem" "$swap" "$rmb" "$wmb" "$dbusy" "$pg" "$cps" "$hit" "$stats" | tee -a "$OUT"
  c_total=$n_total; c_idle=$n_idle; c_iowait=$n_iowait; d_read=$n_read; d_write=$n_write; d_busy=$n_busy; commits=$new_commits
done
