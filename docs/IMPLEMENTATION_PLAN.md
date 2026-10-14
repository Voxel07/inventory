# Implementation Plan and Progress

This is the single open-work register: requirement gaps, the prioritized backlog, acceptance work and recent fixes. Old finding numbers (e.g. "old #15") are kept only as provenance.

## 1. Status rules

| Status | Meaning |
|---|---|
| Implemented | Behavior/components found in source; runtime acceptance is separate |
| Partial | Present behavior with a specific unmet requirement or architectural target |
| Planned | Named target has no corresponding current implementation |
| Deferred | Accepted finding that needs a decision or environment before implementation |
| Pending acceptance | Needs an executable/environment check |
| Done | Implemented; checks and remaining acceptance boundary are recorded in §7 |

Priorities: P1 stock/history/security and release acceptance, P2 architectural consolidation/scalability and missing workflows, P3 maintainability. Ordering is guidance, not a delivery date.

## 2. Current capability progress

| Capability | Status | Source evidence | Remaining issue |
|---|---|---|---|
| Item catalog, serialized assets, assemblies, images, labels | Implemented | CatalogService, StockManagementService; ItemForm/ItemDetail/AssetDetail | Legacy visibility PLAN-01 |
| Warehouse/location hierarchy and private access | Implemented | LocationHierarchyService, InventoryAccessService/InventoryAccess; StorageLocations/InventorySharing | Predicate simplification PLAN-01; browser policy acceptance |
| Ledger, positions, reservations, exact-asset stock | Implemented | InventoryOperationsService, PositionService, StockPolicy, OrderAllocationService | Contention/load acceptance; DB-enforced append-only FEAT-09 |
| Transfers, blind counts, lots/FEFO/quarantine | Implemented | TransferService, CountService, PositionService; StockOperations | Integrated and concurrent operation acceptance |
| Faction/general order lifecycle and custody | Partial | OrderService, GeneralOrderService, CustodyBalanceService; order components | Two model families PLAN-02; integrated pickup/reconciliation acceptance |
| Two-stage returns and member self-service | Implemented | ReturnSubmissionService, MemberService; ReturnedItems/Contributor | Real device/photo/custody acceptance |
| Damage, repair, maintenance blocking | Partial | LifecycleService, MaintenanceEvaluationService, MaintenancePolicy | Duplicate item/schedule maintenance PLAN-10 |
| Event planning, purchasing, receipts and supplier evidence | Implemented | PlanningService, PurchasingService; Procurement/PurchasingOperations | Environment export/media acceptance |
| Event attendees, people registry, predefined roles, food stamps and two-tab event timeline | Implemented | EventAttendees, EventTimeline, EventLogisticsService; baseline logistics tables | EventLogisticsApiTest and BaselineSchemaTest written, compile; not yet run (need PostgreSQL). Typecheck, changed-file lint and `tests/apiChanges.test.ts` pass; browser acceptance pending |
| Ownership, consent and loan/rental evidence | Implemented | EquipmentService, LoanService; EquipmentOwnership/LoansPanel | Integrated privacy/collection/return acceptance |
| Action inbox and reminders | Partial | ActionInboxService; ActionInboxContent | In-app only; no delivery channel FEAT-01 |
| Eight reports, CSV/PDF and imports | Implemented | OperationalReportService; ReportsPanel/CsvImportDialog | Export acceptance ACC-03; large lists PLAN-03; manual rebuild FEAT-06 |
| Offline queue/cold cached reads/correction | Implemented | offlineQueue, resourceFactory, useProgressiveList, SyncService | Field acceptance ACC-02; replacement PLAN-06; scope FEAT-07 |
| OIDC roles and session boundaries | Partial | ActorService, ProductionAuthGuard, oidcClient/authManager | Revocation bound GAP-03/ACC-01; library replacement PLAN-05 |
| REST/MCP policy and DTO boundaries | Partial | ApiModels/ApiResponses, ApiMapper, McpInventoryService; privacy projection/filter | Generated contract PLAN-04; privacy PLAN-01; MCP order/custody reads FEAT-08 |
| Outbox/SSE and cluster coordination | Implemented in source | DomainEventService, OutboxDispatcher, EventBroadcaster, cluster Compose | Real multi-node delivery/failure acceptance ACC-05; alerting OBS-01 |
| Responsive theme, shared UI, DE/EN | Implemented in source | theme.ts, Navigation, shared controls, i18n | Rendered accessibility/mobile acceptance; localization PLAN-09 |

Detailed product IDs and acceptance conditions live in [Product Requirements](PRODUCT_REQUIREMENTS.md). Existing regression ownership is mapped in [tests/README.md](../tests/README.md).

## 3. Requirement gaps

| ID | Priority / status | Requirement versus source | Resolution / next action |
|---|---|---|---|
| GAP-01 | P1 · Done | CAT-08: master data is retired, never deleted. Assemblies were hard-deleted; event deletion only checked orders and failed on other references | Assemblies have an `active` flag and are retired (REST `DELETE`, MCP `delete_assembly`); retired assemblies are hidden, cannot be ordered or damage-reported. Event occurrences are not master data: deletion stays allowed only while no orders, stock movements, return submissions or owner commitments reference them; planning overrides go with the event |
| GAP-02 | P2 · Done | The ledger is authoritative, but stock fell back to `Item.baseAmount` without an `added` movement | `base_amount` column and fallback removed. `ItemInput.amount` seeds the opening `added` movement on create only; updates with `amount` are rejected (400). `ItemResponse.amount` removed; clients use `stock` |
| GAP-03 | P1 · Partial | SEC-01's immediate end of server token use is not guaranteed by local JWT validation | Bound documented in [Authentik setup §4](AUTHENTIK_SETUP.md): 5-minute access tokens (recommended) or introspection. Verify with real Authentik (ACC-01) |
| GAP-04 | P1 · Done | ORD-04 lists written-off units, but faction orders never incremented `writtenOffQuantity`; orders with missing units stayed `partially_returned` and could never close | Faction return lines accept `writtenOff` (HQ admin, reason required). Missing units are settled first; bulk posts a custody write-off, serialized assets become `written_off` and inactive. Return checklist shows the field to HQ admins |

The nullable position unique constraint and application-level append-only contract are described in [Database Schema](DATABASE_SCHEMA.md).

## 4. Prioritized backlog

### Architecture

Dependency order is guidance; split into reviewable changes without compatibility adapters.

| ID | Priority / status | Work | Dependencies / definition of done |
|---|---|---|---|
| PLAN-01 | P2 · Partial | Consolidate privacy into scoped query predicates; remove reference-graph/post-filter dependence where safe and remove legacy visibility fields (old #9/#16) | Measure current reads first. Retain owner/HQ/grantee rules, nested/location/media redaction, accurate paging, REST/MCP parity and cache revocation |
| PLAN-02 | P2 · Planned | One `orders`/`order_lines` aggregate with `kind=faction/general`; replace general-order JSON line maps (old #15) | Preserve line/asset reservations, atomic pickup/return, write-off, cancellation, history, previous-year comparison and offline commands |
| PLAN-03 | P2 · Partial | Stop automatic full collection download; server paging/filter/sort, DataGrid server mode, targeted autocomplete and shared DataTable (old #11/#31) | Replace progressive draining per screen; retain `X-Filtered-Rows`, offline completeness, code resolution and query context. Validate large catalogs |
| PLAN-04 | P2 · Planned | Generate frontend contracts/client from OpenAPI with openapi-typescript/openapi-fetch (old #25) | Preserve supported operation interfaces, explicit DTOs, auth/session guards, errors and offline command adapters |
| PLAN-05 | P3 · Planned | Replace custom PKCE/session implementation with oidc-client-ts and react-oidc-context (old #24) | Only if the custom code causes problems. Preserve issuer/sub, role/faction refresh, rotating refresh token, logout, account isolation and token expiry |
| PLAN-06 | P3 · Planned | Query persister and persisted paused mutations replacing custom cache/queue plumbing (old #26) | Coordinate with PLAN-04. Keep account ownership, private exclusions, UUID idempotency, correction chains and explicit queued UI. No last-write-wins |
| PLAN-07 | P3 · Planned | react-hook-form + zod replacing per-field local state (old #27) | Shared form rules, client/API validation parity, media crop/attachments, accessible errors |
| PLAN-08 | P3 · Planned | React Router 7 data router/loaders (old #28) | Keep current routes, lazy behavior, session/query boundaries, guards and denied-route feedback |
| PLAN-09 | P3 · Partial | i18next keys only; remove inline German/English pairs (old #22) | Preserve every label/error/status, interpolation, date/money formatting and exported-document language |
| PLAN-10 | P2 · Partial | Maintenance state lives in schedules; remove duplicate item status/date/interval representation (old #17) | Update baseline, commands, projections, category defaults, reports and MCP together; preserve warnings and checkout blocking |
| PLAN-11 | P3 · Planned, measurement-dependent | Cache more reference data by committed revision (old #12) | Add only after profiling; never cache dynamic stock or widen private-resource access |

PLAN-05..09 replace working libraries without direct user value; schedule them only when the current code becomes a maintenance problem.

### Product features

| ID | Priority / status | Gap | Notes / decision needed |
|---|---|---|---|
| FEAT-01 | P1 · Deferred | Notifications never leave the app: `notifications.delivery_status` stays `pending`, reminders are stored but never fired, nothing runs on a schedule for overdue returns, expiry or maintenance | Choose channel(s): email (quarkus-mailer + SMTP) and/or Web Push for the PWA. Add a scheduled reminder job like the outbox/media purges |
| FEAT-02 | P1 · Deferred | No account offboarding: `app_users` has no active state; departed members keep private resources, custody, keeper roles and grants (PD-01) | Deactivated flag set when the IdP no longer returns the user, outstanding-custody report per user, bulk owner transfer |
| FEAT-03 | P1 · Deferred | No erasure/export/retention for personal data (PD-02..04 in [Personal data](DATABASE_SCHEMA.md#8-personal-data)) | Needs retention periods from the association; then pseudonymize `app_users`, scrub free-text fields and add purge jobs |
| FEAT-04 | P2 · Deferred | No reversal of a mistaken online movement linked to the original transaction (offline commands already have correction chains) | Reversal command with link, reason and permission; never edit the original row |
| FEAT-05 | P2 · Deferred | No order cut-off per event; no "copy last year's order as draft" (ORD-05 only compares) | Add `orderDeadline` to event occurrences; clone action on faction orders |
| FEAT-06 | P3 · Deferred | Report snapshots rebuild only manually | Rebuild stale snapshots on a schedule or on open using the existing source tokens |
| FEAT-07 | P2 · Deferred | Offline scope misses field tasks: blind counts, return acceptance, transfer receipt, member return submission without photo | Extend `/api/sync` command set; same replay/correction rules |
| FEAT-08 | P3 · Deferred | MCP has no order, custody or movement reads ("who has radio X?", "what is faction Y still holding?") | Read-only tools over existing scoped queries |
| FEAT-09 | P3 · Deferred | Append-only history is not database-enforced | Stock writes set `availability_after` with an UPDATE right after the INSERT, so a plain deny-UPDATE trigger would break every movement. Either compute the value before persisting or allow changes only to rows inserted by the current transaction; needs PostgreSQL integration tests |

### Operations

| ID | Priority / status | Gap | Notes |
|---|---|---|---|
| OPS-01 | P1 · Deferred | No checked-in backup job or restore script; WAL archiving, dumps and media sync are documented proposals | Backup container (pg_dump + bucket sync to the storage box) and a scripted restore drill; evidence goes to ACC-04 |
| OBS-01 | P2 · Partial | Application traces/logs/metrics implemented; external alerts and infrastructure signals pending | [Signals and alert conditions](OPENOBSERVE_SIGNALS.md); replication lag/WAL require infrastructure collection |

## 5. Delivery sequence

| Phase | Progress | Deliverable / exit condition |
|---|---|---|
| A — Documentation baseline | Done | Focused documents, overview links, source/target status, table inventory, prioritized gaps |
| B — Stock/history/session contracts | Partly done | GAP-01/02/04 done; GAP-03 revocation bound verified in ACC-01 |
| C — Missing operational workflows | Open | FEAT-01/02/03, OPS-01 |
| D — Consolidate core domain and privacy | Open | PLAN-01/02/10; authorization and transaction invariants retained across REST/MCP/replay |
| E — Scalable client data access | Open | PLAN-03/04 |
| F — Environment acceptance and release | Pending acceptance | ACC-01..05 evidence attached; no claim of HA or field readiness without checks |

## 6. Acceptance work register

| ID | Priority / status | Required check | Completion evidence |
|---|---|---|---|
| ACC-01 | P1 · Pending acceptance | Real Authentik login/refresh, issuer/sub binding, audience/role/faction updates, revoked/expired bearer rejection, provider logout and multiple tabs, SSE expiry | Configured token/introspection bound and observed REST/MCP/session behavior |
| ACC-02 | P1 · Pending acceptance | Integrated desktop/mobile catalog → preparation → pickup → return → write-off/close; physical camera/manual codes; offline cold launch, account switch, replay and conflict correction; rendered accessibility | Browser/device results with real API and failure scenarios; cached data never authorizes stock |
| ACC-03 | P2 · Pending acceptance | CSV imports/previews, QR print, order slips and CSV/PDF reports across browsers/languages | Reproducible fixtures, row results and visually inspected exports |
| ACC-04 | P1 · Pending acceptance | Real Garage/S3 upload/attachment/privacy/purge plus coordinated database/media backup and restore; logical replication startup/sequence recovery | Real bucket and restored data/media verified; measured recovery objectives |
| ACC-05 | P1 · Pending acceptance | Multi-node outbox duplicate/retry/lease/dead-letter behavior, shared rate limiting, SSE reconnect, node failures and realistic lock/load contention | Cluster/failure/load results; capacity/failover limitations documented |

The PostgreSQL-backed `@QuarkusTest` suites need a disposable database ([tests/README.md](../tests/README.md)); results older than the current revision are not current evidence.

## 7. Fix log

### 12 October 2026 — documentation and review fixes

Sorted by priority.

| Priority | Finding | Status | Change |
|---|---|---|---|
| P1 | GAP-04 faction orders with missing units could never close | Done | `ReturnLine.writtenOff`, OrderService write-off for bulk and serialized lines, checklist field for HQ admins |
| P1 | GAP-01 assemblies hard-deleted; event deletion hit FK errors for movements/returns/commitments | Done | Assembly retirement; full event-history guard; UI dialogs say "retire" and no longer claim history is deleted |
| P1 | Step 2 Cloudflare Worker sent requests to the wrong origin | Done | Rewritten Worker with cached readiness check; documented no-retry behavior |
| P1 | Cluster Compose hard-coded `DB_URL`/`REDIS_URL`/`S3_ENDPOINT`, so VPS 2 could not reach VPS 1; `up inventory-api-2` also started an empty local database | Done | Variables overridable, `--no-deps` documented, private-address port bindings for PostgreSQL/Valkey |
| P2 | GAP-02 `baseAmount` stock fallback | Done | Column, fallback and `ItemResponse.amount` removed; create-only opening amount |
| P2 | Telemetry endpoint pointed at non-existent host `openobserver`; cluster nodes had no OTEL settings; OpenObserve undocumented | Done | Host `openobserve`, OTEL/OIDC/proxy settings aligned in cluster Compose, `.env.example` entries, [Observability](TECHNICAL_REQUIREMENTS.md#7-observability) |
| P2 | Step 2 called VPS 2 "Reads / failover" although it has no database | Done | Node roles and limits clarified |
| P2 | Replication guide: PowerShell blocks for Linux hosts, `sslmode=prefer` | Done | Bash blocks, `disable` on private network or `verify-full`, sequence sync example |
| P2 | MCP `list_events` capped at 50, `list_storage_locations` unpaged | Done | `page`/`limit` on both (default 20, max 100) |
| P3 | Missing Authentik runbook, glossary, personal-data inventory, observability guide | Done | [Authentik setup](AUTHENTIK_SETUP.md), [Glossary](PRODUCT_REQUIREMENTS.md#9-glossary), [Personal data](DATABASE_SCHEMA.md#8-personal-data), [Observability](TECHNICAL_REQUIREMENTS.md#7-observability) |
| P3 | Review-process boilerplate in every document | Done | Removed; status distinctions kept |
| — | Notifications, offboarding, erasure, reversal, deadlines, report rebuild, offline scope, MCP order reads, DB append-only, backups, alerts | Deferred | FEAT-01..09, OPS-01, OBS-01 above |

Checks run: backend `mvn -o test-compile`; 26 DB-free backend unit tests; frontend typecheck, ESLint, 52 Bun tests and production build. Not run: PostgreSQL `@QuarkusTest` suites (no disposable database available), so schema validation of the `assemblies.active` / removed `base_amount` columns and the updated `InventoryMcpTest` / `PrivateInventoryApiTest` remain to be executed. No browser session, Authentik or deployment check.

## 8. Keeping progress current

Each completed change updates its requirement row, this register, the owning architecture document and any affected runbook, with the checks run and the remaining acceptance boundary. [Architecture overview](ARCHITECTURE.md) links the owners and operational guides.
