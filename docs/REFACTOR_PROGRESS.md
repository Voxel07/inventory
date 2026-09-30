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

## U01–U02

Implemented **1 October 2026**. Earlier A/P build and suite results do not validate these changes.

| Finding | Status | Change |
|---|---|---|
| U01 | Implemented | One preparation draft owns item/assembly quantities, exact asset assignments and source locations. Guarded resets include route/order identity, revision, saved sources/quantities/assignments, requested quantities, workflow status and session/permission generation. Unchanged refetches and failed saves retain unsaved edits; changed server preparation replaces the entire draft. Display and submission use the same sources, and clearing a source selects the item default. |
| U02 | Implemented | Item pages and details populate exact item entries within the existing account/role/faction catalog namespace. A page and its entries share one IndexedDB transaction/download timestamp; filtered/page caches remain query-specific. Detail queries attempt offline fallback on the first fetch. Successful create/update refreshes the exact entry; deletion and online 403/404 remove it. Item precaching no longer requests page zero separately. |

Owners: [preparation draft](../src/pages/FactionOrderDetail.tsx), [item cache opt-in](../src/services/inventoryService.ts), [resource reads/writes](../src/services/resourceFactory.ts), [IndexedDB entries](../src/services/offlineQueue.ts), [detail query policy](../src/hooks/useResourceApi.ts), and [remaining catalog precache](../src/services/apiClient.ts).

Cache coverage is explicit: only downloaded items are available offline, including unvisited details from later or filtered list pages. An item never downloaded has no fallback. Item fallback does not search a base/partial catalog, and cache reads never advance the original timestamp. Role/faction changes use a different namespace; obsolete session results still fail the A02 generation checks. Stock remains informational while cached. No API/schema changes, compatibility reads or database version upgrades were introduced.

Validation (1 October 2026): `bun ./node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` passed; `bun ./node_modules/eslint/bin/eslint.js src --max-warnings 0` passed, and targeted lint passed again after the final source edit. Documentation file links and `git diff --check` passed. Builds and regression suites were not run because `agent.md` requires an explicit execution request; browser journeys remain pending.

Pending acceptance: A→B orders with shared/different items; source-only refetch, unchanged dirty refetch, cleared default source, failed/save/reopen and permission change; >100 items, visited and unvisited downloaded details, never-downloaded details, filtered catalogs, cold start, 403/404 then offline, catalog updates/deletions, A→B→A and delayed IndexedDB completion. Browser acceptance should confirm displayed/submitted source IDs and visible cache timestamps. C09 remains open.

## MCP R01–R02

Implemented **1 October 2026** after the fresh repository review. Runtime acceptance remains open; earlier A/P builds and test results do not validate this change.

| Finding | Source status | Change |
|---|---|---|
| R01 | Implemented | Production authentication covers `/mcp` and `/mcp/*`, including root/discovery/session/SSE requests. Shared OIDC audience validation and protected-resource metadata enabled. Item/assembly mutations require managers; event mutations require planners. Item, asset, position, component, category and event item-map reads follow canonical visibility; operational item/asset/alert counts are scoped. Static resources and prompts resolve the actor. |
| R02 | Implemented | Thin MCP adapters call transactional McpInventoryService and existing catalog/query/stock/position owners. Removed direct EntityManager use, duplicated catalog writers/SKU generation, fabricated administrator, independent initial-stock handling and per-item/component queries. Shared typed payloads/results, canonical real-actor ledger/outbox publication, validation/locks/media/tracking guards, retire-only item deletion and linked-event order checks. |

Owners: [MCP adapters](../backend/src/main/java/org/ash/inventory/mcp/InventoryMcpTools.java), [transactional MCP boundary](../backend/src/main/java/org/ash/inventory/service/McpInventoryService.java), [catalog commands](../backend/src/main/java/org/ash/inventory/service/CatalogService.java), [scoped query filters](../backend/src/main/java/org/ash/inventory/orm/CatalogOrm.java), [shared request actor](../backend/src/main/java/org/ash/inventory/helper/security/ActorService.java), and [configuration](../backend/src/main/resources/application.properties). The [MCP guide](MCP_SUPPORT.md) replaces the superseded parameter/response guide; the [repository review](REPOSITORY_REVIEW.md) was updated in place.

Create/update tools now accept nested ApiModels inputs with REST update semantics. Catalog responses use ApiResponses; operational MCP projections remain explicit records. Asset lists require an item and support status filtering before bounded pagination. Search adds a zero-based page and applies exact category filtering in ORM. Domain exceptions become MCP tool errors after the service transaction exits. Blocking tool execution is explicit.

Stock projections use batched ledger/assets/reservations and equipment/maintenance facts. Low-stock deficits use canonical usable availability and cannot be negative. Serialized creation has assets without bulk positions; unlocated bulk uses the shared ledger path. Position reads include prepared general/faction reservations, lot/damage/quarantine and whole-pool contributor/maintenance/consent holds. Shared PositionOrm readers now include remaining `partially_released` reservations, matching physical stock's open-reservation states. Maintenance alerts evaluate date/hours/usage schedules with shared counters, retaining unknown evidence. Aggregate reads still scan visible catalog batches; no measured performance improvement is claimed.

Targeted regression source: [InventoryMcpTest.java](../backend/src/test/java/org/ash/inventory/InventoryMcpTest.java) covers shared CRUD contracts, real actor/outbox, serialized and unlocated stock, invalid-command rollback, purchase-linked deletion, prepared/partially released reservations, contributor holds, meter schedules, person/group/nested/category/event visibility and changing role on the same HTTP session. [InventoryMcpAuthenticationTest.java](../backend/src/test/java/org/ash/inventory/InventoryMcpAuthenticationTest.java) covers anonymous root/subpath requests and actor-header spoofing under the production-equivalent path policy with development authentication disabled.

Validation: Java sources parsed without syntax errors; installed MCP/Quarkus APIs and request/identity context propagation inspected; method/record/enum contracts, persistence boundaries, document links/anchors and whitespace checked. **No compilation, build or test suite was run**, following `agent.md`. Authored cases are not passing evidence. No schema or database changes were made.

Pending acceptance: production valid/expired/wrong-audience OIDC tokens (including the shared REST audience check), role/group/person scope, SSE/session/discovery denial, JSON schema binding and tool errors, lot/serialized/restricted/transit parity, connected catalog SSE/ETag refresh and actual SQL/row/latency counts. [C09](REPOSITORY_REVIEW.md#10-c09-acceptance-and-performance-measurements-still-required) remains open. R03–R06 were not implemented in this MCP change.
