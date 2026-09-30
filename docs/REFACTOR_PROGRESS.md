# Refactoring progress

## A01–A06

| Finding | Status | Change |
|---|---|---|
| A01 | Implemented | Hide inaccessible assemblies and nested component projections; remove shared assembly cache. |
| A02 | Implemented | Session generations isolate queries/drafts, refreshes, media, requests and offline data. Durable queues/history remain account-owned. |
| A03 | Implemented | Validate asset snapshot version/state/location under item → asset locks; protect custody, reservations and bulk holds. |
| A04 | Implemented | Restore only the unchanged submission marker with unresolved custody; always retain rejection evidence. |
| A05 | Implemented | Share maintenance facts, scope-specific counters and evaluation across live operations, planning, reports and inbox. |
| A06 | Implemented | Share serialized stock classification; expose transit separately and retain owned totals for bulk/serialized transfers. |

Earlier A01–A06 validation: frontend/backend builds, ESLint and whitespace passed; all 87 backend tests (H2) and nine client tests passed. These results predate P01–P05 and do not validate the later changes. Baseline edited directly for A03/A04.

Earlier suite failures resolved: typed planning UUID results and the canonical `due` maintenance assertion.

Pending: PostgreSQL baseline initialization and browser acceptance.

## P01–P05

Implemented **30 September 2026**; builds and automated regression suites passed **1 October 2026**. PostgreSQL, browser acceptance and performance measurements remain pending.

| Finding | Status | Change |
|---|---|---|
| P01 | Implemented | Query assemblers pass explicit empty image lists for imageless items/components; the mapper has no image-query fallback. Detail and nested order responses use the same batch loading. |
| P02 | Implemented | `ApiQueryService` owns item, assembly, order and event projection loading. `ApiMapper` performs no explicit database work. Request-local equipment facts batch positions/lots, contributor damage, maintenance schedules/counters, commitments/loans, assets and consumption; batch readers call the existing availability policy. Event metrics load datasets/names once per event batch. General-order lists return summaries; detail/history loads on demand. Visibility checks capture one actor per batch. |
| P03 | Implemented | One HQL `UNION ALL` retrieves all 27 count/max watermarks, preserving per-request freshness and before/after rebuild checks. Report pages query generation metadata, then reuse immutable filtered rows/monthly totals keyed by name/version/generation/filters. Cache limits: 64 variants, 100,000 rows, five minutes; larger results bypass the cache. Export fetches the complete pinned generation in one response instead of repeatedly filtering 200-row pages. Availability/maintenance rebuilds batch policy counters and FEFO reservation allocation. |
| P04 | Implemented | Typed local write metadata and SSE share one consumer dependency map, including operation subdomains, notifications and sync completion. Mutation hooks and the header no longer invalidate again on successful writes. Session-scoped CSV batches publish the union of affected domains once, including partial success. SSE replay IDs expire after ten minutes and are bounded to 2,048 per session. Unknown events/reconnects remain conservative. Terminal HTTP/session errors are not retried; the existing A02 deadline still covers body parsing. Dynamic event metrics bypass the catalog ETag shortcut. |
| P05 | Implemented | Planning ORM queries receive the required event scope and active-item supply scope. Earlier reusable conflicts and cumulative consumables remain included; late/undated incoming supply remains visible. Latest overrides use createdAt plus ID as a deterministic tie-breaker and avoid loading superseded history. |

Current owners: [query assembly](../backend/src/main/java/org/ash/inventory/service/ApiQueryService.java), [equipment read facts](../backend/src/main/java/org/ash/inventory/service/EquipmentReadService.java), [event metrics](../backend/src/main/java/org/ash/inventory/service/EventMetricsService.java), [reports](../backend/src/main/java/org/ash/inventory/service/OperationalReportService.java), [client dependencies](../src/services/apiChanges.ts), and [planning readers](../backend/src/main/java/org/ash/inventory/orm/PlanningOrm.java).

Interface changes: `GET /api/general-orders` returns summaries without history; `GET /api/general-orders/{id}` returns detail/history with the same actor scope as the list. `GET /api/reports/{name}/export?generation=<generatedAt>` accepts the normal report filters and rejects a replaced generation with HTTP 409. The client retains its generation check. Manual reports remain query-only; stock commands never use the report cache.

Validation on P01–P05 (1 October 2026, builds/tests explicitly requested):

- `bun run build` passed (TypeScript and Vite production bundle). Vite reported a non-blocking chunk-size warning.
- `mvn -DargLine= package` passed (Java compilation, Quarkus production packaging and all **95 backend tests**, H2; zero failures/errors/skips).
- `bun test` passed: **13 client tests**, including selective/batched/unknown invalidation and terminal/session/transient retry behavior.
- ESLint and targeted lint on the added regression tests passed.
- Backend regressions cover summary responses omitting history, detail history and actor scope, filtered pinned exports, stale source snapshots and HTTP 409 after generation replacement. Existing suites exercise report rebuilds, maintenance/stock parity, equipment and planning reads.
- Earlier Java parse and Hibernate HQL grammar checks passed; the automated backend suite now also executes the covered ORM paths against H2.
- Documentation links and `git diff --check` passed.

No PostgreSQL baseline initialization, browser journey or performance trace was run. No schema changes were needed. No latency or measured SQL-count improvement is claimed.

Pending acceptance: mixed/all-empty image pages; stock parity for bulk/lot/serialized and restricted pools; large order histories; report monthly totals/cache eviction and rebuild/source changes during export; local/SSE/CSV request traces and terminal retries; overlapping/sequential planning, tied overrides and late/undated supply. Capture statement counts, result rows, timings and client requests on the same datasets before/after as described in [C09](REPOSITORY_REVIEW.md#10-c09-acceptance-and-performance-measurements-still-required). First report reads/cache misses still load stored JSON, and watermarks still scan source tables; normalized report rows/shared source revisions remain a later measured decision.
