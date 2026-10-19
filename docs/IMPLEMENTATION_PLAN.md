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
| Item catalog, serialized assets, assemblies, images, labels | Implemented | CatalogService, StockManagementService; ItemForm/ItemDetail/AssetDetail | Browser/device and representative load acceptance |
| Location → section → storage place tree, bounded structure editor, labels and private access | Implemented | LocationHierarchyService, InventoryAccessService, scoped query predicates; StorageLocations/InventorySharing | Browser policy and hierarchy contention acceptance |
| Ledger, positions, reservations, exact-asset stock | Implemented | InventoryOperationsService, PositionService, StockPolicy, append-only baseline triggers | Representative contention/load acceptance |
| Transfers, blind counts, lots/FEFO/quarantine | Implemented | TransferService, CountService, PositionService; StockOperations | Integrated and concurrent operation acceptance |
| Faction/general order lifecycle and custody | Implemented | InventoryOrder, OrderService, CustodyBalanceService; shared commands/history/evidence | PLAN-02 implemented; runtime pickup/reconciliation acceptance pending |
| Two-stage returns and member self-service | Implemented | ReturnSubmissionService, MemberService; ReturnedItems/Contributor | Real device/photo/custody acceptance |
| Damage, repair, maintenance blocking | Implemented | LifecycleService, schedule-only MaintenanceEvaluationService/MaintenanceProjectionService | Real equipment/inspection acceptance |
| Runtime tracking (operating hours per event/order) | Implemented | RuntimeService, `runtime_entries`, `Item.tracksRuntime`; RuntimeReturnField/OperatingHoursDialog; RuntimeReturnApiTest | Browser acceptance |
| Event planning, purchasing, receipts and supplier evidence | Implemented | PlanningService, PurchasingService; Procurement/PurchasingOperations | Environment export/media acceptance |
| Event attendees, people registry, predefined roles, daily food stamps and crew catering timeline | Implemented | EventAttendees, EventTimeline, EventLogisticsService; baseline logistics tables | EventLogisticsApiTest and BaselineSchemaTest pass in the full PostgreSQL suite ([current validation](VALIDATION_2026_10_20.md)); browser acceptance pending |
| Ownership, consent and loan/rental evidence | Implemented | EquipmentService, LoanService; EquipmentOwnership/LoansPanel | Integrated privacy/collection/return acceptance |
| Action inbox, scheduled reminders and delivery | Implemented | ActionInboxService, NotificationDeliveryService; ActionInboxContent | Configure HTTPS gateway and verify delivery/recovery |
| Eight reports, CSV/PDF and imports | Implemented | OperationalReportService SQL paging/on-open rebuild; ReportsPanel/CsvImportDialog | Rendered exports and representative snapshot rebuild/load acceptance |
| Offline queue/cold cached reads/correction | Implemented | offlineQueue, explicit offlineSnapshot, fieldCommand, SyncService | Field/browser acceptance ACC-02; optional library replacement PLAN-06 |
| OIDC roles and session boundaries | Implemented | ActorService, AuthSessionService, EventStreamResource, ProductionAuthGuard | Provider revocation timing ACC-01; optional library replacement PLAN-05 |
| REST/MCP policy and DTO boundaries | Implemented | Scoped queries, explicit DTOs, targeted reference redaction, custody/movement MCP readers | Generated client is an optional architecture target PLAN-04 |
| Outbox/SSE and cluster coordination | Implemented in source | DomainEventService, OutboxDispatcher, EventBroadcaster, cluster Compose | Real multi-node delivery/failure acceptance ACC-05; alerting OBS-01 |
| Responsive theme, shared UI, DE/EN | Implemented in source | theme.ts, Navigation, shared controls, i18n | Rendered accessibility/mobile acceptance |

Detailed product IDs and acceptance conditions live in [Product Requirements](PRODUCT_REQUIREMENTS.md). Existing regression ownership is mapped in [tests/README.md](../tests/README.md).

## 3. Requirement gaps

| ID | Priority / status | Requirement versus source | Resolution / next action |
|---|---|---|---|
| GAP-01 | P1 · Done | CAT-08: master data is retired, never deleted. Assemblies were hard-deleted; event deletion only checked orders and failed on other references | Assemblies have an `active` flag and are retired (REST `DELETE`, MCP `delete_assembly`); retired assemblies are hidden, cannot be ordered or damage-reported. Event occurrences are not master data: deletion stays allowed only while no orders, stock movements, return submissions or owner commitments reference them; planning overrides go with the event |
| GAP-02 | P2 · Done | The ledger is authoritative, but stock fell back to `Item.baseAmount` without an `added` movement | `base_amount` column and fallback removed. `ItemInput.amount` seeds the opening `added` movement on create only; updates with `amount` are rejected (400). `ItemResponse.amount` removed; clients use `stock` |
| GAP-03 | P1 · Done locally; provider acceptance pending | Logout/deactivation must stop local bearer use | Hashed-token revocation on logout; per-request inactive guard; SSE rechecks within ten seconds. Provider group removal remains bounded by expiry/introspection; verify real Authentik in ACC-01 |
| GAP-04 | P1 · Done | ORD-04 lists written-off units, but faction orders never incremented `writtenOffQuantity`; orders with missing units stayed `partially_returned` and could never close | Faction return lines accept `writtenOff` (HQ admin, reason required). Missing units are settled first; bulk posts a custody write-off, serialized assets become `written_off` and inactive. Return checklist shows the field to HQ admins |

The NULLS NOT DISTINCT position unique constraint and database-enforced append-only contract are described in [Database Schema](DATABASE_SCHEMA.md).

## 4. Prioritized backlog

### Architecture

Dependency order is guidance; split into reviewable changes without compatibility adapters.

| ID | Priority / status | Work | Dependencies / definition of done |
|---|---|---|---|
| PLAN-01 | P2 · Done | Scope operational reads before paging; remove global denied-ID scans | PostgreSQL visibility predicates cover operational relationships; typed inbox references and targeted DTO/media redaction remain defense in depth. Privacy regression suite passes; load targets remain to measure |
| PLAN-02 | Done | One orders/order_lines aggregate with kind=faction/general and shared lifecycle/replay | Unified order, custody, allocation and sync scenarios pass in the current PostgreSQL suite; real workflow acceptance remains ACC-02 |
| PLAN-03 | P2 · Done (on-demand paging, server filters/sort, server-search pickers; no shared DataTable extraction) | Stop automatic full collection download; server paging/filter/sort, DataGrid server mode, targeted autocomplete and shared DataTable (old #11/#31) | Lists load pages on demand (`usePagedList`, `X-Has-More`); pickers search the server (`ItemAutocomplete`); complete reads only for bounded sets (location tree, one item's positions/assets/lots, user pickers, one event's faction orders), exports, imports and the offline snapshot |
| PLAN-04 | P2 · Planned | Generate frontend contracts/client from OpenAPI with openapi-typescript/openapi-fetch (old #25) | Preserve supported operation interfaces, explicit DTOs, auth/session guards, errors and offline command adapters |
| PLAN-05 | P3 · Planned | Replace custom PKCE/session implementation with oidc-client-ts and react-oidc-context (old #24) | Only if the custom code causes problems. Preserve issuer/sub, role/faction refresh, rotating refresh token, logout, account isolation and token expiry |
| PLAN-06 | P3 · Planned | Query persister and persisted paused mutations replacing custom cache/queue plumbing (old #26) | Coordinate with PLAN-04. Keep account ownership, private exclusions, UUID idempotency, correction chains and explicit queued UI. No last-write-wins |
| PLAN-07 | P3 · Planned | react-hook-form + zod replacing per-field local state (old #27) | Shared form rules, client/API validation parity, media crop/attachments, accessible errors |
| PLAN-08 | P3 · Planned | React Router 7 data router/loaders (old #28) | Keep current routes, lazy behavior, session/query boundaries, guards and denied-route feedback |
| PLAN-09 | Done | i18next keys only, typed translators, interpolation/plural checks | 2,639 matching DE/EN keys and 3,292 key-based calls on 20 October 2026; current translation validation passes |
| PLAN-10 | P2 · Done | Schedules are the stored maintenance policy; item/asset status and dates are derived | Duplicate entity/input fields removed; batched summaries, per-asset category defaults, selected-schedule inspection and calendar/meter filtering aligned. PostgreSQL checks pass |
| PLAN-11 | P3 · Planned, measurement-dependent | Cache more reference data by committed revision (old #12) | Add only after profiling; never cache dynamic stock or widen private-resource access |

PLAN-04..08 are optional framework/client replacements; PLAN-11 is measurement-dependent caching. They remain architecture choices rather than missing product behavior. PLAN-09 is already delivered. Redis findings REV-04/05 and Redis/cluster implementation acceptance are explicitly excluded from this remediation.

### Product features

| ID | Priority / status | Delivered feature | Contract / acceptance boundary |
|---|---|---|---|
| FEAT-01 | P1 · Implemented | Scheduled notices and optional external delivery | Due reminders/daily digest; HTTPS gateway, UUID deduplication, skip-locked leases, eight attempts/backoff and explicit delivery states. Gateway deployment acceptance required |
| FEAT-02 | P1 · Implemented | Account offboarding and obligation transfer | Active state, last-admin/self guards, custody/keeper/ownership overview, active successor and per-resource transfer results. IdP directory synchronization remains an operator/provider concern |
| FEAT-03 | P1 · Implemented | Person export, guarded pseudonymization and transient retention | Admin ZIP with row/size caps; resolved obligations required; account/attendee/access cleanup; configurable bounded purge. Historical free text/media/logs/backups require operator review |
| FEAT-04 | P2 · Implemented | Linked compensating reversal of latest direct movements | Admin-only reason/UUID, current state/obligation checks, exact asset restoration and signed counters; document workflows retain their own reconciliation |
| FEAT-05 | P2 · Implemented | Event deadline and copy an earlier order as draft | UTC deadline enforced on create/edit/submit; faction UI clone action; both order kinds supported by copy service with current access/catalog validation |
| FEAT-06 | P3 · Implemented | Automatic stale report refresh | Rebuild on open when absent/changed/older than five minutes, per-report transaction fence and generation-pinned bounded exports |
| FEAT-07 | P2 · Implemented | Additional offline field operations | Count lines/completion, transfer receipt, return acceptance, photo-free member return. Same account ownership, idempotency and correction chain; loaded forms/read data required |
| FEAT-08 | P3 · Implemented | Scoped custody and movement MCP reads | list_custody/list_movements use existing authorized business queries and bounded page responses; total tool count is 31 |
| FEAT-09 | P3 · Implemented | Database-enforced append-only history | Committed history rejects UPDATE/DELETE; finalization is allowed only in the inserting transaction. Integration checks verify rejection and successful compensating reversal |

### Operations

| ID | Priority / status | Delivered operation | Contract / acceptance boundary |
|---|---|---|---|
| OPS-04 | P1 · Implemented; deployment acceptance pending | Coordinated encrypted backup and isolated restoration | pg_dump + media snapshot + checksums + age, optional rclone destination, systemd timer, fresh network-isolated restore. Local schema/media fixture restored in six seconds; real dataset/offsite acceptance ACC-04 remains |
| OBS-01 | P2 · Implemented except Redis; live acceptance pending | Independent infrastructure collection, alert/dashboard payloads and provisioning | Numeric readiness/DB/outbox/delivery/disk/WAL/transport lag/backup/silence signals, ten alerts and systemd timer. Collector SQL checked locally; real destination/topology acceptance remains |

## 5. Delivery sequence

| Phase | Progress | Deliverable / exit condition |
|---|---|---|
| A — Documentation baseline | Done | Focused documents, overview links, source/target status, table inventory, prioritized gaps |
| B — Stock/history/session contracts | Implemented; acceptance open | GAP-01..04 and FEAT-09 delivered; real IdP revocation ACC-01 remains |
| C — Missing operational workflows | Implemented; deployment acceptance open | FEAT-01..09, OPS-04 and non-Redis OBS-01 delivered; configuration/field acceptance remains |
| D — Consolidate core domain and privacy | Done in source | PLAN-01/02/10; current backend regression evidence in the dated validation record |
| E — Scalable client data access | Functional work done | PLAN-03 delivered; PLAN-04 is an optional generated-client choice |
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

### 20 October 2026 — follow-up review

Corrected the remaining schema/PRD/offline-help drift and baseline/evidence wording. Reversals record the executor separately from the custody beneficiary; hidden depth is redacted and obscured-parent edits preserve the parent; report reads serve stale snapshots under rebuild contention; structure limits include the root; copied faction drafts retain assembly grouping. New PostgreSQL/HTTP regressions cover the previously missing paths. REV-28 records measured movement SQL and an optimized predicate; broader end-to-end load acceptance remains open. The measured first-page/deep-offset results and portable fixture/probe are in Performance Acceptance.

### 20 October 2026 — non-Redis review and functional roadmap

All 20 non-Redis review findings and FEAT-01..09, PLAN-01/10, GAP-03 local session enforcement, OPS-04 and non-Redis OBS-01 are implemented. [Review progress](REVIEW_DOCS_VS_CODE.md) tracks the prioritized findings and additional fixes. [Validation](VALIDATION_2026_10_20.md) records current backend/frontend checks and the isolated backup/restore drill. Real IdP, browser/device, gateway, S3/offsite storage, live alerts and representative load remain acceptance work, not claims of production readiness.

### 15–19 October 2026 — changes after the documentation baseline

| Priority | Change | Status | Evidence |
|---|---|---|---|
| P1 | One order aggregate for faction and general orders (PLAN-02, `7178114`); shadowed order sub-routes moved into the order resources (`c2cf8a4`) | Done | Historical 207/0 claim; superseded by [current validation](VALIDATION_2026_10_20.md) |
| P1 | Duplicate-insert races on an account's first overlapping requests (`a72871f`) | Done | Commit only; no separate acceptance record |
| P2 | Native executable image, `-Xmx512m -Xmn256m`, CI publishes `Dockerfile.native` (`1d63cfa`) | Done | [Native memory benchmark](NATIVE_MEMORY_BENCHMARK.md) |
| P2 | Runtime tracking (`runtime_entries`, MNT-02) and sibling-unique location codes with full codes (LOC-01) (`0f38e8f`) | Done | `RuntimeReturnApiTest`, `LocationCodeTest` |
| P2 | Documentation re-aligned with source; open findings in [docs vs code review](REVIEW_DOCS_VS_CODE.md) | Done | Static review |

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
| — | Functional/operational roadmap was deferred on 12 October | Historical | Superseded by the 20 October remediation above |

Historical 12 October checks (superseded by the dated current validation): backend `mvn -o test-compile`; 26 DB-free backend unit tests; frontend typecheck, ESLint, 52 Bun tests and production build. Not run: PostgreSQL `@QuarkusTest` suites (no disposable database available), so schema validation of the `assemblies.active` / removed `base_amount` columns and the updated `InventoryMcpTest` / `PrivateInventoryApiTest` remain to be executed. No browser session, Authentik or deployment check.

## 8. Keeping progress current

Each completed change updates its requirement row, this register, the owning architecture document and any affected runbook, with the checks run and the remaining acceptance boundary. [Architecture overview](ARCHITECTURE.md) links the owners and operational guides.
