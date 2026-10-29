# ASH Inventory API

Quarkus 3.39 / Java 25 REST backend for the ASH inventory application.

## Local development

For local JVM development, start Docker Desktop or Podman, then run with Java 25 and Maven:

```bash
cd backend
mvn quarkus:dev
```

Quarkus Dev Services starts PostgreSQL 18 automatically on a random host port, supplies the URL and credentials, applies the Flyway baseline and validates the schema. No `DB_*` variables are needed for local dev mode. The database survives live reloads but its container is removed when dev mode stops, even when Testcontainers reuse is enabled globally. Restart dev mode after changing the baseline schema.

Fresh dev databases also load the sample inventory, events, orders and operational history from the dev-only SQL snapshot. No manual CSV import is needed. The seed skips populated databases, so live reloads preserve edits. Production and tests do not load it. See [Development sample database](../docs/DEV_SEED.md) for the SQL and regeneration instructions.

To use an existing development database, explicitly set `QUARKUS_DATASOURCE_JDBC_URL`, `QUARKUS_DATASOURCE_USERNAME` and `QUARKUS_DATASOURCE_PASSWORD`; the explicit URL disables automatic database provisioning.

For the Docker Compose stack, run from the repository root:

```bash
docker compose up postgres inventory-api
```

Compose supplies an explicit connection to its `postgres` service, including when `QUARKUS_PROFILE=dev`. Production continues to require `DB_URL`, `DB_USER` and `DB_PASSWORD`. Tests continue to use `TEST_DB_URL`, `TEST_DB_USER` and `TEST_DB_PASSWORD`; database Dev Services are disabled for tests.

The API exposes:

- OpenAPI: `http://localhost:8080/q/openapi`
- Swagger UI: `http://localhost:8080/q/swagger-ui`
- Health: `http://localhost:8080/q/health`

All profiles use PostgreSQL, the single Flyway baseline, and Hibernate validation. Tests clean and recreate the dedicated database configured with `TEST_DB_URL`, `TEST_DB_USER`, and `TEST_DB_PASSWORD` at startup.

Production requires `OIDC_ENABLED=true` and the Authentik issuer/client settings. `DEV_AUTH_ENABLED` must be `false` outside local development.

Development role/faction headers initialize new accounts only. Once an account exists, change its roles and faction memberships through User Management; later requests retain those saved assignments even if a client sends stale headers. To preview faction-leader access, use a separate account without higher roles and choose **Impersonate** from the admin user directory.

Edit `src/main/resources/db/migration/V1.0.0__init.sql` and entity definitions directly. Current data is disposable; recreate an empty database after baseline changes. Do not add incremental scripts or repair old Flyway histories. The production profile runs this creation baseline and validates the resulting schema.

Faction snapshots use a transactional source revision and database epoch in their shared cache key. Reads started after a mutation commits select its revision even when event fan-out fails. Cache outages fall back to PostgreSQL; database loader failures propagate. One snapshot per revision contains all event types; filtering introduces no extra cache keys. Entries expire after five minutes, and the local backend retains at most 64 revisions. Locations and events remain uncached.

Stock catalog, planning and report read boundaries establish PostgreSQL REPEATABLE READ before querying. Commands keep their existing locks and recalculate after writes in their command transaction. Report source triggers advance compact revisions with each source statement; rollback also rolls back the revision. Every profile installs these triggers from the canonical Flyway baseline. Revision row locks last until commit and add write contention per source table.

Loan and member-request lists and item-asset GETs accept `page` and `size` (maximum 200); the web client loads further pages explicitly.

## Native executable memory experiment

`Dockerfile.native` compiles the backend inside a Java 25 Mandrel builder and
packages the executable in UBI 9 Micro. `src/main/docker/Dockerfile.native-micro`
only packages an already compiled Linux executable. They use the same runtime
base: the second Dockerfile does not provide an additional runtime RAM saving.
No JRE or Maven is shipped in either final image.

From the repository root, opt into native for the single-node stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.native.yml up -d --build inventory-api
```

This uses the existing database, authentication, environment and media volume.
For comparison, the normal `docker compose up -d --build inventory-api` selects
the JVM build again. Tag builds in CI publish the native image
(`backend/Dockerfile.native`) as the backend package. Do not apply this override
to `docker-compose.cluster.yml`: its API healthcheck requires curl, which is
absent from the micro image.

To build just the native image from the repository root:

```bash
docker build -f backend/Dockerfile.native -t inventory-api:native backend
```

Alternatively, from `backend/`, use a local Java 25 installation, Maven and a
container runtime to compile and then package a prebuilt runner:

```bash
mvn package -Pnative -DskipTests -Dquarkus.native.container-build=true -Dquarkus.native.builder-image=quay.io/quarkus/ubi9-quarkus-mandrel-builder-image:jdk-25
docker build -f src/main/docker/Dockerfile.native-micro -t inventory-api:native .
```

The runner must match the runtime OS/CPU architecture. The default AMD64 target
requires x86-64-v3 CPU features. Set `-Dquarkus.native.march=compatibility` on the
Maven command only if deployment hardware needs it; use `native` only when the
build host's CPU features match every deployment host. The multistage build keeps
the compiler defaults. For repeatable release comparisons, record the resolved
builder/runtime image digests: `jdk-25` and `2.0` are moving tags.

Both runtime images run as UID 1001 and provide `/data/media` for local storage.
Existing named volumes or host mounts must permit UID 1001 to write; image
ownership cannot change the permissions of an existing mount.

Memory and performance policy:

- Both native images default to `-Xmx512m -Xmn256m`, and the native Compose
  override sets `mem_limit: 768m`. Measured: ~97% of uncapped throughput at
  ~380 MiB peak instead of ~1 GiB. Serial GC sizes the young generation from
  `-Xmx`, so a heap cap without `-Xmn` costs 10–18% throughput. Total process
  memory also includes stacks, native buffers and GC overhead; keep the limit.
- Keep default `-O2` optimization. Avoid `-Os`, quick builds and UPX as memory
  tuning: executable/image size and runtime memory are different measurements.
- Mandrel's default Serial GC suits small heaps but can lose throughput or
  increase pauses under allocation-heavy concurrency. Native is an experiment,
  not a guaranteed runtime performance improvement. G1 and full PGO are options
  for a separate Oracle GraalVM evaluation, not switches to enable on Mandrel.
- Warm both variants, then compare identical data, concurrency and CPU allocation:
  idle and peak container memory, RSS, CPU, throughput, p95/p99 latency and errors.
  Include reports, media uploads/downloads, long-lived SSE and MCP. Use
  `docker stats` for container trends; also observe the process RSS and peaks
  during GC. Keep the same telemetry settings and observe memory after load ends.
- `-XX:MaxHeapFree` returns more memory when idle but cost ~25% throughput in
  testing. `quarkus.native.native-image-xmx` controls compilation memory only
  and does not tune the running application.

Native runtime flags go directly in container arguments (Compose `command:`, or
after the image name in `docker run`); these replace the default heap flags, so
repeat `-Xmx`/`-Xmn` when adding others. `JAVA_OPTS` and `JAVA_TOOL_OPTIONS` are not
read by the executable. `QUARKUS_HTTP_HOST` remains overridable at runtime.

See the [local Docker memory comparison](../docs/NATIVE_MEMORY_BENCHMARK.md) and
[prioritized findings and acceptance status](../docs/NATIVE_MEMORY_REVIEW.md).
Reference: [Quarkus native builds](https://quarkus.io/guides/building-native-image/),
[GraalVM 25 memory management](https://www.graalvm.org/jdk25/reference-manual/native-image/optimizations-and-performance/MemoryManagement/)
and [compiler optimization options](https://www.graalvm.org/jdk25/reference-manual/native-image/optimizations-and-performance/).

## Backend package structure

The backend has six modules: `operations`, `notification`, `reporting`, `blobs`, `integration`, and `platform`. Cross-module calls use public APIs with ID/value contracts. Entities, repositories and HTTP/MCP adapters stay within their owning module. Stock/order/custody/privacy transactions remain in the operations consistency boundary.

See [Module Boundaries and Scaling](../docs/MODULAR_BOUNDARIES.md) for contracts, worker roles, report generation and durable integrations. [modules.json](architecture/modules.json) assigns every baseline table one owner. Run the static source gate without a build:

```sh
python scripts/check-architecture.py # from repository root
```

The CI gate checks dependencies, exported records, table ownership and injected cycles. This source check does not establish CDI, Hibernate or runtime acceptance. Builds and application suites still follow `AGENTS.md`.

MCP tools/resources/prompts delegate through the transactional `McpInventoryService` and the existing catalog/query/stock owners. Production `/mcp` and `/mcp/*` require OIDC authentication; manager/planner mutations, item/component visibility, real actor attribution and catalog outbox publication use canonical rules. The [MCP guide](../docs/MCP_SUPPORT.md) documents the shared typed inputs and scoped outputs. Shared MCP service delegation is implemented in source; historical regression evidence and pending production transport/domain acceptance are tracked in the implementation plan.

API throttling defaults to 300 requests per caller per 60-second window and can be configured with `API_RATE_LIMIT_REQUESTS` and `API_RATE_LIMIT_WINDOW_SECONDS`.

## Item and assembly images

The web app converts new JPEG, PNG and WebP item uploads to WebP at quality 82,
with a maximum edge length of 2048 pixels (no upscaling). Conversion applies EXIF
orientation, converts to sRGB and re-encodes pixels without the source metadata
or filename. EXIF, XMP and ICC chunks are explicitly removed from the encoded WebP. It
requires browser WebP encoding support; unsupported or invalid files fail before
upload. Map overlays continue to use the generic media uploader.

Uploads are staged until the item is saved. The API assigns the final object key
`items/<unique-image-id>/<item-id>.webp`, so multiple images have the item ID as
their filename without overwriting each other. After database commit the staged
object is deleted; rollback preserves it for retry and removes the new copy.
Failed storage cleanup is logged. Abandoned uploads and removed item images are
not automatically garbage-collected.

Media is fetched from `/api/media/<key>` using the app's authentication headers.
The API reads private Garage/S3 objects with signed requests and returns the
bytes and image content type. The bucket does not need public access; its API
credentials need object read, write and delete permissions. `S3_ENDPOINT` must
be reachable by the backend and need not be reachable by the browser.

Records store canonical relative object keys. Absolute/external URL forms are rejected rather than translated from historical values. Existing image formats display without re-encoding; re-upload to apply WebP conversion.

Set `TEST_DB_URL`, `TEST_DB_USER`, and `TEST_DB_PASSWORD` to a dedicated PostgreSQL
test database, then run `mvn clean test` for media storage and API regression tests.
The test profile cleans the configured test database at startup. A clean build
removes compiled classes left behind after deleting or renaming nested DTOs;
those stale classes can otherwise cause Quarkus startup to fail with an
`IncompatibleClassChangeError` about disagreeing `InnerClasses` attributes.
For actual browser
encoding and authenticated rendering checks, start the frontend with `bun run dev`
and open `/tests/media.browser.html`; its generated fixtures and mocked API do not
need a running backend or S3 service.

Assemblies support one optional image via `image` (object key) and `removeImage`
on create/update. Omitting these fields preserves the image on update. Assembly
uploads use `assemblies/<unique-image-id>/<assembly-id>.webp`. The nullable
`assemblies.image_object_key` column is defined in the canonical baseline.

Item and assembly forms share an image editor with drag/position controls, zoom,
original/square/landscape/portrait aspect ratios and 512/1024/2048-pixel output
limits. Cropping is applied to the stored pixels before upload, with no upscaling
and the same metadata stripping. Existing images can be edited, and item image
replacements preserve gallery order. Applying a crop stages a change in the form;
it is uploaded only when the form is saved. Cancel closes the editor without
applying its crop. Restoring discarded areas after saving requires the original
image to be uploaded again.
