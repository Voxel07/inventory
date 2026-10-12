# Product Requirements Document

Reviewed: 12 October 2026 · source baseline: `82863bd` plus the working tree.

This document owns product features, business rules and functional acceptance. It preserves the detailed requirement IDs from the former architecture, with source-confirmed discrepancies corrected. Frameworks belong in [Technical Requirements](TECHNICAL_REQUIREMENTS.md), journeys in [App Flow](APP_FLOW.md), and open work in [Implementation Plan and Progress](IMPLEMENTATION_PLAN.md).

## 1. Purpose and outcomes

ASH Inventory manages equipment for recurring airsoft events: catalog/storage, faction demand, procurement, warehouse preparation, custody handover/returns, damage/repair/maintenance, counts/transfers, private equipment lending and movement history.

Quality goals, in order:

1. **Stock correctness:** atomic, idempotent changes validated against current state under locks.
2. **Traceability:** actor, server time, source, delta and command evidence for movements/transitions.
3. **Privacy:** private resources available only to their account owner, HQ admin and explicit grantees.
4. **Field resilience:** previously cached reads and supported queued commands, with the server authoritative.
5. **Simplicity:** one model per concept and explicit contracts; disposable development data.

The last goal is partly a target: order models, maintenance state and visibility mechanisms still need consolidation. This product supports equipment operations, not a separate payment/accounting system. Automatic database failover and universal offline mutation support are not current delivered capabilities.

## 2. Users and responsibilities

| Persona / role | Primary product work |
|---|---|
| HQ administrator (`hq_admin`) | Oversight, access/share groups, stock write-off, material count variance approval and system recovery |
| Warehouse crew (`warehouse_crew`) | Shared catalog, storage, receiving, preparation/reservation, transfers/counts and custody operations |
| Marshal (`marshal`) | Pickup handover and return reconciliation |
| Event planner (`event_planner`) | Occurrences/factions, demand planning, procurement and purchasing |
| Maintenance crew (`maintenance_crew`) | Damage, repair, inspection and maintenance schedules |
| Faction leader (`faction_leader`) | Orders within provider-assigned factions and own equipment/custody tasks |
| Read-only participant (`read_only`) | Permitted organizational reads and own private inventory/self-service |
| Equipment owner / member | A user responsibility, not an additional role enum: private resources, consent, requests, returns and reminders |
| MCP client | Authorized tool/resource interaction under the user's same business policies |

Any recognized account can use permitted self-service and private ownership workflows. Staff roles do not implicitly bypass private resource access except HQ admin. Provider groups control organizational roles/factions; users do not grant themselves staff rights in the app.

## 3. Capability map

| Product area | Features and functions | Detailed requirement families |
|---|---|---|
| Catalog | Metadata/images/category-specific fields, serialized asset drill-down, assemblies and QR/label identity | CAT, ORD-06/07 |
| Locations and stock | Warehouse/location hierarchy, maps, positions, exact assets, lots/FEFO, quarantine, transfers and counts | LOC, INV |
| Planning and purchasing | Occurrences/factions, demand/supply deficits and overrides, purchase orders, partial receipts and vendor evidence | PRC |
| Orders and custody | Faction/general demand, preparation, pickup, partial returns, reconciliation, cancellation and history | ORD, AUD |
| Return verification | Member placement evidence and warehouse accept/reject before stock changes | RET |
| Equipment lifecycle | Damage/repair/verification/write-off, schedule-based checkout blocks and warnings | DAM, MNT |
| Ownership and lending | Account-owned inventory, sharing, consent commitments, loan/rental terms, collection/return and extensions | OWN, SEC-03..08 |
| Member work | Personal custody/keepers/requests, recipient inbox, reminders | MBR |
| Operations | Snapshot reports, CSV/PDF, CSV import, outbox/dead-letter recovery and offline correction | OPS, OFF |
| Access and interfaces | Identity/role/faction mapping, privacy, media policy, REST/MCP contracts and bounded reads | SEC, API |

The earlier docs also used F01–F23 labels. Where the former architecture identified them: F01 events; F02 planning; F03/F04/F14 purchasing/receiving/vendor documents; F06 transfers; F08 return submissions; F10 counts; F11 lots; F12/F13 maintenance/lifecycle; F15 locations; F16 offline recovery; F17 reports; F18 outbox; F19 ownership/consent; F20 self-service; F21 reminders; F22 labels; F23 loans/rental. Unspecified legacy F-label meanings are not reconstructed. The detailed IDs below are the maintained product traceability set.

## 4. Functional requirement register

**Implemented** means the feature exists in source, not that current browser, concurrency or production acceptance has passed. **Partial** records an architectural target or explicit requirement gap. **Planned** is a future implementation. The register was carried forward from the 5 October architecture and checked against current source for representative workflows, configuration and named gaps; it is not a fresh exhaustive test certification.

**Catalog and locations**

| ID | Requirement | Status | Implementation |
|---|---|:-:|---|
| CAT-01 | Maintain items with images, category, event tags, hint, value, storage and return location | Implemented | `CatalogService`, `ItemForm`, `ItemDetail`, `MediaService` |
| CAT-02 | Maintain assemblies with fixed component quantities; an assembly is visible only if every component is | Implemented | `CatalogService`, `ApiQueryService.projectAssemblies`, `AssemblyDetail` |
| CAT-03 | Serialized equipment is one parent item with aggregate stock and `minStock`, batch asset-ID generation, and asset drill-down (state, location, hours, custodian) | Implemented | `AssetInstance`, `AssetInstancesList`, `AssetDetail` |
| CAT-04 | Item detail shows free-form product info, stock, images, history and assets | Implemented | `ItemDetail` |
| CAT-05 | Shared/event catalog plus private items visible to owner, `hq_admin` and grantees | Partial | `InventoryAccessPolicy`, scoped `CatalogOrm`. Legacy `visibilityScope` runs in parallel [PLAN-01](IMPLEMENTATION_PLAN.md) |
| CAT-06 | Typed category data: vehicle fuel l/100 km and battery date; generator hours and maintenance log; food best-before | Implemented | `Item`, `ItemForm`, `MaintenanceRecord` |
| CAT-07 | Tracking mode is immutable once stock or movements exist (API and UI); serialized items can't be consumable | Implemented | `CatalogService`, `ItemForm` |
| CAT-08 | Unique SKU/asset/label codes; aliases are retired, never reused; master data is retired, not deleted | Partial | Codes and item/location retirement are present. `CatalogService.deleteAssembly` and `deleteEvent` remove records: [GAP-01](IMPLEMENTATION_PLAN.md) |
| LOC-01 | Warehouses and a hierarchical, georeferenced location tree with pickup points; no cycles, same-warehouse parent | Implemented | `LocationHierarchyService`, `StorageLocations`, `StorageLocationMap` |
| LOC-02 | Private locations protect address, coordinates, overlays, hierarchy and contents | Implemented | `StorageLocation.accessPolicy`, `ApiMapper` redaction, `InventorySharing` |

**Stock**

| ID | Requirement | Status | Implementation |
|---|---|:-:|---|
| INV-01 | Distinguish owned, on-hand, checked-out, in-transit, damaged, reserved, available and ordered (see [stock semantics](DATABASE_SCHEMA.md)) | Implemented | `InventoryOperationsService.StockState`, `StockPolicy`; one item eligibility predicate `AvailabilityData.eligible()` for commands, planning, reports and MCP |
| INV-02 | Block over-allocation and checkout of unsafe or overdue equipment under lock | Implemented | `InventoryOperationsService`, `OrderService`, `MaintenancePolicy` |
| INV-03 | Every direct checkout carries event and faction; stored on the immutable transaction | Implemented | `TransactionForm`, `InventoryOperationsService`, `StockTransaction` |
| INV-04 | Serialized stock moves by exact asset only; batches of assets can be assigned per faction order | Implemented | `OrderService`, `OrderPickListTable` |
| INV-05 | Transfers: dispatch → transit → (partial) receipt with discrepancies; transit is not custody | Implemented | `TransferService`, `TransfersPanel` |
| INV-06 | Counts: blind count and recount; a different admin approves material variance; posting creates adjustment entries | Implemented | `CountService`, `StockOperations` |
| INV-07 | Lots with expiry, FEFO selection and quarantine | Implemented | `PositionService`, `InventoryLot`, `LotsPanel` |

**Orders, custody and returns**

| ID | Requirement | Status | Implementation |
|---|---|:-:|---|
| ORD-01 | Order lifecycle in [App Flow](APP_FLOW.md), including cancellation; transitions under an order lock | Partial | `OrderService`, `GeneralOrderService`. Two separate order models [PLAN-02](IMPLEMENTATION_PLAN.md) |
| ORD-02 | Commission items, assemblies and exact assets on desktop and mobile | Implemented | `OrderPickListTable`, `GeneralOrderWorkflow` |
| ORD-03 | Preparation reserves; pickup atomically converts reservations to custody | Implemented | `OrderService`, `OrderAllocationService` |
| ORD-04 | Reconcile returned, consumed, missing, damaged and written-off units against handed-over units | Implemented | `OrderReturnChecklist`, `CustodyBalanceService` |
| ORD-05 | Compare with the previous event-year order | Implemented | `OrderTraceability`, `factionOrderHistory.ts` |
| ORD-06 | Resolve SKU/QR, asset code and order code with targeted queries; returns show the quantity out and can link the originating order | Implemented | `codeResolver.ts`, `TransactionForm` |
| ORD-07 | Camera and manual code scanning; scanning never changes stock | Implemented | `CameraScanner`, `useBarcodeScanner`; nginx allows `camera=(self)` |
| RET-01 | Expected return location per item; the returner can attach a placement photo | Implemented | `Item.returnLocation`, `ReturnSubmissionForm` |
| RET-02 | A submitted return isn't stock until a warehouse worker accepts it; pending/history view with accept/reject | Implemented | `ReturnSubmissionService`, `ReturnedItems` |
| AUD-01 | Append-only order and stock history: actor, UTC time, action, from/to, delta, note, idempotency key | Implemented | `FactionOrderHistory`, `GeneralOrderHistory`, `StockTransaction` |
| AUD-02 | Show create/prepare/ready/pickup/return actors and timestamps | Implemented | `OrderTraceability` |

**Lifecycle, planning and purchasing**

| ID | Requirement | Status | Implementation |
|---|---|:-:|---|
| DAM-01 | Report → triage → repair → verify, or write off; repair never creates stock; write-off only by `hq_admin` | Implemented | `LifecycleService`, `DamageReportsList` |
| DAM-02 | Resolution comment; optionally update the item hint | Implemented | `LifecycleService`, `DamageReportsList` |
| MNT-01 | Schedules by date, operating hours or usage, per item or per asset; warning window; checkout blocking | Partial | `MaintenancePolicy`, `MaintenanceEvaluationService`, `IndividualSchedules`. Item columns duplicate the schedules [PLAN-10](IMPLEMENTATION_PLAN.md) |
| PRC-01 | Deficit = demand vs usable stock incl. expected receipts and overrides; planners/admins only | Implemented | `PlanningService`, `PlanningStockService`, `Procurement` |
| PRC-02 | Purchase orders: supplier, dates, buyer, quantity, unit price, reference; partial goods receipts; vendor documents restricted to authorized purchasing roles | Implemented | `PurchasingService`, `PurchasingOperations` |
| PRC-03 | Unreceived purchase quantity is shown separately as ordered supply and excluded from owned/available until received | Implemented | `PurchasingService`, item stock DTO |

**Ownership, members and operations**

| ID | Requirement | Status | Implementation |
|---|---|:-:|---|
| OWN-01 | Private ownership references a user account, independent of owner name, keeper, location and custodian | Implemented | `InventoryAccessPolicy.owner` |
| OWN-02 | Users create and maintain their own private items, locations and assemblies without warehouse rights | Implemented | `CatalogService`, `PrivateInventoryCommandInterceptor` |
| OWN-03 | Lending: owner consent windows, loan agreement before transfer, collection/return evidence, extensions, rental cost | Implemented | `EquipmentService`, `LoanService`, `LoansPanel`, `EquipmentOwnership` |
| MBR-01 | Member self-service: own custody, keeper assignments, requests, return submissions | Implemented | `MemberService`, `Contributor` |
| MBR-02 | Recipient-scoped action inbox and reminders (overdue returns, expiry, maintenance) | Implemented | `ActionInboxService`, `ActionInboxContent` |
| OPS-01 | Eight report snapshots with filters, freshness flag and CSV/PDF export | Implemented | `OperationalReportService`, `ReportsPanel`; freshness from sharded, commit-ordered revision counters |
| OPS-02 | Outbox with lease, retry, dead letter and operator retry; purge after 30 days | Implemented | `DomainEventService`, `OutboxDispatcher` |
| OPS-03 | CSV import with preview, dependency order and per-row results | Implemented | `CsvImportDialog`, `csvImportService` |
| OFF-01 | Queue supported field commands offline and replay them idempotently; conflicts are corrected with a new command | Implemented | `offlineQueue.ts`, `SyncService`, `SyncIssuesDialog` |
| OFF-02 | Cached catalogs keyed by account, role and normalized query; usable on a cold offline start | Implemented | `resourceFactory.ts`, `referenceDataService.ts`; collection and reference queries use `networkMode: 'offlineFirst'` |

**Security and API**

| ID | Requirement | Status | Implementation |
|---|---|:-:|---|
| SEC-01 | Authentik OIDC; the account is bound to the provider's stable subject; logout ends server-side token use | Partial | Quarkus OIDC (`principal-claim=sub`), `ActorService` (`issuer`+`sub`), `oidcClient.ts` (revocation), cross-tab logout, SSE ends at `exp`. A revoked access token stays valid until `exp` unless `OIDC_REQUIRE_INTROSPECTION` is on [ACC-01](IMPLEMENTATION_PLAN.md) |
| SEC-02 | Canonical roles from namespaced Authentik groups; factions per user; no group → no access | Implemented | `ActorService.roleFrom` / `factionsFrom` (`inventory_faction_<EVENT>_<slug>`); no role → 403; read-only `UserManagement` |
| SEC-03 | New private resources default to owner + `hq_admin`; other staff need an explicit grant | Implemented | `InventoryAccess`, ORM visibility predicate |
| SEC-04 | Owner/admin grant and revoke view access for multiple people and groups | Implemented | `InventoryAccessService`, `InventorySharing`, `InventoryAccessGroups` |
| SEC-05 | View, edit, share-management and stock-operation rights are separate; viewers can't escalate | Implemented | `InventoryAccess`, `PrivateInventoryCommandInterceptor` |
| SEC-06 | One policy across REST, MCP, nested records, search, stock, reports, media and realtime | Partial | Present via `PrivacyResponseFilter` and the reference graph; denied sets bound as one `uuid[]`; SSE carries no IDs. Query-predicate migration pending measurement [PLAN-01](IMPLEMENTATION_PLAN.md) |
| SEC-07 | Audited permission/owner changes with revision check; access rechecked on every operation | Implemented | `InventoryAccessService`, `access.changed` events |
| SEC-08 | Caches are scoped to the access context and dropped after permission changes; offline limits documented | Implemented | `no-store` private responses, session `QueryClient`, `privateInventoryCache.ts`; `access.changed` resets only queries holding private data |
| SEC-09 | Uploads are type- and size-restricted, bound to their resource, and staged uploads expire | Implemented | `MediaTypes` (sniffed WebP/PNG/JPEG/PDF), 10 MB, per-user pending quota, `StagedMediaPurge` (24 h), `InventoryMediaService` binding |
| SEC-10 | Dev authentication can't be enabled in production | Implemented | `ProductionAuthGuard`; production builds offer dev login only with explicit `DEV_LOGIN=true` |
| API-01 | Explicit DTOs; entities are never serialized | Implemented | `ApiResponses`, `ApiMapper` |
| API-02 | Each frontend contract exposes only supported operations | Implemented | Capability interfaces in `resourceFactory.ts`. Target: generated client [PLAN-04](IMPLEMENTATION_PLAN.md) |
| API-03 | Lists are paged, filtered and sorted on the server; clients never download whole collections | Partial | Endpoints support paging and search; the frontend still drains catalog pages but refetches only on relevant events [PLAN-03](IMPLEMENTATION_PLAN.md) |

## 5. Required business behavior

- Tracking modes are bulk, serialized and lot-tracked; inventory roles are consumable, returnable, repairable and rental. Serialized operations require exact assets, and serialized items cannot be consumable.
- Only usable, unreserved availability can be allocated. Preparation reserves; pickup moves into custody. Physical transfer transit is distinct from outstanding supplier orders and checked-out custody.
- Maintenance, unsafe/damaged condition, quarantine/expiry, contributor damage review and owner-consent windows can block supply. Repair changes condition; write-off reduces owned stock under the required permission.
- A submitted return is still custody until warehouse acceptance. Order outcomes reconcile against actual handover; missing units are tracked within outstanding custody.
- Private account ownership differs from display owner name, keeper, location and custodian. Grants are resource-specific; an item grant does not reveal a private location or another private component.
- History must preserve actor, UTC/server time, movement/transition and command evidence. Current broad master-data retirement is incomplete (GAP-01), and an old opening quantity fallback remains (GAP-02).
- Scanning resolves identity and never posts stock by itself. Client caches and report snapshots cannot authorize server operations.
- Roles/factions come from identity-provider groups. Logout's actual server revocation bound depends on token lifetime/introspection (ACC-01).

Exact storage semantics and current exceptions are in [Database Schema and Data Storage](DATABASE_SCHEMA.md); the lifecycle journey is in [App Flow](APP_FLOW.md).

## 6. Offline scope

Queueable commands: direct stock transaction; damage creation without media; faction-order create, prepare, transition and reconcile. Save each under the original account with a UUID, then re-authorize and validate during replay. Private mutations, uploads, general orders, member return submissions and the other operational workflows require connectivity.

Previously downloaded organizational catalogs can be read offline within the saved access context; private projections are excluded from durable catalog caching. A cold offline start can reach the cache because query readers use `offlineFirst`, but actual device/browser acceptance remains pending. Show freshness and incomplete coverage. A queued result is saved locally, not an accepted movement. Conflicts require a new linked correction command; never overwrite original evidence. See [Offline Mode](OFFLINE_MODE.md).

## 7. Functional acceptance scenarios

| Scenario | Required observable result | Requirement IDs |
|---|---|---|
| Two operators allocate the final unit | Current state prevents over-allocation; a retry cannot double-apply; consistent ledger/projections/history | INV-01/02, ORD-03, AUD-01 |
| Prepare and pick up a serialized kit | Fixed component quantities and exact eligible asset IDs; reservation precedes custody; pickup actor/time/evidence retained | CAT-02/03, INV-04, ORD-02/03, AUD-02 |
| Member submits a return then warehouse accepts/rejects | Pending return remains custody; acceptance changes stock once; rejection preserves evidence without receipt | RET-01/02, MBR-01, ORD-04 |
| Dispatch transfer, then receive part | Units in transit remain separate from custody/on-hand; discrepancy and remaining quantity are visible | INV-05 |
| Count a material variance | Blind observation/recount followed by a different admin's approval; posting creates audited adjustment | INV-06 |
| Receive part of a purchase | Only posted received quantity affects stock; unreceived quantity remains ordered; document access restricted | PRC-02/03 |
| Repair or write off damaged equipment | Repair does not create units; verification/maintenance controls usability; unauthorized write-off denied | DAM-01/02, MNT-01, INV-02 |
| Grant/revoke access to private equipment/location | Owner/HQ/grantee scope; no incidental location/ancestor/media leak; permissions checked across REST/MCP/cache | CAT-05, LOC-02, SEC-03..09 |
| Restart offline and reconnect under another account | Correct cached account context; original-owner queue isolation; commands replay once or expose conflict correction | OFF-01/02, SEC-08 |
| Review report or scan an alias | Report freshness/filter/export explicit; retired code never reused; scan does not mutate stock | OPS-01, CAT-08, ORD-06/07 |

These scenarios define acceptance; no such acceptance run was performed in this documentation pass. Refer to [tests/README.md](../tests/README.md) for existing regression ownership and [Implementation Plan](IMPLEMENTATION_PLAN.md) for ACC-01..05.

## 8. Review measures and open decisions

Acceptance should measure correct final stock/custody, absence of duplicate application, preserved audit evidence, permitted/denied visibility, successful field recovery and time to complete common pickup/return tasks. No numeric performance SLA, throughput target, RPO or RTO is established by current source inspection.

Resolve broad retirement versus guarded deletion (GAP-01), ledger-only opening balances (GAP-02), and the intended logout revocation bound (GAP-03/ACC-01). Keep future framework replacements out of feature completion claims. The [Implementation Plan and Progress](IMPLEMENTATION_PLAN.md) is the single open-work register.
