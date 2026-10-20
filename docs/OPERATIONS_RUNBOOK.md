# Operations runbook

## Image storage access errors

An S3 `403` during `MediaResource.upload` / `putObject` is an image-storage failure. Check the API container's `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY` and `S3_SECRET_KEY` against the intended storage server and its bucket permissions. Garage's `No such key` response during an upload means the configured access key is not recognized by that server. Correct the deployment configuration and recreate the API container so it loads the updated environment; retry the upload. Never paste secret keys into logs or support messages.

For a failed checkout, obtain the error for `POST /api/transactions` and its trace ID separately; an image-upload stack trace does not identify that failure.

## Backups and restoration

`scripts/backup-inventory.sh` stops the single Compose API writer, takes a PostgreSQL custom-format dump and copies `/data/media` (or a configured rclone bucket prefix), then resumes the API. It hashes every file, encrypts the bundle with age and optionally copies it to a separate rclone destination. A lock prevents overlapping runs; failed snapshots never receive a completed archive name. A failure resumes the API and retains the private staging directory for diagnosis.

Install Docker Compose, age, flock, Python 3.12+ (safe restore extraction) and, for remote storage, rclone. Set `BACKUP_ROOT` to an absolute directory outside application volumes and `AGE_RECIPIENT` to the backup public key. Keep the private age identity separately. S3 installations also set `MEDIA_MODE=s3` and `MEDIA_RCLONE_SOURCE=remote:bucket/prefix`. `BACKUP_RCLONE_DESTINATION` supplies the separate backup destination. Restrict the environment file to the operator.

Install the service/timer in `deploy/backup/` after adjusting `/opt/inventory` and `/etc/inventory/backup.env`. The timer runs daily at 02:30, with up to five minutes of jitter. Stop every external database/bucket writer during the snapshot. This script is for the single-node deployment; adding a second API requires a coordinated stop of every writer before using it. A database replica does not replace this backup.

Run `AGE_IDENTITY=/secure/backup-key scripts/restore-drill.sh archive.tar.age` on an isolated Docker host. The drill rejects escaping paths/links, verifies hashes, restores into a fresh PostgreSQL 18 container with no network, fails on SQL errors and prints elapsed seconds and the private media/evidence directory. It removes the database container afterwards. Inspect media against `inventory_media_objects`, then remove the printed disposable directory. Production restoration requires an operator-selected empty database and media target, stopped writers, and the same baseline/application version. The drill deliberately has no production overwrite option.

Initial objectives: daily backup RPO ≤25 hours, restore drill RTO ≤60 minutes for the acceptance dataset. Keep 30 daily encrypted bundles and 12 monthly bundles on separate storage; deletion and key rotation are operator actions. Restore monthly and after schema/storage changes. Continuous WAL/PITR and automatic database failover remain outside this logical backup implementation. No production backup or restore is performed by this code change.

## Independent monitoring

`scripts/collect-operations.py` reads only numeric infrastructure signals: readiness, PostgreSQL probe/connections, replication transport lag, retained slot WAL, outbox backlog/dead letters, failed notice delivery, filesystem use and backup age. No actor names, inventory text or tokens enter the payload. Set `INVENTORY_DATA_FILESYSTEM` to the actual database/media filesystem and `BACKUP_ROOT` to the backup marker directory. Run from the Compose project directory with permission to execute the PostgreSQL container. Local dry-run is the default.

For ingestion, configure `OPENOBSERVE_URL` (HTTPS), `OPENOBSERVE_ORG`, and `OPENOBSERVE_AUTHORIZATION` in the protected environment file, then install `deploy/observability/inventory-operations.service` and `.timer`. `--send` explicitly enables ingestion into `inventory_ops`; the timer runs every minute. Deploy the collector outside the API process. Monitor the collector host and the OpenObserve destination independently: a failed monitoring server cannot report its own silence.

Review `deploy/observability/alerts.json` using `scripts/provision-observability.py`. Set `OPENOBSERVE_ALERT_DESTINATION` to an existing tested destination and pass `--apply` to create/update the named alerts. Import `dashboard.json` in the chosen OpenObserve dashboard folder. Provisioning uses the [official v2 alert API](https://api.openobserve.ai/swagger/index.html); dashboards use the documented [JSON import](https://openobserve.ai/docs/user-guide/analytics/dashboards/dashboards-in-openobserve/). The payload format was checked against the official schema; a live instance/destination acceptance test is still required.

| Signal | Trigger | Response |
|---|---|---|
| API / database probe | Unhealthy over the three-minute window | Check readiness, logs, pool and database reachability |
| Outbox dead letters / failed notices | Any | Review safe failure state, repair destination/cause, retry deliberately |
| Outbox backlog | >1,000 | Check dispatcher, oldest age, database/publisher saturation |
| Disk | >85% | Check database, media, staging and backup growth |
| Retained slot WAL | >8 GiB | Inspect inactive/stalled slots before exhausting the volume |
| Replication transport lag | >60 seconds | Check replication status on both ends; logical apply requires subscriber-side inspection too |
| Backup marker | >30 hours or absent | Inspect the timer, snapshot failure, destination and encryption keys |
| Collector silence | No probe for five minutes | Check host, timer, credentials and ingestion independently |

Application OTEL metrics remain available for request duration/error rate, DB pool wait, outbox age and sync outcomes. Exclude SSE from ordinary request latency panels. An empty `pg_stat_replication` reports zero transport lag; it does **not** prove a required replica exists. Configure replica-presence/subscriber checks for the actual topology. Redis alerts and cluster acceptance are deferred.

Local verification on 20 October 2026 passed an encrypted schema/media fixture backup and fresh-container restore in six seconds, plus collector database/backup-marker probes. This is script evidence, not a measured recovery time for application-scale data. See [validation](VALIDATION_2026_10_20.md).
