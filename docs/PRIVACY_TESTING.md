# Private inventory regression tests

Run client regressions with `bun test`; run the production bundle with `bun run build`.

The backend tests use PostgreSQL, matching production's recursive privacy queries and JSONB operations. With Docker running, `mvn test` from `backend/` uses Quarkus Dev Services. To use a dedicated disposable PostgreSQL database instead, set `TEST_DB_URL`, `TEST_DB_USER`, and `TEST_DB_PASSWORD` before running Maven. **Do not point tests at a shared application database**: the regular test profile recreates the default schema.

`PrivateInventoryApiTest` verifies owner/admin access, denial for outsiders and warehouse staff, private creation defaults, explicit public creation restrictions, view versus edit grants, owner-only sharing management, optimistic revisions, group membership revocation, independent location sharing/redaction, staged and attached media authorization, share validation, codes/history, and report cache isolation after revocation.

`BaselineSchemaTest` initializes the separate `inventory_baseline_test` schema through the single Flyway baseline and enables Hibernate schema validation. It also checks the 54 application tables, including access and media metadata. This exercises the same baseline/validation combination used in production.

Client regressions cover mixed public/private responses, private command recognition (including UUID map keys and paths), durable cache removal, offline queue rejection, query eviction on connectivity loss, access-change invalidation, and account isolation.

These automated tests do not establish concurrent revocation behavior under load, visual browser acceptance, S3 storage integration, or production-scale query performance.
