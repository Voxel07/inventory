# Product Requirements Document

This document owns product features, business rules and functional acceptance. Frameworks belong in [Technical Requirements](TECHNICAL_REQUIREMENTS.md), journeys in [App Flow](APP_FLOW.md), and open work in [Implementation Plan and Progress](IMPLEMENTATION_PLAN.md).

## 1. Purpose and outcomes

ASH Inventory manages equipment for recurring airsoft events: catalog/storage, faction demand, procurement, warehouse preparation, custody handover/returns, damage/repair/maintenance, counts/transfers, private equipment lending and movement history.

Quality goals, in order:

1. **Stock correctness:** atomic, idempotent changes validated against current state under locks.
2. **Traceability:** actor, server time, source, delta and command evidence for movements/transitions.
3. **Privacy:** private resources available only to their account owner, the inventory admin, explicit grantees (directly, through a group or through the storage location they are kept in) and, read-only, organization members when the owner offers them for use.
4. **Field resilience:** previously cached reads and supported queued commands, with the server authoritative.
5. **Simplicity:** one model per concept and explicit contracts; disposable development data.

The last goal is partly a target: order models, maintenance state and visibility mechanisms still need consolidation. This product supports equipment operations, not a separate payment/accounting system. Automatic database failover and universal offline mutation support are not current delivered capabilities.

## 2. Users and responsibilities

Roles form a ladder, listed from least to most privileged; each role includes the rights of the roles before it. Authentik membership in `inventory` grants access; the inventory admin assigns one or more roles and factions in the app; the highest assigned role determines access, and new users start as read only. The full matrix and scenarios are in [Authentik setup §3](AUTHENTIK_SETUP.md#3-access-and-roles).

| Persona / role | Primary product work |
|---|---|
| Tenant (`tenant`) | Only own private inventory: private items, assemblies and storage locations (e.g. a rented building), own share groups, offering items for use and answering requests. No company data. |
| Read-only participant (`read_only`) | Reads company catalog, participants, event timing and all orders; adds no items, assemblies or storage locations (not even private ones) |
| Faction leader (`faction_leader`) | Faction orders for provider-assigned factions; returns and reports for items in own custody |
| ASH crew (`ash`) | Crew members who create general orders, take out items and pick up prepared orders |
| Warehouse crew (`warehouse_crew`) | Company catalog and storage, preparation, handing out and taking back (pickup, returns, damage reports, custody overview), all operations (stock, counts, transfers, loans, receiving, purchasing, maintenance, repairs), history and reports |
| Inventory admin (`admin`) | Everything: events, participants and timing, procurement planning, write-off, count variance approval, users, recovery, all private resources |
| Equipment owner / member | A user responsibility, not an additional role: private resources, consent, requests, returns and reminders |
| MCP client | Authorized tool/resource interaction under the user's same business policies; not available to tenants |

Every account can own private resources and share them. Roles do not bypass private resource access except the inventory admin. The identity provider controls who may use the system; only the inventory admin assigns roles and factions in the app.

## 3. Capability map

| Product area | Features and functions | Detailed requirement families |
|---|---|---|
| Catalog | Metadata/images/category-specific fields, serialized asset drill-down, assemblies and QR/label identity | CAT, ORD-06/07 |
| Locations and stock | Location → section → storage place tree, maps, positions, exact assets, lots/FEFO, quarantine, transfers and counts | LOC, INV |
| Planning and purchasing | Occurrences/factions, demand/supply deficits and overrides, purchase orders, partial receipts and vendor evidence | PRC |
| Orders and custody | Faction/general demand, preparation, pickup, partial returns, reconciliation, cancellation and history | ORD, AUD |
| Return verification | Member placement evidence and warehouse accept/reject before stock changes | RET |
| Equipment lifecycle | Damage/repair/verification/write-off, schedule-based checkout blocks and warnings | DAM, MNT |
| Ownership and lending | Account-owned inventory, sharing, consent commitments, loan/rental terms, collection/return and extensions | OWN, SEC-03..08 |
| Member work | Personal custody/keepers/requests, recipient inbox, reminders | MBR |
| Operations | Snapshot reports, CSV/PDF, CSV import, outbox/dead-letter recovery and offline correction | OPS, OFF |
| Access and interfaces | Identity/role/faction mapping, privacy, media policy, REST/MCP contracts and bounded reads | SEC, API |

Legacy F-labels map as follows: F01 events; F02 planning; F03/F04/F14 purchasing/receiving/vendor documents; F06 transfers; F08 return submissions; F10 counts; F11 lots; F12/F13 maintenance/lifecycle; F15 locations; F16 offline recovery; F17 reports; F18 outbox; F19 ownership/consent; F20 self-service; F21 reminders; F22 labels; F23 loans/rental. The detailed IDs below are the maintained traceability set.

## 4. Functional requirement register

**Implemented** means the feature exists in source, not that current browser, concurrency or production acceptance has passed. **Partial** records an architectural target or explicit requirement gap. **Planned** is a future implementation.

**Catalog and locations**

| ID | Requirement | Status | Implementation |
|---|---|:-:|---|
| CAT-01 | Maintain items with images, category, event tags, hint, value, storage and return location | Implemented | `CatalogService`, `ItemForm`, `ItemDetail`, `MediaService` |
| CAT-02 | Maintain assemblies with fixed component quantities; an assembly is visible only if every component is | Implemented | `CatalogService`, `ApiQueryService.projectAssemblies`, `AssemblyDetail` |
| CAT-03 | Serialized equipment is one parent item with aggregate stock and `minStock`, batch asset-ID generation, and asset drill-down (state, location, hours, custodian) | Implemented | `AssetInstance`, `AssetInstancesList`, `AssetDetail` |
| CAT-04 | Item detail shows free-form product info, stock, images, history and assets | Implemented | `ItemDetail` |
| CAT-05 | Shared/event catalog plus private items visible to owner, `admin` and grantees | Implemented | `InventoryAccessPolicy` is the only visibility rule; scoped `CatalogOrm`. Predicate consolidation of the response filter is [PLAN-01](IMPLEMENTATION_PLAN.md) |
| CAT-06 | Typed category data: vehicle fuel l/100 km and battery date; generator hours and maintenance log; food best-before | Implemented | `Item`, `ItemForm`, `MaintenanceRecord` |
| CAT-07 | Tracking mode is immutable once stock or movements exist (API and UI); serialized items can't be consumable | Implemented | `CatalogService`, `ItemForm` |
| CAT-08 | Unique SKU/asset codes; items, locations and assemblies are retired, not deleted; event occurrences are deletable only while unreferenced | Implemented | `CatalogService.retireItem`/`retireAssembly`, location retirement, `CatalogOrm.hasEventHistory` |
| LOC-01 | Georeferenced storage tree ([Storage locations](STORAGE_LOCATIONS.md)): top-level locations (sites, no stock) → sections → nestable storage places; no cycles; each level has a short code unique among the siblings its editor can see and a derived full code (`BH-CE-R2-F7`); a private parent accepts sub-locations only from its editors | Implemented | `LocationHierarchyService`, `StorageLocations`, `StorageLocationMap` |
| LOC-03 | One structure dialog finds or creates a location by name and adds sections and storage places (bulk generation such as Regal 1–4 × Fach 1–8) in one save; the list is grouped by location or flat; QR label sheets per location or section | Implemented | `CatalogService.saveStructure`, `StorageStructureDialog`, `StorageLocationList`, `StorageLabels` |
| LOC-02 | Private locations protect address, coordinates, overlays, hierarchy and contents | Implemented | `StorageLocation.accessPolicy`, `ApiMapper` redaction, `InventorySharing` |

**Stock**

| ID | Requirement | Status | Implementation |
|---|---|:-:|---|
| INV-01 | Distinguish owned, on-hand, checked-out, in-transit, damaged, reserved, available and ordered (see [stock semantics](DATABASE_SCHEMA.md)) | Implemented | `InventoryOperationsService.StockState`, `StockPolicy`; one item eligibility predicate `AvailabilityData.eligible()` for commands, planning, reports and MCP |
| INV-02 | Block over-allocation and checkout of unsafe or overdue equipment under lock | Implemented | `InventoryOperationsService`, `OrderService`, `MaintenancePolicy` |
| INV-03 | Event-use checkouts carry event and faction; general (out-of-game) use carries neither; direct check-in settles one exact custody (custodian, event); both stored on the immutable transaction | Implemented | `TransactionForm`, `InventoryOperationsService`, `StockTransaction` |
| INV-04 | Serialized stock moves by exact asset only; batches of assets can be assigned per faction order | Implemented | `OrderService`, `OrderPickListTable` |
| INV-05 | Transfers: dispatch → transit → (partial) receipt with discrepancies; transit is not custody | Implemented | `TransferService`, `TransfersPanel` |
| INV-06 | Counts: blind count and recount; a different admin approves material variance; posting creates adjustment entries | Implemented | `CountService`, `StockOperations` |
| INV-07 | Lots with expiry, FEFO selection and quarantine | Implemented | `PositionService`, `InventoryLot`, `LotsPanel` |

**Orders, custody and returns**

| ID | Requirement | Status | Implementation |
|---|---|:-:|---|
| ORD-01 | Order lifecycle in [App Flow](APP_FLOW.md), including cancellation; transitions under an order lock | Implemented | `InventoryOrder.kind`, one `OrderService`, shared reservations/history/custody [PLAN-02](IMPLEMENTATION_PLAN.md); runtime acceptance pending |
| ORD-02 | Commission items, assemblies and exact assets on desktop and mobile; general orders request items only | Implemented | `OrderPickListTable`, `GeneralOrderWorkflow` (`GeneralOrderInput.requestedQuantities`) |
| ORD-03 | Preparation reserves; pickup atomically converts reservations to custody | Implemented | `OrderService`, `OrderAllocationService` |
| ORD-04 | Reconcile returned, consumed, missing, damaged and written-off units against handed-over units; write-off by `admin` with reason lets orders with lost units close | Implemented | `OrderReturnChecklist`, `OrderService.returnItems`, `CustodyBalanceService` |
| ORD-05 | Opt-in comparison with the previous event-year order | Implemented | `OrderTraceability`, `factionOrderHistory.ts` |
| ORD-06 | Resolve SKU/QR, asset code and order code with targeted queries; returns show the quantity out and can link the originating order | Implemented | `codeResolver.ts`, `TransactionForm` |
| ORD-07 | Camera and manual code scanning; scanning never changes stock | Implemented | `CameraScanner`, `useBarcodeScanner`; nginx allows `camera=(self)` |
| ORD-08 | Group ordered/prepared items by responsible person; separate pickup points per group and recipient-scoped in-app notices | Implemented | `OrderPickupService`, `OrderPickupGroups`, `ItemResponsiblePerson`; applies to faction and general orders, including assembly components of faction orders |
| RET-01 | Expected return location per item; the returner can attach a placement photo | Implemented | `Item.returnLocation`, `ReturnSubmissionForm` |
| RET-02 | A submitted return isn't stock until a warehouse worker accepts it; pending/history view with accept/reject | Implemented | `ReturnSubmissionService`, `ReturnedItems` |
| AUD-01 | Append-only order and stock history: actor, UTC time, action, from/to, delta, note, idempotency key | Implemented | `OrderHistory`, `StockTransaction` |
| AUD-02 | Show create/prepare/ready/pickup/return actors and timestamps | Implemented | `OrderTraceability` |

**Lifecycle, planning and purchasing**

| ID | Requirement | Status | Implementation |
|---|---|:-:|---|
| DAM-01 | Report → triage → repair → verify, or write off; repair never creates stock; write-off only by `admin` | Implemented | `LifecycleService`, `DamageReportsList` |
| DAM-02 | Resolution comment; optionally update the item hint | Implemented | `LifecycleService`, `DamageReportsList` |
| MNT-01 | Schedules by date, operating hours or usage, per item or per asset; warning window; checkout blocking | Partial | `MaintenancePolicy`, `MaintenanceEvaluationService`, `IndividualSchedules`. Item columns duplicate the schedules [PLAN-10](IMPLEMENTATION_PLAN.md) |
| MNT-02 | Runtime-tracked items/assets book every meter change as a runtime entry (hours, reading after, event/order, source, actor); returning a runtime-tracked unit to stock requires the hours run; readings never go backwards except through an explicit correction | Implemented | `RuntimeService`, `runtime_entries`, `Item.tracksRuntime`, `RuntimeReturnField`, `OperatingHoursDialog` |
| PRC-01 | Deficit = demand vs usable stock incl. expected receipts and overrides; planners/admins only | Implemented | `PlanningService`, `PlanningStockService`, `Procurement` |
| PRC-02 | Purchase orders: supplier, dates, buyer, quantity, unit price, reference; partial goods receipts; vendor documents restricted to authorized purchasing roles | Implemented | `PurchasingService`, `PurchasingOperations` |
| PRC-03 | Unreceived purchase quantity is shown separately as ordered supply and excluded from owned/available until received | Implemented | `PurchasingService`, item stock DTO |
| EVT-01 | Per-event attendee list drawn from a shared people registry (renames apply at every event; optional, not required, Authentik account link); one or more predefined roles per attendance — faction leader, faction deputy and HQ crew per faction, AS-Held, event crew with assigned work; arrival/departure defaulting to the event dates; day-based food stamps with editable event rates (4 regular + 1 breakfast on full days, 2 regular on the first catering day, breakfast only on the last), total/remaining issuance, role/arrival sorting, faction colors and notes | Implemented | `EventAttendees`, `EventLogisticsService`, `event_people`/`event_attendees`/`event_attendee_roles`; staff reads and planner/admin writes; `EventLogisticsApiTest` |
| EVT-02 | Event timeline with in-game, setup/preparation and crew catering tabs, chronological day groups, start/optional end, owner/team, area, progress and notes; preparation can extend beyond event dates | Implemented | `EventTimeline`, `EventLogisticsService`, `event_timeline_entries`; event-local times, online writes and SSE invalidation |

**Ownership, members and operations**

| ID | Requirement | Status | Implementation |
|---|---|:-:|---|
| OWN-01 | Private ownership references a user account, independent of owner name, keeper, location and custodian | Implemented | `InventoryAccessPolicy.owner` |
| OWN-02 | Users create and maintain their own private items, locations and assemblies without warehouse rights | Implemented | `CatalogService`, `PrivateInventoryCommandInterceptor` |
| OWN-03 | Lending: owner consent windows, loan agreement before transfer, collection/return evidence, extensions, rental cost | Implemented | `EquipmentService`, `LoanService`, `LoansPanel`, `EquipmentOwnership` |
| MBR-01 | Member self-service: own custody, keeper assignments, requests, return submissions | Implemented | `MemberService`, `Contributor` |
| MBR-02 | Recipient-scoped action inbox and reminders (overdue returns, expiry, maintenance) | Implemented | `ActionInboxService`, `ActionInboxContent` |
| OPS-01 | Eight report snapshots with filters, freshness flag and CSV/PDF export | Implemented | `OperationalReportService`, `ReportsPanel`, `reportPdf`; both exports read one generation-checked snapshot; freshness from sharded, commit-ordered revision counters |
| OPS-02 | Outbox with lease, retry, dead letter and operator retry; purge after 30 days | Implemented | `DomainEventService`, `OutboxDispatcher` |
| OPS-03 | CSV import with preview, dependency order and per-row results | Implemented | `CsvImportDialog`, `csvImportService` |
| OFF-01 | Queue supported field commands offline and replay them idempotently; conflicts are corrected with a new command | Implemented | `offlineQueue.ts`, `SyncService`, `SyncIssuesDialog` |
| OFF-02 | Cached catalogs keyed by account, role and normalized query; usable on a cold offline start | Implemented | `resourceFactory.ts`, `referenceDataService.ts`; collection and reference queries use `networkMode: 'offlineFirst'` |

**Security and API**

| ID | Requirement | Status | Implementation |
|---|---|:-:|---|
| SEC-01 | Authentik OIDC; the account is bound to the provider's stable subject; logout ends server-side token use | Partial | Quarkus OIDC (`principal-claim=sub`), `ActorService` (`issuer`+`sub`), `oidcClient.ts` (revocation), cross-tab logout, SSE ends at `exp`. A revoked access token stays valid until `exp` unless `OIDC_REQUIRE_INTROSPECTION` is on [ACC-01](IMPLEMENTATION_PLAN.md) |
| SEC-02 | One Authentik group (`inventory`) grants access; role ladder and factions are managed in the app by the inventory admin (audited, revision-checked, last admin kept); new users start as read only | Implemented | `ActorService.hasAccess`, bootstrap admins, `UserService.updateAccess` (`PATCH /api/users/{id}`), `UserManagement` |
| SEC-03 | New private resources default to owner + `admin`; other staff need an explicit grant. Tenants see no company resources and reach no organization API | Implemented | `InventoryAccess`, ORM visibility predicate (`:accessPublic`), `TenantScopeFilter` |
| SEC-04 | Owner/admin grant and revoke view access for multiple people and groups; every user manages own share groups; shares of a private location apply to its private sub-locations and the items stored there | Implemented | `InventoryAccessService`, `InventoryAccessInheritance` (`inventory_access_links`), `InventorySharing`, `InventoryAccessGroups`, `/sharing` |
| SEC-05 | View, edit, share-management and stock-operation rights are separate; viewers can't escalate | Implemented | `InventoryAccess`, `PrivateInventoryCommandInterceptor` |
| SEC-06 | One policy across REST, MCP, nested records, search, stock, reports, media and realtime | Partial | Present via `PrivacyResponseFilter` and the reference graph; denied sets bound as one `uuid[]`; SSE carries no IDs. Query-predicate migration pending measurement [PLAN-01](IMPLEMENTATION_PLAN.md) |
| SEC-07 | Audited permission/owner changes with revision check; access rechecked on every operation | Implemented | `InventoryAccessService`, `access.changed` events |
| SEC-08 | Caches are scoped to the access context and dropped after permission changes; offline limits documented | Implemented | `no-store` private responses, session `QueryClient`, `privateInventoryCache.ts`; `access.changed` resets only queries holding private data |
| SEC-09 | Uploads are type- and size-restricted, bound to their resource, and staged uploads expire | Implemented | `MediaTypes` (sniffed WebP/PNG/JPEG/PDF), 10 MB, per-user pending quota, `StagedMediaPurge` (24 h), `InventoryMediaService` binding |
| SEC-10 | Dev authentication can't be enabled in production | Implemented | `ProductionAuthGuard`; production builds offer dev login only with explicit `DEV_LOGIN=true` |
| SEC-11 | Owners offer private items for use: organization members view and order them read-only (against owner commitments); the owner is notified once per order or request | Implemented | `InventoryAccessPolicy.publicUse`, `@PrivateInventoryCommand(usage = true)`, `ItemRequestNotifier` (`item_requested`) |
| API-01 | Explicit DTOs; entities are never serialized | Implemented | `ApiResponses`, `ApiMapper` |
| API-02 | Each frontend contract exposes only supported operations | Implemented | Capability interfaces in `resourceFactory.ts`. Target: generated client [PLAN-04](IMPLEMENTATION_PLAN.md) |
| API-03 | Lists are paged, filtered and sorted on the server; clients load further pages on demand | Implemented | `@Paged` + `X-Has-More`, `usePagedList`, server-search pickers [PLAN-03](IMPLEMENTATION_PLAN.md). Complete reads are limited to bounded sets: the location tree, one item's positions/assets/lots, user pickers, one event's faction orders, exports/imports and the offline snapshot |

## 5. Required business behavior

- Tracking modes are bulk, serialized and lot-tracked; inventory roles are consumable and returnable. Serialized operations require exact assets, and serialized items cannot be consumable.
- Only usable, unreserved availability can be allocated. Preparation reserves; pickup moves into custody. Physical transfer transit is distinct from outstanding supplier orders and checked-out custody.
- Maintenance, unsafe/damaged condition, quarantine/expiry, contributor damage review and owner-consent windows can block supply. Repair changes condition; write-off reduces owned stock under the required permission.
- A submitted return is still custody until warehouse acceptance. Order outcomes reconcile against actual handover; missing units are tracked within outstanding custody.
- Private account ownership differs from display owner name, keeper, location and custodian. Grants are resource-specific; an item grant does not reveal a private location or another private component.
- History must preserve actor, UTC/server time, movement/transition and command evidence. Items, locations and assemblies are retired, never deleted; event occurrences can be deleted only while nothing references them. Stock quantities come only from the ledger; the opening amount on item creation is an `added` movement.
- Scanning resolves identity and never posts stock by itself. Client caches and report snapshots cannot authorize server operations.
- The identity provider controls who may sign in; roles and factions are app-user data assigned by the inventory admin. Logout's actual server revocation bound depends on token lifetime/introspection (ACC-01).

Exact storage semantics and current exceptions are in [Database Schema and Data Storage](DATABASE_SCHEMA.md); the lifecycle journey is in [App Flow](APP_FLOW.md).

## 6. Offline scope

Queueable commands: direct stock transaction; damage creation without media; faction/general order create, prepare, transition and reconcile. Save each under the original account with a UUID, then re-authorize and validate during replay. Private mutations, uploads, order edits, member return submissions and the other operational workflows require connectivity.

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
| Review report or scan a code | Report freshness/filter/export explicit; scan does not mutate stock | OPS-01, CAT-08, ORD-06/07 |

These scenarios define acceptance; the runs are still open. Refer to [tests/README.md](../tests/README.md) for existing regression ownership and [Implementation Plan](IMPLEMENTATION_PLAN.md) for ACC-01..05.

## 8. Review measures and open decisions

Acceptance should measure correct final stock/custody, absence of duplicate application, preserved audit evidence, permitted/denied visibility, successful field recovery and time to complete common pickup/return tasks. No numeric performance SLA, throughput target, RPO or RTO is established by current source inspection.

Verify the logout revocation bound (GAP-03/ACC-01) and decide the deferred workflows (notification channel, offboarding, personal-data retention) listed as FEAT-01..03. Keep future framework replacements out of feature completion claims. The [Implementation Plan and Progress](IMPLEMENTATION_PLAN.md) is the single open-work register.

## 9. Glossary

Domain terms with their German UI label (where the UI has one) and the identifier used in code. Note that the UI follows the legal distinction *Eigentümer* (owner) versus *Besitzer* (current holder/custodian). Several terms describe *who is related to equipment* and are deliberately separate; mixing them up is the most common source of wrong assumptions.

### People and responsibility

| Term | German | Code | Meaning |
|---|---|---|---|
| Account owner | Eigentümer (Konto) | `InventoryAccessPolicy.owner` | The user account that owns a **private** item, location or assembly and controls who may see/edit it. Organization equipment has no account owner. |
| Display owner | Eigentümer (Anzeige) | `Item.ownerName` | Free-text name shown for externally or privately owned equipment. Grants no rights. |
| Keeper | Verwahrer | `Item.keeperName`, `StorageLocation.keeperUser` | Person who stores equipment between events (e.g. at home). Not the account owner and not a custodian. |
| Custodian | Besitzer | `AssetInstance.currentCustodian`, custody handover | Person who currently holds checked-out equipment, from pickup until accepted return. |
| Collector | Abholer | `collectorName` on orders/handovers | Person who physically picked up an order; may differ from the faction leader who ordered it. |
| Grantee | Freigabe-Empfänger | `inventory_access_grants` | User or access group given view or edit access to a private resource. |
| ASH crew | ASH-Crew | `ash` role | Crew member who requests equipment through general orders; the warehouse prepares and hands it out. |
| Tenant | Mieter | `tenant` role | Person who rents storage (e.g. a building) and only manages their own private equipment there. |
| Offer for use | Zur Nutzung angeboten | `InventoryAccessPolicy.publicUse` | A private item its owner lets organization members see and request; handing it out still needs the owner's commitment. |
| Faction | Fraktion | `factions`, `EVENT:slug` | A team within an event type. Faction leaders order for their factions. |

### Equipment and stock

| Term | German | Code | Meaning |
|---|---|---|---|
| Item | Artikel | `Item` | Catalog entry. Tracking mode is bulk, serialized or lot-tracked. |
| Asset | Gerät | `AssetInstance` | One physical serialized unit with its own code and state. |
| Assembly | Baugruppe | `Assembly` | Kit with fixed component quantities (e.g. radio set). |
| Lot | Charge | `InventoryLot` | Batch of a lot-tracked item with expiry; picked FEFO (first expired, first out). |
| Position | Bestandsposition | `InventoryPosition` | Quantity of an item (and lot) at one location. |
| Retire | Stilllegen | `active = false` | Remove from use while keeping codes and history. Items, locations and assemblies are retired, never deleted. |
| On hand / available / reserved | Vor Ort / Verfügbar / Reserviert | `StockState` | See [stock semantics](DATABASE_SCHEMA.md#5-stock-authority-and-invariants). |
| In transit | Unterwegs | transfer | Moving between locations; not custody. |
| Ordered | Bestellt | purchase order | Supplier quantity not yet received; not stock. |
| Quarantine | Quarantäne | lot/position status | Blocked from allocation pending a decision. |

### Workflows

| Term | German | Meaning |
|---|---|---|
| Event occurrence | Event | One dated run of an event type (e.g. LS 2026). |
| Faction order | Fraktionsbestellung | Equipment request of a faction for an event; follows the [order lifecycle](APP_FLOW.md#5-orders-preparation-handover-and-reconciliation). |
| General order | Allgemeine Bestellung | Equipment request not tied to a faction (e.g. HQ, logistics). |
| Preparation | Vorbereiten | Picking and reserving stock for an order. |
| Handover / pickup | Übergabe / Abholung | Turns reservations into custody. |
| Return submission | Rückgabemeldung | Member reports a return; stock changes only after warehouse acceptance. |
| Reconciliation | Rückgabeabgleich | Accounting of returned, consumed, damaged, missing and written-off units against handed-over units. |
| Write-off | Abschreibung | Permanent reduction of owned stock (inventory admin only). |
| Commitment | Zusage | Owner's consent to lend private equipment for a time window. |
| Loan / rental | Leihe / Miete | Agreement for lending a commitment, with collection and return evidence. |
| Blind count | Blindzählung | Stock count without showing expected quantities. |
| Sync issue | Sync-Problem | Offline command the server rejected; corrected with a new linked command. |
