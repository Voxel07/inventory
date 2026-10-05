# Test inventory and architecture coverage

Reviewed 5 October 2026 against the **current** behavior in `docs/ARCHITECTURE.md`.
Its target designs and known implementation limitations remain separate.
Coverage below means observable behavior has regression checks; it does not mean
100% Java/TypeScript line or branch coverage, or exhaustive UI acceptance.

## Running the checks

Frontend, from the repository root:

```powershell
bun install --frozen-lockfile
bun test
bun run lint
bun run build
```

Backend requires Java 25, Maven and a **disposable PostgreSQL database**. The test
profile cleans its database at startup. Example isolation used for this review:

```powershell
docker run --detach --rm --name inventory-test-review --publish 127.0.0.1:15432:5432 --env POSTGRES_USER=inventory_test --env POSTGRES_PASSWORD=inventory_test --env POSTGRES_DB=inventory_test postgres:18-alpine
$env:TEST_DB_URL='jdbc:postgresql://127.0.0.1:15432/inventory_test'
$env:TEST_DB_USER='inventory_test'
$env:TEST_DB_PASSWORD='inventory_test'
if (Test-Path backend/target/endpoint-coverage.tsv) { Remove-Item -LiteralPath backend/target/endpoint-coverage.tsv }
Push-Location backend
mvn package '-Dinventory.test.endpoint-coverage=target/endpoint-coverage.tsv'
Pop-Location
python tests/tools/endpoint_coverage.py --markdown backend/target/endpoint-coverage.md
docker stop inventory-test-review
```

Always reset the dispatch trace before the full suite. The optional test-only
response filter records the resource method, HTTP verb and response status of
actual HTTP dispatches. The standard-library Python auditor inventories current
JAX-RS resource handlers and fails if any lacks a successful dispatch. SSE bypasses
the response filter; its evidence is the passing Surefire HTTP streaming test.
The generated Markdown lists each handler and observed status, including denials.
This guard measures handler reachability; the tests themselves assert responses,
state changes, permissions, versions, rollback and retry behavior.

## File dispositions

Paths in this table are relative to `backend/src/test/java/org/ash/inventory/`.
All 21 test classes remain useful. The two support classes belong to the suite.

| File | Disposition and purpose |
|---|---|
| `ArchitectureApiCoverageTest.java` | Added: previously missing REST workflows, policy denials, version/retry checks and real HTTP SSE payload privacy |
| `BaselineSchemaTest.java` | Keep: canonical PostgreSQL baseline, Hibernate validation, indexes and schema-local revision triggers |
| `EquipmentApiTest.java` | Keep: ownership, consent, commitments, exact assets and transfers |
| `InventoryApiTest.java` | Update invalid image fixture; keep catalog, orders, stock, returns, procurement, sync, media, lifecycle and outbox regressions |
| `InventoryMcpTest.java` | Extend remaining read tools and HTTP resource/prompt checks; keep shared command contracts and caller privacy/authentication |
| `InventoryMcpAuthenticationTest.java` | Keep: unauthenticated and spoofed transport requests |
| `MaintenanceStockApiTest.java` | Keep: maintenance eligibility parity, transit/ownership and provider loans |
| `PrivateInventoryApiTest.java` | Keep: owner/grant/group rights across reads, commands, media and transfers |
| `PriorityRefactorApiTest.java` | Keep: historic name, current count, return race and private-assembly regressions |
| `RemainingP1ApiTest.java` | Keep: historic name, current hierarchy, offline correction and snapshot regressions |
| `P2StorageRegressionTest.java` | Keep: query budgets, fetch plans, snapshots and transactional revisions |
| `StorageQueryRegressionTest.java` | Update three-resource query budgets and JWT fixture; keep SQL visibility/search/privacy budgets |
| `SnapshotProbe.java` | Keep support bean: independent concurrent transaction used by snapshot tests |
| `helper/ratelimit/InMemoryRateLimiterTest.java` | Keep: throttle limits and expiry |
| `helper/security/ActorServiceRoleTest.java` | Keep: Authentik role/faction mapping and production authentication guard |
| `helper/storage/MediaServiceTest.java` | Keep: local files, canonical keys and signed S3 requests against a local HTTP stub |
| `helper/storage/MediaTypesTest.java` | Keep: signature sniffing, type restrictions and size limits |
| `model/InventoryModelInvariantTest.java` | Keep: entity identity and schema/model invariants |
| `resource/CatalogResponsesTest.java` | Keep: explicit response/field contracts |
| `resource/EventStreamResourceTest.java` | Keep: token expiry and event classification; complements the HTTP stream test |
| `resource/EndpointCoverageFilter.java` | Added support provider: opt-in dispatch evidence, excluded from production |
| `service/MaintenancePolicyTest.java` | Keep: date, hour, usage and unknown-evidence rules |
| `service/PrivacyProjectionServiceTest.java` | Keep: nested sensitive-reference redaction |

Every remaining file in `tests/` has one of these roles:

| File(s) | Disposition and purpose |
|---|---|
| `apiChanges.test.ts` | Keep: mutation domains, safe SSE classification and burst coalescing |
| `catalogWorkflows.test.ts` | Added: authoritative stock, assembly capacity, historical comparison, hierarchy, crop math and CSV dependencies/validation |
| `dateFormat.test.ts` | Keep: date/time formatting and invalid/missing values |
| `locationStock.test.ts` | Keep: local positions and serialized-state aggregation |
| `pagination.test.ts` | Keep: privacy-shortened pages; extended asynchronous checks live in the session harness |
| `personalItems.test.ts` | Keep: ownership/custody catalog selection |
| `privateInventory.test.ts` | Keep: private projection tracking, command guards and revocation cache resets |
| `sampleOrders.test.ts` | Keep: shipped CSV validity and historical/open order coverage |
| `sessionIsolation.test.ts` | Extend pagination, exact read-only code resolution, report generations and offline replay; keep account/token/cache/queue race tests |
| `stockHistory.test.ts` | Keep: receipt history, opening balances and signed movements |
| `media.browser.html`, `media.browser.js` | Update 512 px expectations and canonical role; keep 21 browser assertions for images, metadata, crop pixels, upload/authentication and logout cleanup |
| `image-editor.browser.html`, `image-editor.browser.jsx` | Update canonical role; keep manual item/assembly crop, removal, image-order and save-payload preview |
| `layout.browser.html`, `layout.browser.jsx` | Update authoritative stock and removed props; keep grouped custody/assembly layout preview |
| `orderPreparation.browser.html`, `orderPreparation.browser.jsx` | Keep: faction/general preparation and warehouse queue preview |
| `ui-cleanup.browser.html`, `ui-cleanup.browser.jsx` | Keep: consolidated navigation, task tabs, catalog, inbox, returns and sharing preview |
| `refactoring.browser.html`, `refactoring.browser.jsx` | **Removed:** older operations/catalog/inbox preview superseded by `ui-cleanup.browser.*` |
| `refactoring.sample-smoke.ts` | Keep opt-in live REST/MCP sample import; use DB reference data, finish count posting and new-lot receipt assertions instead of leaving a browser exercise |
| `tools/endpoint_coverage.py` | Added: repeatable REST handler audit and detailed Markdown evidence |
| `README.md` | Added: inventory, execution instructions, requirement mapping and acceptance limits |

The `.browser.*` files are browser fixtures, not Bun-discovered tests. Run
`bun run dev --host 127.0.0.1`, then open the corresponding HTML under `/tests/`.
`media.browser.html` runs its own assertions; the other previews require UI checks.
The image editor selects the item form with `?item`.

The live-data smoke script is also explicit, outside `bun test`:

```powershell
bun run tests/refactoring.sample-smoke.ts http://127.0.0.1:18085
```

Its backend must be a loopback development API with a disposable database,
development authentication and MCP enabled. It creates and modifies sample data.

## Architecture requirement mapping

Backend class names below use the inventory table above; frontend names refer to
`tests/`. Rows group related requirements, but include every current requirement ID.

| Architecture IDs | Regression evidence |
|---|---|
| CAT-01, CAT-04, CAT-06 | `InventoryApiTest`, `InventoryMcpTest`, `CatalogResponsesTest`; `media.browser`, `image-editor.browser` |
| CAT-02 | `ArchitectureApiCoverageTest` assembly replacement/deletion, `PriorityRefactorApiTest`, `InventoryMcpTest`; `catalogWorkflows.test.ts` assembly capacity |
| CAT-03, CAT-07, CAT-08 | `InventoryApiTest`, `ArchitectureApiCoverageTest`, `InventoryMcpTest`; `sessionIsolation.test.ts` exact code resolution and retired labels |
| CAT-05, LOC-02, OWN-01, OWN-02 | `PrivateInventoryApiTest`, `EquipmentApiTest`, `PriorityRefactorApiTest`, `PrivacyProjectionServiceTest`; `personalItems.test.ts`, `privateInventory.test.ts` |
| LOC-01 | `RemainingP1ApiTest`, `ArchitectureApiCoverageTest`; `catalogWorkflows.test.ts` hierarchy, `locationStock.test.ts` |
| INV-01, INV-02, INV-04 | `InventoryApiTest`, `InventoryMcpTest`, `MaintenanceStockApiTest`, `EquipmentApiTest`; `catalogWorkflows.test.ts`, `locationStock.test.ts` |
| INV-03, AUD-01, AUD-02 | `InventoryApiTest`, `ArchitectureApiCoverageTest`, `InventoryMcpTest`; `stockHistory.test.ts`, `orderPreparation.browser` traceability preview |
| INV-05, INV-06 | `InventoryApiTest`, `PriorityRefactorApiTest`, `MaintenanceStockApiTest`, `ArchitectureApiCoverageTest`: partial transfer/count, cancellation, approval, stale observations and atomic rollback |
| INV-07 | `InventoryApiTest` FEFO/expiry/hold, `ArchitectureApiCoverageTest` lot metadata; live sample smoke lot receipt |
| ORD-01, ORD-02, ORD-03, ORD-04 | `InventoryApiTest`, `EquipmentApiTest`, `PriorityRefactorApiTest`; `sampleOrders.test.ts`, `orderPreparation.browser`, `layout.browser` |
| ORD-05 | `catalogWorkflows.test.ts`: previous-year scope and status-dependent demand/preparation baseline |
| ORD-06, ORD-07 | `sessionIsolation.test.ts`: exact QR/asset/location/order targets, targeted fallback, retired-label termination, no stock writes; physical camera acceptance remains separate |
| RET-01, RET-02 | `InventoryApiTest`, `PriorityRefactorApiTest`, `ArchitectureApiCoverageTest`: custody evidence, pending acceptance, rejection and recipient-scoped retries |
| DAM-01, DAM-02 | `InventoryApiTest`, `ArchitectureApiCoverageTest`: triage/repair/verify, hint changes, restricted and idempotent write-off |
| MNT-01 | `MaintenancePolicyTest`, `InventoryApiTest`, `MaintenanceStockApiTest`, `InventoryMcpTest`, `ArchitectureApiCoverageTest` |
| PRC-01, PRC-02, PRC-03 | `InventoryApiTest`, `ArchitectureApiCoverageTest`: demand/supply, permissions, partial receipts, ordered stock, vendor/document workflows |
| OWN-03 | `EquipmentApiTest`, `MaintenanceStockApiTest`, `InventoryApiTest`, `ArchitectureApiCoverageTest`: consent, agreements, transfer/collection/return and versioned extensions |
| MBR-01, MBR-02 | `ArchitectureApiCoverageTest`, `InventoryApiTest`: own storage/custody/requests/returns, action decisions, reminders and recipient boundaries |
| OPS-01 | `RemainingP1ApiTest`, `P2StorageRegressionTest`, `StorageQueryRegressionTest`; `sessionIsolation.test.ts` generation-consistent filtered export |
| OPS-02 | `InventoryApiTest`, `ArchitectureApiCoverageTest`: lease expiry, acknowledgement batches, dead letters and admin retry |
| OPS-03 | `catalogWorkflows.test.ts`, `sampleOrders.test.ts`; opt-in REST/MCP sample smoke |
| OFF-01, OFF-02 | `InventoryApiTest`, `RemainingP1ApiTest`; `sessionIsolation.test.ts` account-scoped snapshots/queue races/replay, `privateInventory.test.ts` |
| SEC-01, SEC-02, SEC-10 | `ActorServiceRoleTest`, `InventoryMcpAuthenticationTest`, `InventoryApiTest`, `EventStreamResourceTest`; `sessionIsolation.test.ts` auth/session races; real Authentik acceptance remains separate |
| SEC-03, SEC-04, SEC-05, SEC-07 | `PrivateInventoryApiTest`, `EquipmentApiTest`, `PriorityRefactorApiTest`, `InventoryMcpTest` |
| SEC-06 | `StorageQueryRegressionTest`, `PrivacyProjectionServiceTest`, `InventoryMcpTest`, `PrivateInventoryApiTest`, `ArchitectureApiCoverageTest` HTTP SSE privacy |
| SEC-08 | `PrivateInventoryApiTest`; `sessionIsolation.test.ts`, `privateInventory.test.ts`, `apiChanges.test.ts` |
| SEC-09 | `MediaTypesTest`, `MediaServiceTest`, `InventoryApiTest`, `PrivateInventoryApiTest`, `ArchitectureApiCoverageTest`; `media.browser` |
| API-01, API-02, API-03 | `CatalogResponsesTest`, `InventoryModelInvariantTest`, `P2StorageRegressionTest`, `StorageQueryRegressionTest`, REST handler audit; `pagination.test.ts`, `sessionIsolation.test.ts` |
| MCP (§11) | `InventoryMcpTest`: all 21 tool adapters exercised, three resources, two prompts, HTTP caller permissions and scoped results; `InventoryMcpAuthenticationTest`: transport denials |

## Limits of local verification

The browser previews mock their APIs; they complement the PostgreSQL REST/MCP
tests rather than proving browser-to-backend integration. S3 request signing uses
a local HTTP stub, not a real bucket. Real Authentik token revocation and multi-tab
logout, physical camera/mobile workflows, CSV/PDF rendering across browsers,
clustered outbox delivery and sustained load/lock contention require separate
environment acceptance. Architecture features marked partially implemented retain
those limitations. No performance benchmark or line/branch percentage is claimed.
