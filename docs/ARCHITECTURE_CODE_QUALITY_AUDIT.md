# Architecture and code-quality audit

Date: 15 October 2026 · Source revision: `e4af25f` · Status: **remediated in the working tree on branch `review_1` (uncommitted); see "Remediation status"**.

## Remediation status (15 October 2026, uncommitted working tree)

Verification (all run against the final working tree): backend `mvn test` against PostgreSQL 18, frontend `tsc -b` (app, node and the new fixtures project, all `strict`) with TS 7 and TS 6, `eslint .`, `bun test`. Results are listed under "Verification" below. The browser previews were rendered headlessly (Firefox) against the Vite dev server.

Ordered by priority. Every finding was fixed except the remainder listed as "Open" under H12 and L13.

| Finding | Status | Evidence |
|---|---|---|
| H01 | Done | `StockPolicy.conditionedState` used by condition changes, damage reports and damage resolution; `AuditFixesApiTest` |
| H02 | Done | `out_of_service` flags, per-asset `next_maintenance_due`, status derived by `MaintenancePolicy`; `recordMaintenance` scoped to item or asset; `AuditFixesApiTest` |
| H03 | Done | Typed references only (whole-UUID values and UUID keys, free-text fields skipped), nested redaction, no 404 after committed writes, legacy `visibilityScope`/assigned user/group removed; `PrivacyProjectionServiceTest`, `AuditFixesApiTest` |
| H04 + L05 | Done | Shared `authSession.ts` schema + decoder, errors propagate, sign-out marker, `AuthPersistenceError`; `tests/authStorage.test.ts` |
| H05 + L14 | Done | `${DB_PASSWORD:?}` in both compose files (checked with `docker compose config`), cluster env anchors, rate-limit settings forwarded, INFO log default |
| H06 | Done | `@Paged` endpoints send `X-Has-More`; `Page<T>` envelope survives mapping and the offline cache; `pageCompleteness.ts`/`X-Filtered-Rows` removed; `sessionIsolation.test.ts` |
| H07 | Done | Server filters/sort for items, locations, assemblies, orders, general orders, transactions, damage; `usePagedList` loads pages on demand with "Load more"; `ItemAutocomplete` (server search), `useItemsByIds`, `/api/inventory-summary`, `/api/item-categories`; complete reads only for bounded per-item sets, exports, imports and the offline snapshot |
| H08 | Done | `PositionOrm.reservedByLocation`, `PositionService.Capacity`; `P2StorageRegressionTest.sourceSelectionStatementsStayBoundedAsLocationsGrow` |
| H09 | Done | `strict` explicit in every tsconfig (0 diagnostics with TS 7 and TS 6); `Item.storageLocation`/`returnLocation`/`stock` nullable, `Item.barcode` removed, `isConsumable` a required read-only projection; realtime payloads decoded (`decodeServerChange`), stored OIDC transaction decoded. Generated OpenAPI contracts remain PLAN-04 |
| H10 | Done | `apiTransport.ts`, `SyncState` idle/retrying/paused, `Retry-After`; `sessionIsolation.test.ts` |
| H11 | Done | 15 s provider timeout, 45 s lock wait, abort signal passed into token acquisition |
| H12 | Parts 1–2 done, part 3 open | Part 1: `general_order_lines` + `general_order_line_assets` replace the JSON maps. Part 2: `OrderReturnPolicy` holds the shared return rules (consumable check, admin + reason for write-offs, outstanding bound, return-damage severity) for both aggregates. **Open:** part 3, one `orders` aggregate by kind (PLAN-02); a schema/API/UI convergence that needs its own change |
| L01–L04 | Done | Dead helpers, listeners and 26 imports removed; unused `ash-api-event` dispatch and `personalItems` util removed |
| L06 | Done | `OfflineCommand` discriminated union (no payload casts); shared `MaintenanceType`/`MaintenanceResult` unions; `oneOf()` validates generic form values |
| L07 | Done | `ActionButtons` forwards every prop/ref unchanged; contract documented; inner ref no longer claims `HTMLElement` |
| L08 | Done | `useOrderMutation` inlined; `ResourceQuery`/`Query` aliases replaced by `ApiQuery`; form types in `types/operationForm.ts` |
| L09 | Done | `inventory_role` is the only consumable authority (`is_consumable` column and `consumable` input removed, `Item.consumable()` derived); unwritten `quantity_reserved` column removed (reservations computed live) |
| L10 | Done | `unique nulls not distinct` on positions |
| L11 | Done | `AvailabilityEligibility` evaluates item/asset eligibility for the read model and planning snapshot; `PlanningStockOrm.SnapshotRow` replaces positional `Object[]` access |
| L12 | Done | `codeResolver` treats only 404 as absence; other errors propagate |
| L13 | Partly done | Business windows named (`CALENDAR_WARNING_DAYS` backend + frontend, `LOT_EXPIRY_WARNING_DAYS`). **Open:** migrating ~2,500 inline DE/EN pairs to i18next keys (PLAN-09, P3) |
| L15 | Done | Dev H2 profile and `skipITs` removed; two-engine TS setup documented |
| L16 | Done | Prefix-scoped cache cleanup, `waitUntil` writes |
| L17 | Done | Browser previews converted to TSX on typed builders (`tests/fixtures/dto.ts`) and a paged mock transport (`tests/fixtures/api.ts`); type-checked by `tsconfig.fixtures.json` in `tsc -b` |
| LOT-H01/H02, LOT-L01–L04 | Done | Create/update DTO split (item immutable), composite `(lot_id, item_id)` FKs, lot item identity and per-location stock, explicit batch choice with full metadata on receiving, item-scoped `LotsPanel` visible to viewers; `AuditFixesApiTest` |

Found and fixed along the way:
- `ArchitectureApiCoverageTest.sseDispatchesOnlyPublicEventClassification` could hang the whole suite: it broadcast once (possibly before the stream subscribed), and on timeout the executor waited on a blocked read. It now retries the broadcast and closes the stream first.
- The browser previews used removed hooks, list props and roles (`hq_admin`).
- `tests/refactoring.sample-smoke.ts` still sent the removed `consumable` input.

### Verification

| Check | Result |
|---|---|
| Backend `mvn test` (PostgreSQL 18 test container) | 203 tests, 0 failures, 0 errors |
| `tsc -b` with TS 7 (app, node, fixtures; `strict`) | 0 diagnostics |
| `tsc -p tsconfig.app.json` / `tsconfig.fixtures.json` / `tsconfig.node.json` with TS 6 | 0 diagnostics |
| `eslint .` | 0 problems |
| `bun test` | 92 pass, 0 fail |
| Browser previews (`tests/*.browser.html`, headless Firefox via Vite dev server) | All four TSX previews mount without module or runtime errors |

## Scope and evidence

- Inventoried 267 frontend TS/TSX files and 218 backend Java files; inspected contracts, source references, authentication, offline storage/replay, privacy, stock, orders, maintenance, manifests, Compose and regression scaffolding.
- Used the existing graph for orientation, then verified findings in current source. Its historical memories and line references are not current evidence. Graph traversal/extraction used no additional LLM tokens; no graph artifacts were rewritten.
- Read-only ESLint check: `node node_modules/eslint/bin/eslint.js src vite.config.ts --no-cache` **passed**. It used the installed dependencies, which differ from some current manifest versions. No TypeScript compilation or backend compilation was performed.
- **Confirmed** means the cited source demonstrates the pattern or missing guard. Failure scenarios below are reasoned from source, not reproduced in a browser/database. Query counts, concurrency effects and deployment behavior still need measurement.
- All findings are **Open**. The commit checklist below tracks future work in this same file. Existing backlog equivalents are noted to avoid treating previously documented drift as a newly discovered bug.

## Critical

**No Critical finding was established by this static audit.** The production authentication guard rejects development authentication and disabled OIDC: [ProductionAuthGuard.java:19](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/helper/security/ProductionAuthGuard.java:19). This is not a security certification or evidence of runtime acceptance.

## High

### H01 — Condition changes can overwrite custody/reservation state

**Confirmed missing guard.** [CatalogService.java:791](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/CatalogService.java:791) checks identity, ownership and version, then assigns `damaged` regardless of the existing availability state at line 805. A subsequent good-condition update changes `damaged` to `available` at line 807. An `in_custody`, `staged` or `in_transit` asset can therefore lose that state through this endpoint while custody/reservation records still exist. A normal serialized check-in requires a custody state ([InventoryOperationsService.java:235](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/InventoryOperationsService.java:235)), so the overwritten state can also prevent normal return.

**Refactor:** keep condition independent of physical custody; route actual availability changes through lifecycle commands. Reject unsupported transitions under the existing locks. Check damage/good updates during custody, reservation, transfer and repair.

### H02 — Per-asset maintenance also rewrites item-wide state

**Confirmed.** [InventoryOperationsService.java:684](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/InventoryOperationsService.java:684) updates the item's hours, next due date and maintenance status before separately updating the selected asset. One failed asset inspection makes the entire item `in_service`; another asset's successful inspection can clear that item-wide state. Asset availability is also overwritten with `in_maintenance` without a custody-state guard at line 697. [MaintenanceEvaluationService.java:52](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/MaintenanceEvaluationService.java:52) consumes both item state and schedules.

**Refactor:** scope maintenance results to item or asset explicitly, preserve custody, and derive blocking from applicable schedules. Remove redundant item/schedule state directly in the baseline and contracts. Related backlog: PLAN-10.

### H03 — Authorization depends on arbitrary UUID text and a response-time graph

**Confirmed fragile architecture.** [PrivacyProjectionService.java:38](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/PrivacyProjectionService.java:38) and [line 87](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/PrivacyProjectionService.java:87) interpret UUIDs anywhere in strings or object keys as resource references, including notes and descriptions. One denied reference discards an entire row/object. [PrivacyResponseFilter.java:23](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/PrivacyResponseFilter.java:23) can turn an otherwise successful JSON response into 404; mutation resources also return through this filter ([CatalogResource.java:54](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/CatalogResource.java:54)). Whether a particular filtered write has already committed needs transaction-boundary verification.

Privacy is additionally implemented in [CatalogOrm.java:46](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/CatalogOrm.java:46), [ActorService.java:179](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/helper/security/ActorService.java:179), reflective association traversal at [line 226](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/helper/security/ActorService.java:226), and the manually maintained reference graph in [InventoryAccessOrm.java:274](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/InventoryAccessOrm.java:274).

**Refactor:** use typed resource references and explicit nested DTO redaction, with authorization before pagination and mutation. Consolidate the legacy visibility rules; retain necessary policy enforcement at command boundaries. Verify REST/MCP/replay parity and free text containing an unrelated UUID. Related backlog: PLAN-01.

### H04 — Durable logout failure is reported as success

**Confirmed error swallowing.** [authStorage.ts:62](D:/Code/ASH/inventory/src/services/authStorage.ts:62) catches deletion failures and resolves successfully. [authManager.ts:203](D:/Code/ASH/inventory/src/services/authManager.ts:203) consequently considers logout persisted, while [line 111](D:/Code/ASH/inventory/src/services/authManager.ts:111) can restore the surviving record on a cold start. Provider revocation is best effort ([apiClient.ts:80](D:/Code/ASH/inventory/src/services/apiClient.ts:80)); an offline logout cannot rely on it.

**Refactor:** propagate durable deletion failure, prevent restoration after explicit logout, and expose a recoverable persistence error. Also handle transaction abort and database connection lifecycle. Validate logout with failed IndexedDB deletion and a subsequent cold start.

### H05 — Production Compose has predictable database-secret defaults

**Confirmed config risk, not evidence of an exposed deployment.** [docker-compose.yml:17](D:/Code/ASH/inventory/docker-compose.yml:17) and [line 37](D:/Code/ASH/inventory/docker-compose.yml:37), plus [docker-compose.cluster.yml:26](D:/Code/ASH/inventory/docker-compose.cluster.yml:26), [line 85](D:/Code/ASH/inventory/docker-compose.cluster.yml:85) and [line 147](D:/Code/ASH/inventory/docker-compose.cluster.yml:147), substitute a known password when the variable is missing/empty. [.env.example:53](D:/Code/ASH/inventory/.env.example:53) also supplies a predictable placeholder. Default loopback bindings reduce exposure but do not make the credentials unique.

**Refactor:** require nonempty externally supplied database credentials in production templates, as Garage already does. Inspect resolved configuration with missing, empty and supplied values; do not print actual secrets.

### H06 — Faction-order mapping drops pagination completeness metadata

**Confirmed data-flow mismatch.** [apiClient.ts:243](D:/Code/ASH/inventory/src/services/apiClient.ts:243) records `X-Filtered-Rows` against the original array in a WeakMap. [factionOrderService.ts:9](D:/Code/ASH/inventory/src/services/factionOrderService.ts:9) returns a new mapped array with fabricated empty history. [pageCompleteness.ts:9](D:/Code/ASH/inventory/src/services/pageCompleteness.ts:9) then sees only its reduced length; [useProgressiveList.ts:24](D:/Code/ASH/inventory/src/hooks/useProgressiveList.ts:24) can stop before the next server page. IndexedDB serialization also loses this metadata.

**Refactor:** return an explicit page envelope carrying rows and continuation metadata; preserve it through mapping and persistence. Keep summary/detail types distinct. Check a full server page shortened by privacy filtering, including a cached copy.

### H07 — Pagination still means automatic full download

**Confirmed.** [useProgressiveList.ts:30](D:/Code/ASH/inventory/src/hooks/useProgressiveList.ts:30) repeatedly fetches every remaining page without user demand. [useItems.ts:16](D:/Code/ASH/inventory/src/hooks/useItems.ts:16), [useOrders.ts:12](D:/Code/ASH/inventory/src/hooks/useOrders.ts:12) and [useFactionOrders.ts:23](D:/Code/ASH/inventory/src/hooks/useFactionOrders.ts:23) use it. [ItemsList.tsx:237](D:/Code/ASH/inventory/src/components/lists/ItemsList.tsx:237) merely slices downloaded rows, while REST locations and assemblies are unpaged ([CatalogResource.java:97](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/CatalogResource.java:97), [line 109](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/CatalogResource.java:109)). Every invalidation can repeat substantial work.

**Refactor:** move filtering/sorting/paging to the server screen by screen; fetch selected details and autocomplete matches separately. Reserve exhaustive readers for explicit exports/imports. Define offline completeness explicitly. Related backlog: PLAN-03.

### H08 — Source selection contains repeated queries inside loops

**Confirmed query-amplification path; not a measured load result.** [OrderAllocationService.java:25](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/OrderAllocationService.java:25) enumerates stock locations and calls `availableAt` for each. [PositionService.java:54](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/PositionService.java:54) reloads all item positions each time. [PositionOrm.java:39](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/PositionOrm.java:39) queries reservations and all preparing/ready general orders for every location. Multiple order lines multiply this work under stock locks.

**Refactor:** load ordered positions and grouped reservations once per command and calculate per-location capacity in memory. Reuse the batch reservation approach at [PositionService.java:80](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/PositionService.java:80). Measure SQL count as item/location counts increase; preserve lock order and FEFO behavior.

### H09 — TypeScript strictness is off and transport types are inaccurate

**Confirmed.** [tsconfig.app.json:2](D:/Code/ASH/inventory/tsconfig.app.json:2) and [tsconfig.node.json:2](D:/Code/ASH/inventory/tsconfig.node.json:2) have no `strict` setting or inherited configuration. `noUnusedLocals` does not enable null or implicit-any checking. [Item.storageLocation](D:/Code/ASH/inventory/src/types/item.ts:75) is a required string, but [ApiMapper.java:189](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/ApiMapper.java:189) emits null. `stock?: ItemStock` also does not describe the null projection produced at [ApiQueryService.java:242](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/ApiQueryService.java:242). `Item.barcode` at [item.ts:62](D:/Code/ASH/inventory/src/types/item.ts:62) has no corresponding current backend item field/response.

[apiClient.ts:241](D:/Code/ASH/inventory/src/services/apiClient.ts:241) trusts arbitrary JSON as `T`; independently handwritten Java responses, TS interfaces and status unions allow drift without diagnostics.

**Refactor:** correct nullable/summary/detail contracts first, then enable strict checking in coherent small groups. Generate transport types from the existing API specification when ready; validate untrusted stored/session/event data at boundaries. Related backlog: PLAN-04.

### H10 — Offline replay hides terminal failures behind indefinite retry

**Confirmed.** [offlineQueue.ts:240](D:/Code/ASH/inventory/src/services/offlineQueue.ts:240) bypasses the API client's refresh/error policy; every non-OK response, including 401/403, gets generic exponential retry. [line 285](D:/Code/ASH/inventory/src/services/offlineQueue.ts:285) catches network, parsing and storage errors without retaining their cause. Commands remain queued while the user cannot distinguish expired auth, denied access, broken response or temporary connectivity.

**Refactor:** share authenticated request/error primitives with normal requests while preserving command UUIDs. Pause and surface terminal failures; retry transient failures with `Retry-After` support. Check expired auth, 403, malformed responses, storage abort and successful replay after reauthentication.

### H11 — OIDC requests can hold the session lock without a deadline

**Confirmed cancellation gap.** Discovery at [oidcClient.ts:127](D:/Code/ASH/inventory/src/services/oidcClient.ts:127) and token exchange at [line 147](D:/Code/ASH/inventory/src/services/oidcClient.ts:147) use fetch without a timeout/abort signal. Refresh awaits them while holding the browser session lock ([authManager.ts:72](D:/Code/ASH/inventory/src/services/authManager.ts:72), [line 262](D:/Code/ASH/inventory/src/services/authManager.ts:262)). [apiClient.ts:193](D:/Code/ASH/inventory/src/services/apiClient.ts:193) aborts its own controller after 20 seconds, but that signal is not passed into `getAuthorizationHeaders()` at line 217.

**Refactor:** add bounded, cancellable OIDC requests and release the lock on failure. Check a stalled discovery/token response with another tab attempting refresh/logout. A complete authentication-library replacement is not necessary to address this finding.

### H12 — Two order aggregates retain separate stock and lifecycle implementations

**Confirmed architectural debt.** [GeneralOrder.java:18](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/model/GeneralOrder.java:18) stores item IDs, quantities, source locations and assignments in JSON maps, whereas [FactionOrderLine.java:10](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/model/FactionOrderLine.java:10) uses relational lines. General-order reservations require JSON expansion ([StockFactsOrm.java:35](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/StockFactsOrm.java:35)); lifecycle actions are duplicated in [GeneralOrderService.java:46](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/GeneralOrderService.java:46) and [OrderService.java:44](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/OrderService.java:44). Shared allocation/pickup helpers have not removed the aggregate duplication.

**Refactor:** normalize general-order lines directly in the baseline, then converge reservations, reconciliation and history before unifying the aggregate by kind. Preserve genuine faction/general permission differences. Related backlog: PLAN-02.

## Low/Cosmetic

| ID | Confirmed finding and source | Proposed cleanup |
|---|---|---|
| L01 | Unused frontend exports: [createDamageReport](D:/Code/ASH/inventory/src/services/damageReportService.ts:19), [getStorageLocations](D:/Code/ASH/inventory/src/services/storageLocationService.ts:31). Repository reference search found declarations only. | Remove unused aliases; keep the actively used resource objects/hooks. |
| L02 | Dead backend helpers: [clearActiveLocationAssignments](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/CatalogOrm.java:219), [ancestorPolicyIds](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/InventoryAccessOrm.java:94), [checkedOutQuantity](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/ReturnSubmissionOrm.java:90); [OperationsOrm.java:155](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/OperationsOrm.java:155), [179](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/OperationsOrm.java:179), [199](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/OperationsOrm.java:199), [234](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/OperationsOrm.java:234), [262](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/OperationsOrm.java:262). These names occur only at their declarations across main/test Java. | Remove these obsolete query variants. Do not remove similarly named active scalar/batch methods. |
| L03 | Unused listener registration and delivery loop: [EventBroadcaster.java:126](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/helper/event/EventBroadcaster.java:126), [165](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/helper/event/EventBroadcaster.java:165). No caller of `addListener` was found. | Remove the registration method, listener collection, delivery loop and associated unused import. Keep the active SSE/Redis processor. |
| L04 | 25 unused explicit Java imports remain after ORM/service extraction; exact locations are listed below. | Remove imports only; no behavior change. |
| L05 | Duplicate session shapes: [authStorage.ts:6](D:/Code/ASH/inventory/src/services/authStorage.ts:6) uses optional revision and `user: unknown`; [authManager.ts:9](D:/Code/ASH/inventory/src/services/authManager.ts:9) requires revision and typed user, then repairs old records with casts/defaults at [123](D:/Code/ASH/inventory/src/services/authManager.ts:123). | Share one persisted schema plus a runtime decoder. Reset disposable old storage rather than retaining old-record compatibility. |
| L06 | Forced casts at [transactionService.ts:14](D:/Code/ASH/inventory/src/services/transactionService.ts:14), [damageReportService.ts:14](D:/Code/ASH/inventory/src/services/damageReportService.ts:14), [factionOrderService.ts:44](D:/Code/ASH/inventory/src/services/factionOrderService.ts:44) erase offline-command types. [LifecycleOperations.tsx:68](D:/Code/ASH/inventory/src/components/operations/LifecycleOperations.tsx:68) casts every maintenance type as the literal `dguv_v3`. | Use a discriminated command/payload union and the shared maintenance-type union; validate generic form values. |
| L07 | [ActionButtons.tsx:62](D:/Code/ASH/inventory/src/components/shared/ActionButtons.tsx:62) declares a narrow wrapper and casts it back to every MUI polymorphic overload at [84](D:/Code/ASH/inventory/src/components/shared/ActionButtons.tsx:84). The ref is always typed `HTMLElement`; disabled tooltip mode wraps the original node. | Keep its useful tooltip behavior, but give supported controls/ref targets honest typings; check links, focus and disabled layout. This wrapper is not a mere pass-through. |
| L08 | Pure pass-through `useOrderMutation`: [useFactionOrders.ts:43](D:/Code/ASH/inventory/src/hooks/useFactionOrders.ts:43). Transport/query aliases are repeated at [resourceFactory.ts:6](D:/Code/ASH/inventory/src/services/resourceFactory.ts:6), [operationsService.ts:7](D:/Code/ASH/inventory/src/services/operationsService.ts:7), [useResourceApi.ts:7](D:/Code/ASH/inventory/src/hooks/useResourceApi.ts:7). [operationForm.ts:1](D:/Code/ASH/inventory/src/utils/operationForm.ts:1) imports its value type from a UI component. | Inline the no-policy hook wrapper; share query/form-value types in a lower-level module. Retain wrappers that own auth, transactions or caching. |
| L09 | Duplicate derived state: [Item.java:56](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/model/Item.java:56) persists both `consumable` and `inventoryRole`; [inventoryService.ts:17](D:/Code/ASH/inventory/src/services/inventoryService.ts:17) sends both old/new names. [InventoryPosition.java:24](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/model/InventoryPosition.java:24) retains `quantityReserved`, but no production assignment was found; live reservations are computed separately. | Choose one consumable authority and derive the boolean projection. Remove the unwritten reservation column/projection or establish one explicit writer/authority. |
| L10 | Bulk-position uniqueness is not null-aware: nullable `lot_id` with ordinary unique triple at [baseline:400](D:/Code/ASH/inventory/backend/src/main/resources/db/migration/V1.0.0__init.sql:400), [415](D:/Code/ASH/inventory/backend/src/main/resources/db/migration/V1.0.0__init.sql:415), mirrored at [InventoryPosition.java:17](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/model/InventoryPosition.java:17). [PositionOrm.java:31](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/PositionOrm.java:31) selects the first matching row. Application item locks mitigate normal writers; no duplicate-producing application path was reproduced. | Enforce one bulk row per item/location with a null-aware baseline constraint; align mapping/documentation and check duplicate insert rejection. |
| L11 | Availability adapters duplicate policy/counter plumbing and reconstruct fake entities from positional SQL rows: [EquipmentReadService.java:61](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/EquipmentReadService.java:61), [PlanningStockService.java:82](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/PlanningStockService.java:82), [151](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/PlanningStockService.java:151). | Share immutable policy facts/evaluation and named query row mappings. Keep the intentional efficient batch/snapshot loaders. |
| L12 | Scanner lookup catches all failures as absence: [codeResolver.ts:79](D:/Code/ASH/inventory/src/utils/codeResolver.ts:79), [90](D:/Code/ASH/inventory/src/utils/codeResolver.ts:90), [99](D:/Code/ASH/inventory/src/utils/codeResolver.ts:99), [114](D:/Code/ASH/inventory/src/utils/codeResolver.ts:114); later failures only log at [141](D:/Code/ASH/inventory/src/utils/codeResolver.ts:141)/[160](D:/Code/ASH/inventory/src/utils/codeResolver.ts:160). [resourceFactory.ts:78](D:/Code/ASH/inventory/src/services/resourceFactory.ts:78) also treats every non-ApiError as a cache-fallback opportunity, including programming/decoding errors. | Continue lookup only for expected not-found responses; propagate session/network failures. Limit cache fallback to classified transient failures and expose stale provenance. |
| L13 | Key-based i18next and inline bilingual strings coexist: [naming.ts:48](D:/Code/ASH/inventory/src/utils/naming.ts:48), [54](D:/Code/ASH/inventory/src/utils/naming.ts:54), [60](D:/Code/ASH/inventory/src/utils/naming.ts:60). Maintenance warning `30` is repeated at [InventoryOperationsService.java:756](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/InventoryOperationsService.java:756), [OperationalReportService.java:265](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/OperationalReportService.java:265), [McpInventoryService.java:232](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/McpInventoryService.java:232). | Consolidate translation ownership incrementally (PLAN-09); name shared business windows and distinguish them from unrelated 30-day retention/reminder limits. |
| L14 | Compose/config drift: [.env.example:78](D:/Code/ASH/inventory/.env.example:78) advertises rate-limit knobs, but the default [API environment block](D:/Code/ASH/inventory/docker-compose.yml:33) does not forward them; the cluster does. Replica environment blocks are duplicated at [cluster:81](D:/Code/ASH/inventory/docker-compose.cluster.yml:81)/[143](D:/Code/ASH/inventory/docker-compose.cluster.yml:143). Production application logs default to DEBUG at [application.properties:80](D:/Code/ASH/inventory/backend/src/main/resources/application.properties:80). | Forward documented settings consistently; factor shared Compose environment with explicit per-node overrides. Default production verbosity to INFO, retaining opt-in diagnostics. |
| L15 | Toolchain/scaffolding overlap: [package.json:9](D:/Code/ASH/inventory/package.json:9) uses the TS 7 alias while [manifest:48](D:/Code/ASH/inventory/package.json:48) also retains TS 6. The Maven [dev-only H2 dependency](D:/Code/ASH/inventory/backend/pom.xml:93) is redundant with the PostgreSQL-only datasource profile. `skipITs` at [pom:17](D:/Code/ASH/inventory/backend/pom.xml:17)/[110](D:/Code/ASH/inventory/backend/pom.xml:110) has no checked-in Failsafe configuration/native integration suite. | Document any intentional two-engine tooling constraint; otherwise converge. Remove unused dev H2/profile and inactive integration-test switches. Keep test H2, used by TelemetryExportTest. |
| L16 | Service-worker persistence is outside event lifetime: [sw.js:17](D:/Code/ASH/inventory/public/sw.js:17) launches cache writes without awaiting/`waitUntil` or error handling. Activation at [line 11](D:/Code/ASH/inventory/public/sw.js:11) deletes every other origin cache, not just inventory shell caches. | Await tracked cache writes and restrict cleanup to the app's cache prefix. Check worker termination, quota failure and coexistence with another origin cache. |
| L17 | Untyped historical browser fixtures escape source checks: [tsconfig.app.json:24](D:/Code/ASH/inventory/tsconfig.app.json:24) includes only `src`; JSX fixtures still contain removed `amount` at [ui-cleanup.browser.jsx:31](D:/Code/ASH/inventory/tests/ui-cleanup.browser.jsx:31)/[84](D:/Code/ASH/inventory/tests/ui-cleanup.browser.jsx:84). Some adversarial legacy values are intentional, but the ordinary fixture shape is also stale. | Type shared fixtures against current DTOs, isolate explicitly adversarial objects and label opt-in live smoke procedures. Do not delete useful regression tests because their filenames mention an old refactor. |

### L04 — Unused Java import locations

Line numbers apply to the current source; grouped entries list each unused import separately.

| File | Lines / imports |
|---|---|
| [CatalogOrm.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/CatalogOrm.java:4) | 4 `EntityManager`; 5 `LockModeType` |
| [CountOrm.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/CountOrm.java:4) | 4 `EntityManager`; 11 `UUID` |
| [LifecycleOrm.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/LifecycleOrm.java:4) | 4 `EntityManager`; 5 `LockModeType` |
| [OperationsOrm.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/OperationsOrm.java:4) | 4 `EntityManager` |
| [OrderOrm.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/OrderOrm.java:4) | 4 `EntityManager` |
| [PurchasingOrm.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/PurchasingOrm.java:4) | 4 `EntityManager` |
| [ReturnSubmissionOrm.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/ReturnSubmissionOrm.java:4) | 4 `EntityManager`; 5 `LockModeType` |
| [StockManagementOrm.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/StockManagementOrm.java:4) | 4 `EntityManager`; 5 `LockModeType` |
| [TransferOrm.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/TransferOrm.java:4) | 4 `EntityManager` |
| [CategoryMaintenanceService.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/CategoryMaintenanceService.java:11) | 11 `LocalDate` |
| [CountService.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/CountService.java:15) | 15 `LocalDate` |
| [EventLogisticsService.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/EventLogisticsService.java:8) | 8 `DomainEnums`; 24 `Set` |
| [InventoryAccessService.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/InventoryAccessService.java:11) | 11 `Instant` |
| [InventoryOperationsService.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/InventoryOperationsService.java:15) | 15 `FactionOrderLine` |
| [McpInventoryService.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/McpInventoryService.java:17) | 17 `LocalDate` |
| [PositionService.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/PositionService.java:8) | 8 `LocalDate` |
| [PurchasingService.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/PurchasingService.java:16) | 16 `LocalDate` |
| [TransferService.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/TransferService.java:15) | 15 `LocalDate` |
| [StockDtos.java](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/dto/StockDtos.java:3) | 3 `Min` |

## Checked areas without an established removal finding

- No explicit TypeScript `any`, `@ts-ignore`, `@ts-expect-error`, Python `# type: ignore`, or Java `@Deprecated` annotation was found in the inspected source/scaffolding. Implicit `any` remains possible because strictness is disabled (H09). Ordinary `as const`, narrowed object casts and browser capability casts are not automatically defects.
- The frontend import inventory found no confirmed orphan application file; all apparent candidates required entrypoint/explicit-extension resolution. No unreachable branch was established. Dead helpers/exports above are stronger evidence than file-age guesses.
- No wholly unused frontend runtime package was established. Emotion satisfies MUI peers; Babel core and React Compiler satisfy build-plugin peers; type packages can be used implicitly. A missing direct import alone is insufficient evidence to remove these packages. Installed package metadata was used for this check, not a dependency reinstall.
- The single [V1.0.0 baseline](D:/Code/ASH/inventory/backend/src/main/resources/db/migration/V1.0.0__init.sql:1) is active via [application.properties:25](D:/Code/ASH/inventory/backend/src/main/resources/application.properties:25), not obsolete incremental migration scaffolding. Keep it and edit it directly for future schema changes.
- [SnapshotProbe.java:10](D:/Code/ASH/inventory/backend/src/test/java/org/ash/inventory/SnapshotProbe.java:10) is used by [P2StorageRegressionTest.java:34](D:/Code/ASH/inventory/backend/src/test/java/org/ash/inventory/P2StorageRegressionTest.java:34). Test H2 is used by [TelemetryExportTest.java:34](D:/Code/ASH/inventory/backend/src/test/java/org/ash/inventory/helper/telemetry/TelemetryExportTest.java:34). Neither is dead scaffolding.
- No globally unused documented environment variable was confirmed. L14 identifies settings ineffective in the default Compose deployment rather than unused everywhere.
- TanStack Query for server state, Zustand for UI preferences and local form state are legitimate separate responsibilities. Consolidation should address duplicated lifecycle/error/cache behavior, not replace these tools wholesale.
- No stray `console.log`/`console.debug` in production source was found. Existing `console.error`/`console.warn` calls mostly report real failures; the actionable concerns are silent/ambiguous failures (H04/H10/L12) and default backend verbosity (L14).

## Refactoring plan and progress

Implemented in the uncommitted working tree (15 October 2026); `[x]` done, `[~]` partly done. The rows remain useful as commit boundaries when the work tree is committed. Contracts changed in place; no shims, dual writes or incremental migrations; schema edits target the disposable baseline/entities.

| Progress | Commit | Scope | Acceptance for that commit |
|---|---|---|---|
| [x] | 01 `fix: preserve asset custody during condition changes` | H01; guarded condition changes, shared lifecycle rule | Available/reserved/custody/transit/repair cases; stale-version rejection; ledger/custody unchanged by metadata-only edits. |
| [x] | 02 `fix: scope maintenance results to their target` | H02; asset versus item updates and state guards | Two assets with conflicting inspection outcomes; inspection during custody; item and asset schedule independence. |
| [x] | 03 `fix: make durable logout failures visible` | H04 | Failed IndexedDB deletion/abort, offline logout, cold restore, cross-tab logout. |
| [x] | 04 `fix: bound OIDC discovery and refresh requests` | H11 | Stalled provider, timeout, session switch and another tab waiting for the lock. |
| [x] | 05 `fix: classify offline replay failures` | H10; shared auth/error request primitive | 401 refresh/pause, 403 visible denial, 429 retry timing, 5xx backoff, UUID-safe replay. |
| [x] | 06 `fix: require production database credentials` | H05 | Resolved Compose rejects missing/empty values and accepts supplied secrets; no secret output. |
| [x] | 07 `refactor: make page metadata explicit` | H06; page envelope, honest faction summary type | Filtered full page, empty filtered page, next-page discovery, persisted metadata. |
| [x] | 08 `refactor: batch source capacity facts` | H08 | SQL count stays bounded per item batch as locations grow; FEFO, excluded-own reservations and deterministic locks retained. |
| [x] | 09 `refactor: model typed privacy references` | First part of H03; replace free-text UUID inference on one DTO family | Denied nested IDs redacted; unrelated UUID in notes has no authorization effect; unauthorized IDs still rejected. |
| [x] | 10 `refactor: scope catalog privacy before paging` | Remaining H03 catalog scope/legacy visibility | Owner/grantee/admin/tenant matrix; accurate pages and REST/MCP parity; no hidden metadata leakage. |
| [x] | 11 `refactor: scope operational privacy projections` | Remaining H03 order/history/media families | Explicit historical-reference redaction, access revocation and successful-write response consistency; remove replaced graph paths only after parity. |
| [x] | 12 `refactor: correct transport nullability and shared types` | H09, L05/L06; session decoder, command/status unions | Source type analysis catches nullable-location misuse; malformed persisted data rejected; no forced command casts. |
| [x] | 13 `refactor: enable strict TypeScript checking` | Remaining H09; transport/hooks first, then forms/pages as separate commits if needed | Each enabled group has no strict diagnostics; no suppression or broad unknown-to-DTO cast introduced. |
| [x] | 14 `refactor: page the item catalog on demand` | First part of H07; API filters, page metadata, item screen | First screen fetches one page; filters/sort operate over server data; selected details and offline indicators remain correct. |
| [x] | 15 `refactor: page orders and operations on demand` | Remaining paged H07 readers, one screen per commit | Page changes request only needed data; invalidation does not drain collections; exports remain explicitly exhaustive. |
| [x] | 16 `refactor: page locations and assemblies` | Unpaged H07 endpoints and consumers | Large location/assembly datasets; component lookup, import and hierarchy workflows retain complete explicit reads. |
| [x] | 17 `refactor: normalize general order lines` | First part of H12; baseline/model/query/contracts together | General preparation/pickup/return/reservation results equivalent; references enforced by schema; reset disposable data. |
| [x] | 18 `refactor: share order reconciliation and history` | Next part of H12; extract one policy responsibility per commit | Faction/general permission differences, cancellation, missing/write-off and idempotency preserved. |
| [ ] | 19 `refactor: unify orders by kind` | Final H12 storage/service convergence | End-to-end faction/general scenarios and REST/MCP/replay parity; remove replaced aggregates directly. |
| [x] | 20 `refactor: derive maintenance and reservation state` | L09/L11 and remaining PLAN-10; split consumable authority, reservation field and maintenance authority into separate commits | Checkout/planning/report agreement; asset-specific blocking; no second source of derived state. |
| [x] | 21 `refactor: enforce bulk position uniqueness` | L10; baseline constraint and mapping | Duplicate null-lot position rejected; distinct lots accepted; normal stock commands unaffected. |
| [x] | 22 `chore: remove verified dead code and imports` | L01..04, pass-through part of L08 | Reference inventory/lint clean; no removed endpoint, CDI entrypoint or used support bean. |
| [x] | 23 `refactor: tighten UI and input boundaries` | L06..08, L12; separate tooltip typing from lookup/error cleanup | Polymorphic controls/ref behavior; malformed command fields; network/session errors distinct from absence. |
| [x] | 24 `chore: consolidate config and tooling` | L14/L15; separate Compose, logging and Maven/frontend tooling commits | Documented variables reach both deployment modes; test H2 retained; intentional compiler requirements recorded. |
| [x] | 25 `fix: track service worker cache operations` | L16 | Worker shutdown/quota behavior and cache-prefix-only activation cleanup. |
| [~] | 26 `chore: align fixtures and translation ownership` | L13/L17; one fixture/screen family per commit | Typed fixtures match DTOs; adversarial inputs remain explicit; DE/EN and export labels preserved. |

Commit 22 can run early as an independent cleanup. Keep fixes 01..08 ahead of broad aggregate/schema redesign. Large families in 11, 13, 15, 18, 20 and 24 should expand into the explicitly listed smaller commits rather than one broad rewrite. Open: 19 (PLAN-02 aggregate convergence) and the i18next migration in 26 (PLAN-09).

## Focused follow-up: lot-to-item handling

15 October 2026 · **All findings Done** (see the remediation status). User clarification: choosing/managing the linked item is awkward; a multi-item lot is not the requested concept.

### Current relationship

An Item is a catalog product; one Item has many Lots. Each Lot belongs to exactly one Item, enforced by the non-null association in [InventoryLot.java:19](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/model/InventoryLot.java:19). A Lot contains batch metadata, not a quantity. Quantities belong to InventoryPositions identified by item + location + lot ([baseline:400](D:/Code/ASH/inventory/backend/src/main/resources/db/migration/V1.0.0__init.sql:400)). Thus one batch can occupy multiple locations without becoming multiple lots.

Lot creation only saves metadata ([StockManagementService.java:85](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/StockManagementService.java:85)); receiving or a stock movement creates quantity. Receipts and transfers check that the selected lot belongs to their item ([PurchasingService.java:332](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/PurchasingService.java:332), [TransferService.java:93](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/TransferService.java:93)). Checkout can allocate usable positions across lots in FEFO order; selected-lot validation occurs in [PositionService.java:24](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/PositionService.java:24), with allocation at [line 167](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/PositionService.java:167).

**Assessment:** the one-item/many-lots cardinality fits this requirement. The weak parts are the UI workflow, read projection, and update invariants.

### High

| ID / status | Finding | Resolution |
|---|---|---|
| LOT-H01 · Done | Editing can reassign an existing lot to another item. The global form exposes the item selector on edit ([StockOperations.tsx:208](D:/Code/ASH/inventory/src/components/operations/StockOperations.tsx:208)); the backend unconditionally assigns `lot.item = item` ([StockManagementService.java:109](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/StockManagementService.java:109)). Existing positions, transactions, count/transfer/receipt lines retain their old item IDs. Independent foreign keys do not require those item IDs to match the lot's item. This can leave item A's stock referencing a lot now owned by B, and subsequent lot validation rejects normal A operations. | Make the parent item immutable on update in both API and UI. Use a distinct create DTO containing itemId and metadata-only update DTO. Check that a populated/historical lot cannot move to another product; assess composite database constraints for the same invariant. |
| LOT-H02 · Done | Receiving automatically chooses the first matching lot with `status === 'available'` ([PurchasingOperations.tsx:102](D:/Code/ASH/inventory/src/components/operations/PurchasingOperations.tsx:102)). That does not establish supplier-batch identity, stock quantity, or date usability. The picker shows only lot numbers at line 119. New-lot creation collects only a number and supplies no expiry, manufacture date or supplier lot at line 139. | Require explicit existing-batch selection or explicit new-batch creation. Include batch dates/supplier identity and stock context in choices; capture full lot metadata inline when receiving a new batch. Do not infer identical batch identity merely from the same item. |

### Low/Cosmetic

| ID / status | Finding | Resolution |
|---|---|---|
| LOT-L01 · Done | The Item page already passes `itemId` ([ItemDetail.tsx:370](D:/Code/ASH/inventory/src/pages/ItemDetail.tsx:370)), but the embedded form still renders an item autocomplete with one eligible option ([StockOperations.tsx:209](D:/Code/ASH/inventory/src/components/operations/StockOperations.tsx:209)). | Show fixed item name/SKU on item-scoped creation; skip item selection. For global creation, choose the item once, then enter batch details. |
| LOT-L02 · Done | Lot rows contain an item ID but no item name/SKU or stock summary ([StockDtos.java:22](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/dto/StockDtos.java:22)). The UI resolves names by searching the entire downloaded item catalog ([StockOperations.tsx:204](D:/Code/ASH/inventory/src/components/operations/StockOperations.tsx:204)). `useStockLookups` also downloads unrelated locations ([useStockLookups.ts:5](D:/Code/ASH/inventory/src/hooks/useStockLookups.ts:5)). Lookup loading/errors are not displayed by LotsPanel; its feedback covers only lots. Retired items are omitted from the item catalog, although the lot query does not filter them out. | Return a scoped item summary with each lot. Use targeted item search for global creation; avoid full catalog/location dependencies. Display lookup failures and explicit loading; distinguish retired parent items from missing data. |
| LOT-L03 · Done | Lot cards show dates/status/notes but no quantity or location ([StockOperations.tsx:204](D:/Code/ASH/inventory/src/components/operations/StockOperations.tsx:204)). The separate item location table merges all lots at a location ([ItemStockLocations.tsx:28](D:/Code/ASH/inventory/src/components/items/ItemStockLocations.tsx:28)). An empty metadata record can remain `available`; no automatic writer of `LotStatus.depleted` was found. | Show a per-lot stock breakdown by location with on-hand, available, held/damaged and transit quantities. Distinguish eligibility status from computed emptiness. Link stock addition/receiving from the lot so creating metadata does not imply adding stock. |
| LOT-L04 · Done | The Item page hides the entire lot panel unless `canEdit` ([ItemDetail.tsx:370](D:/Code/ASH/inventory/src/pages/ItemDetail.tsx:370)); LotsPanel itself assumes editable actions. Global lot rows also have no direct item/lot detail link. | Separate view permission from edit permission. Allow authorized viewers to inspect lots/stock; gate mutations individually. Add direct item navigation and lot detail/expanded stock context. |

### Proposed small commits

| Progress | Commit | Acceptance |
|---|---|---|
| [x] | `fix: make lot parent item immutable` — LOT-H01 | Reassignment rejected after creation; metadata edits still work; original stock/history associations remain valid. |
| [x] | `refactor: project lot item identity and stock context` — LOT-L02/L03 | Item/SKU visible without catalog draining; quantities agree with positions; privacy/location redaction preserved. |
| [x] | `refactor: make lot management item-scoped` — LOT-L01/L04 | New lot from Item A fixes A as parent; global creation searches eligible products; edit never exposes parent selection; viewers can inspect without mutation buttons. |
| [x] | `feat: expose per-lot stock and receiving actions` — LOT-L03 | Multiple lots in one location and one lot across locations are distinguishable; creating metadata alone clearly creates zero stock. |
| [x] | `fix: require explicit batch identity on receiving` — LOT-H02 | New delivery does not silently reuse an existing batch; full metadata captured for new batches; explicit same-batch partial deliveries remain possible. |

Example target flow: **Item → Lots → New lot** (item fixed) → enter batch identity/dates → save metadata or receive stock. From global Operations: **New lot → search item by name/SKU → confirm item → same batch form**. Keep the current one-item/many-lots model; no many-to-many join table is needed for the clarified workflow.
