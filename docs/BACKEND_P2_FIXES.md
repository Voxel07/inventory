# Backend P2 fixes

- [x] P2 #4: Batch policy/grant/member facts and location visibility within the transaction. Fetch transaction, damage, maintenance and report DTO relationships; batch loan asset codes and member custody eligibility.
- [x] P2 #5: Read ledger totals, custody write-offs, damage, reservations and member damage in one scoped stock-facts statement. Aggregate general-order JSON reservations in SQL for catalog and planning.
- [x] P2 #6: Apply recipient/status/outstanding predicates in custody and inbox queries. Aggregate direct custody and pending returns, batch item/event lookups and maintenance counters. Paginate member-request, loan and item-asset GETs; add explicit client paging.
- [x] P2 #7: Replace COUNT/MAX across source tables with one compact revision-table query. Source triggers update revisions in the source transaction; rollback reverses them. Keep the existing actor-sensitive, immutable, row-weight-bounded report cache.
- [x] P2 #8: Key the shared faction snapshot by database epoch and committed revision. Cache one all-event snapshot per revision, filter it in memory, and fall back to PostgreSQL on cache failures. Remove eviction listeners and transactional eviction annotations; publication/deduplication no longer govern cache freshness.
- [x] P2 #10: Establish REPEATABLE READ before the first SELECT in stock catalog, planning and report read boundaries. Preserve command locks and post-write recalculation in command transactions.
- [x] Related P3: Remove inactive locations/events cache configuration and document their uncached behavior.
- [x] Validation: 138 backend tests passed on Java 25 / PostgreSQL 17.6; frontend TypeScript passed and all 28 Bun tests passed.

Measured JDBC statement counts (background polling disabled):

| Read | Statements |
|---|---:|
| 25 plain bulk catalog items, including root and stock/image/purchase projection | 6 |
| 25 private items with distinct policies and locations | 9 |
| Scoped stock facts / empty scope | 1 / 0 |
| Policy views for 25 policies | 2, no entity/member hydration |
| Transaction list and DTO mapping with 25 distinct users/assets | 1, no mapping queries |
| Recipient custody with 300+ historical movements and no event metadata | 3, one resulting balance |
| Usage evaluation for 25 schedules | 1 |
| Warm report read | At most 3: header, actor and compact revisions |
| Warm faction read, including arbitrary event-type filters | 1 revision query |

Correctness coverage includes stock/planning equivalence, custody losses and missing quantities, scoped JSON reservations, revocation, baseline trigger/schema validation, revision rollback, all report rebuilds, and a concurrent commit between snapshot reads. Cache tests inject load, eviction, database-loader and publication failures and a late old-generation fill across two consumers. Quarkus cache integration verifies warm hits and freshness after source writes without outbox eviction. Live multi-replica Redis/Valkey fault testing and production latency/EXPLAIN measurements were not performed.

Freshness contract: reads beginning after a source commit select its new revision. An overlapping read may return its earlier committed snapshot; its fill stays under the older key. Epochs prevent key reuse after disposable schema recreation. Cached faction entries expire after five minutes; local caches also cap retained revisions at 64. Redis remains the production backend.

Source revisions use one locked row per source table, held until transaction completion. This adds write contention per table; it avoids sequence/commit-order gaps. Production creates revisions/triggers from the canonical baseline. Dev/test Hibernate schemas install the matching `source-revisions.sql`; update both definitions together. Baseline tests recreate only their isolated schema. No incremental migration was added.

Validation: `mvn -o test` with `TEST_DB_URL`, `TEST_DB_USER`, `TEST_DB_PASSWORD` set for the disposable database; `bunx --no-install tsc -b --pretty false`; `bun test`.
