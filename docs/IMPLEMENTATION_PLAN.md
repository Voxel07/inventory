# Implementation Plan and Progress

Reviewed: 12 October 2026 · source baseline: `82863bd` plus the working tree.

This is the current progress register and prioritized comparison of implementation with the previous architecture and all six pre-existing docs-folder files. It supersedes broken references to `REPOSITORY_REVIEW.md` and `CODE_REVIEW_2026-10-05.md`; their original finding numbers are retained only as provenance where the former architecture supplied them. This review changed documentation only.

## 1. Status and evidence rules

| Status | Meaning |
|---|---|
| Implemented | Behavior/components found in source; runtime acceptance is separate |
| Partial | Present behavior with a specific unmet requirement or architectural target |
| Planned | Named target has no corresponding current implementation |
| Pending acceptance | Needs an explicitly authorized executable/environment check |
| Done | Work completed in this documentation pass |

Priorities below are review recommendations: P1 stock/history/security and release acceptance, P2 architectural consolidation/scalability, P3 maintainability. Ordering is not a measured estimate or committed delivery date. No application builds, tests, live UI checks, database operations or deployment actions ran in this review, consistent with [agent.md](../agent.md).

Review inputs: original `ARCHITECTURE.md`, deployment steps, offline/MCP guides, replication guide, package/POM/runtime configuration, route/access/theme code, offline/auth/query code, baseline SQL/models, catalog/stock/order/report/privacy/outbox services, MCP adapters and the test inventory. Existing graph traversal found references to removed architecture files and older source locations; it was treated as an orientation aid and current source was checked directly. This is not an exhaustive correctness proof for every handler or concurrency path.

## 2. Current capability progress

| Capability | Status | Source evidence | Remaining issue |
|---|---|---|---|
| Item catalog, serialized assets, assemblies, images, labels | Partial | CatalogService, StockManagementService; ItemForm/ItemDetail/AssetDetail | Broad retirement requirement GAP-01; legacy visibility PLAN-01 |
| Warehouse/location hierarchy and private access | Implemented | LocationHierarchyService, InventoryAccessService/InventoryAccess; StorageLocations/InventorySharing | Predicate simplification PLAN-01; browser policy acceptance |
| Ledger, positions, reservations, exact-asset stock | Partial | InventoryOperationsService, PositionService, StockPolicy, OrderAllocationService | Old opening amount path GAP-02; contention/load acceptance |
| Transfers, blind counts, lots/FEFO/quarantine | Implemented | TransferService, CountService, PositionService; StockOperations | Integrated and concurrent operation acceptance |
| Faction/general order lifecycle and custody | Partial | OrderService, GeneralOrderService, CustodyBalanceService; order components | Two model families PLAN-02; integrated pickup/reconciliation acceptance |
| Two-stage returns and member self-service | Implemented | ReturnSubmissionService, MemberService; ReturnedItems/Contributor | Real device/photo/custody acceptance |
| Damage, repair, maintenance blocking | Partial | LifecycleService, MaintenanceEvaluationService, MaintenancePolicy | Duplicate item/schedule maintenance PLAN-10 |
| Event planning, purchasing, receipts and supplier evidence | Implemented | PlanningService, PurchasingService; Procurement/PurchasingOperations | Environment export/media acceptance |
| Ownership, consent and loan/rental evidence | Implemented | EquipmentService, LoanService; EquipmentOwnership/LoansPanel | Integrated privacy/collection/return acceptance |
| Action inbox and reminders | Implemented | ActionInboxService; ActionInboxContent | Notification/reminder behavior in running environment |
| Eight reports, CSV/PDF and imports | Implemented | OperationalReportService; ReportsPanel/CsvImportDialog | Export acceptance ACC-03; large lists PLAN-03 |
| Offline queue/cold cached reads/correction | Implemented | offlineQueue, resourceFactory, useProgressiveList, SyncService | Field acceptance ACC-02; replacement PLAN-06 |
| OIDC roles and session boundaries | Partial | ActorService, ProductionAuthGuard, oidcClient/authManager | Revocation contract/configuration ACC-01; library replacement PLAN-05 |
| REST/MCP policy and DTO boundaries | Partial | ApiModels/ApiResponses, ApiMapper, McpInventoryService; privacy projection/filter | Generated contract PLAN-04; privacy PLAN-01 |
| Outbox/SSE and cluster coordination | Implemented in source | DomainEventService, OutboxDispatcher, EventBroadcaster, cluster Compose | Real multi-node delivery/failure acceptance ACC-05 |
| Responsive theme, shared UI, DE/EN | Implemented in source | theme.ts, Navigation, shared controls, i18n | Rendered accessibility/mobile acceptance; localization PLAN-09 |

Detailed product IDs and acceptance conditions live in [Product Requirements](PRODUCT_REQUIREMENTS.md). Existing regression ownership is mapped in [tests/README.md](../tests/README.md); authored tests and historical executions are different evidence levels.

## 3. Source-confirmed requirement gaps

| ID | Priority / status | Requirement versus current source | Evidence / next action |
|---|---|---|---|
| GAP-01 | P1 · Partial | CAT-08 says master data is retired, never deleted. Items/locations retire, but assemblies and unlinked events are deleted | [CatalogService](../backend/src/main/java/org/ash/inventory/service/CatalogService.java): `deleteAssembly` removes composition/entity/policy; `deleteEvent` removes an event after checking linked orders. Decide whether to narrow the requirement or implement retirement consistently, including code/history visibility and FKs. Do not report CAT-08 complete |
| GAP-02 | P2 · Partial | Architecture presents the stock ledger as authoritative and rejects compatibility layers, but stock calculation still falls back to `Item.baseAmount` when no `added` movement exists | [InventoryOperationsService](../backend/src/main/java/org/ash/inventory/service/InventoryOperationsService.java): `stock` reads `Item.baseAmount`. Make opening balances canonical ledger entries and remove the alternate path, or explicitly retain and specify it as a current rule. Preserve exact-asset semantics and API stock parity |
| GAP-03 | P1 · Partial | SEC-01's immediate end of server token use is not guaranteed by local JWT validation | [application.properties](../backend/src/main/resources/application.properties) defaults JWT introspection off; [oidcClient](../src/services/oidcClient.ts) performs revocation. Establish an explicit revocation bound and acceptance test with real Authentik (ACC-01) |

The nullable position unique constraint and application-level append-only contract are documented accurately in [Database Schema](DATABASE_SCHEMA.md); this source review alone does not prove a duplicate-row race or an app audit mutation defect.

## 4. Prioritized implementation backlog

All entries are open. Dependency order is guidance; split into reviewable changes without compatibility adapters. Update the corresponding document and progress row when the work is actually completed.

| ID | Priority / status | Work and former architecture reference | Dependencies / definition of done |
|---|---|---|---|
| PLAN-01 | P2 · Partial | Consolidate privacy into scoped query predicates; remove reference-graph/post-filter dependence where safe and remove legacy visibility fields (old #9/#16) | Measure current reads first. Retain owner/HQ/grantee rules, nested/location/media redaction, accurate paging, REST/MCP parity and cache revocation |
| PLAN-02 | P2 · Planned | One `orders`/`order_lines` aggregate with `kind=faction/general`; replace general-order JSON line maps (old #15) | Edit baseline/entities/services/contracts directly. Preserve line/asset reservations, atomic pickup/return, cancellation, history, previous-year comparison and offline commands |
| PLAN-03 | P2 · Partial | Stop automatic full collection download; server paging/filter/sort, DataGrid server mode, targeted autocomplete and shared DataTable (old #11/#31) | Backend already has bounded queries. Replace progressive draining per screen; retain `X-Filtered-Rows`, offline completeness, code resolution and query context. Validate large catalogs |
| PLAN-04 | P2 · Planned | Generate frontend contracts/client from OpenAPI with openapi-typescript/openapi-fetch (old #25) | Preserve supported operation interfaces, explicit DTOs, auth/session guards, errors and offline command adapters |
| PLAN-05 | P2 · Planned | Replace custom PKCE/session implementation with oidc-client-ts and react-oidc-context (old #24) | Agree revocation/cold-start semantics first. Preserve issuer/sub, role/faction refresh, rotating refresh token, logout, account isolation and token expiry |
| PLAN-06 | P2 · Planned | Query persister and persisted paused mutations replacing custom cache/queue plumbing (old #26) | Coordinate with PLAN-04/05. Keep account ownership, private exclusions, UUID idempotency, correction chains, retained failures/history and explicit queued UI. No last-write-wins |
| PLAN-07 | P3 · Planned | react-hook-form + zod replacing per-field local state (old #27) | Shared form rules, client/API validation parity, media crop/attachments, accessible errors and controlled quantity inputs |
| PLAN-08 | P3 · Planned | React Router 7 data router/loaders (old #28) | Keep current routes, lazy behavior, session/query boundaries, guards and denied-route feedback |
| PLAN-09 | P3 · Partial | i18next keys only; remove inline German/English pairs (old #22) | Preserve every label/error/status, interpolation, date/money formatting and exported-document language |
| PLAN-10 | P2 · Partial | Maintenance state lives in schedules; remove duplicate item status/date/interval representation (old #17) | Update baseline, commands, projections, category defaults, reports and MCP together; preserve date/hour/usage warnings, missing-meter rules and checkout blocking |
| PLAN-11 | P3 · Planned, measurement-dependent | Cache more reference data by committed revision, e.g. locations/categories/maintenance policies (old #12) | Add only after profiling; never cache dynamic stock or widen private-resource access. Keep multi-node revision behavior |

## 5. Delivery sequence

| Phase | Progress | Deliverable / exit condition |
|---|---|---|
| A — Establish documentation baseline | Done | Six focused documents, overview links, source/target status, table inventory, corrected stale guidance and prioritized gaps |
| B — Resolve stock/history/session contracts | Open | GAP-01/02 design decisions implemented or requirements explicitly amended; GAP-03/ACC-01 revocation policy established |
| C — Consolidate core domain and privacy | Open | PLAN-01/02/10; authorization and transaction invariants retained across REST/MCP/replay |
| D — Make client contracts and data access scalable | Open | PLAN-03/04, then PLAN-05/06 with deliberate offline/session semantics |
| E — Standardize UI maintenance | Open | PLAN-07/08/09; measured PLAN-11 if justified |
| F — Environment acceptance and operational release | Pending acceptance | ACC-01..05 evidence attached, remaining risks explicit; no claim of HA or field readiness without checks |

No phase completion percentage is inferred from feature presence. Product breadth is largely present; unfinished refactors and deployment acceptance remain distinct work.

## 6. Acceptance work register

| ID | Priority / status | Required check | Completion evidence |
|---|---|---|---|
| ACC-01 | P1 · Pending acceptance | Real Authentik login/refresh, issuer/sub binding, audience/role/faction updates, revoked/expired bearer rejection, provider logout and multiple tabs, SSE expiry | Recorded configured token/introspection bound and observed REST/MCP/session behavior |
| ACC-02 | P1 · Pending acceptance | Integrated desktop/mobile catalog → preparation → pickup → return; physical camera/manual codes; offline cold launch, account switch, replay and conflict correction; rendered accessibility | Browser/device results with real API and failure scenarios; cached data never authorizes stock |
| ACC-03 | P2 · Pending acceptance | CSV imports/previews, QR print, order slips and CSV/PDF reports across browsers/languages | Reproducible fixtures, row results and visually inspected exports |
| ACC-04 | P1 · Pending acceptance | Real Garage/S3 upload/attachment/privacy/purge plus coordinated database/media backup and restore; logical replication startup/sequence recovery | Real bucket and restored data/media verified; measured recovery objectives |
| ACC-05 | P1 · Pending acceptance | Multi-node outbox duplicate/retry/lease/dead-letter behavior, shared rate limiting, SSE reconnect, node failures and realistic lock/load contention | Cluster/failure/load results; reachable multi-host endpoints and capacity/failover limitations documented |

Historical architecture text reported 163 PostgreSQL backend tests, 52 Bun tests, 157 REST handlers, MCP coverage, 21 browser-media assertions and builds/typecheck/lint on **5 October 2026**, plus sample REST/MCP smoke. This is a historical claim from the previous architecture, not a fresh result for `82863bd`. The linked `TEST_REVIEW_2026-10-05.md` is absent in the current working tree; [tests/README.md](../tests/README.md) remains the available test inventory. Do not reproduce those numbers as current passing checks.

## 7. Documentation drift and progress in this pass

| ID | Priority / status | Finding | Resolution |
|---|---|---|---|
| DOC-01 | P2 · Done | One architecture file mixed product requirements, frameworks, UI flow, schema, targets and historical verification | Created six owners and changed ARCHITECTURE.md to the overview |
| DOC-02 | P2 · Done | OFFLINE_MODE.md said collection queries pause on a cold offline start | Corrected to source `offlineFirst` in useProgressiveList/useResourceApi/referenceDataService; field acceptance remains open |
| DOC-03 | P2 · Done | Logical replication guide said dev uses Hibernate update | Corrected: all profiles use Flyway baseline and Hibernate validate |
| DOC-04 | P2 · Done | MCP permission text predated private-resource owner/editor policies and implied every location is shared | Updated shared-versus-private service rights and location policy; retained transport details |
| DOC-05 | P2 · Done | Architecture/MCP/offline/root/backend readmes linked removed review/domain files | Repointed current links to this register or technical requirements; absent historical test-review evidence is explicitly recorded |
| DOC-06 | P2 · Done | Purchase supply was described as transit alongside actual transfers; retirement marked complete despite deletion paths | Clarified ordered versus physical transit; CAT-08 now Partial with GAP-01 |
| DOC-07 | P2 · Done | Deployment prose could be read as delivered failover/backup automation | Clarified proposed multi-host topology, logical replication and unmeasured recovery goals; preserved runbooks |
| DOC-08 | P3 · Done | Existing graph references removed files and outdated snapshots | Used graph only for orientation; reviewed current source for final documents |

Documentation validation in this pass: local Markdown file links, preservation of all existing detailed product requirement IDs, table inventory against all CREATE TABLE declarations, cross-document plan references and whitespace/diff review. Application acceptance remains pending.

## 8. Keeping progress current

Each completed implementation change should update its requirement row, this register, the owning architecture document and any affected runbook. Record the actual revision, checks run and remaining acceptance boundary. Keep old finding numbers as provenance only; current IDs above are the working references. [Architecture overview](ARCHITECTURE.md) links the owners and operational guides.
