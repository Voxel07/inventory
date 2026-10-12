# Database Schema and Data Storage

Reviewed: 12 October 2026 · source baseline: `82863bd` plus the working tree.

This document owns backend persistence, relationships, stock authority and browser/media storage. The exact executable schema is [V1.0.0__init.sql](../backend/src/main/resources/db/migration/V1.0.0__init.sql); JPA mappings are in [model/](../backend/src/main/java/org/ash/inventory/model). This is a source review, not an inspection of a deployed database. Planned model changes are in [Implementation Plan](IMPLEMENTATION_PLAN.md).

## 1. Persistence boundaries

| Store | Contents | Authority / lifetime |
|---|---|---|
| PostgreSQL | Catalog, positions, assets, orders, ledger, custody, policy, lifecycle, purchasing, reports, audit and outbox | Authoritative business state |
| Local disk or Garage S3 | Images, certificates, acknowledgements and supplier documents | Resource-bound files; database retains references |
| Valkey (cluster only) | Event fan-out and distributed rate limiting | Infrastructure coordination, not authoritative inventory |
| Per-node Caffeine | Faction reference data keyed by database revision | Expiring reference cache |
| Session TanStack Query cache | API results and private projections | Active account's in-memory view |
| IndexedDB `ash-inventory` | Organizational catalog cache, offline commands, failures and history | Device/account-scoped snapshots; never stock authority |
| IndexedDB `ash-auth` | Persisted OIDC session for cold starts | Cleared at logout; valid online tokens still required |
| Browser Cache API | PWA shell and same-origin assets | Build-versioned app files; excludes API and third parties |
| localStorage | Theme mode and selected event preference | UI preferences, not inventory |

## 2. Schema conventions

The baseline declares **55 tables**. Most domain entities have UUID IDs and creation/update timestamps. Exceptions include bigint identity faction-order history, composite join tables, report rows keyed by report name, and revision counters keyed by `(name, shard)`. SQL enum-like fields use string/check constraints; JSON is PostgreSQL `jsonb`. Calendar dates use `date`, instants use timestamp with time zone, money generally uses integer cents and meters use decimal numeric values.

Flyway initializes the same editable baseline in dev/test/prod; Hibernate validates. Current data is disposable. Schema/entity changes update this baseline directly; do not add incremental migrations or compatibility readers. The test profile cleans its configured PostgreSQL test database at startup. No database reset or schema change was performed for this review.

Some columns and foreign keys are added later inside the same baseline, so the complete SQL file, not just the opening CREATE TABLE blocks, defines the schema. A non-null UUID inside JSON or a polymorphic target does not automatically have a foreign key.

## 3. Domain relationships

The diagram shows primary relational links, not every optional FK or JSON reference. Arrows do not imply cascading deletion.

```mermaid
erDiagram
    APP_USERS ||--o{ INVENTORY_ACCESS_POLICIES : owns
    INVENTORY_ACCESS_POLICIES ||--o{ INVENTORY_ACCESS_GRANTS : grants
    INVENTORY_ACCESS_POLICIES o|--o| ITEMS : protects
    INVENTORY_ACCESS_POLICIES o|--o| STORAGE_LOCATIONS : protects
    INVENTORY_ACCESS_POLICIES o|--o| ASSEMBLIES : protects
    WAREHOUSES ||--o{ STORAGE_LOCATIONS : contains
    STORAGE_LOCATIONS o|--o{ STORAGE_LOCATIONS : parent
    ITEMS ||--o{ ASSET_INSTANCES : serializes
    ITEMS ||--o{ INVENTORY_LOTS : groups
    ITEMS ||--o{ INVENTORY_POSITIONS : projects
    STORAGE_LOCATIONS ||--o{ INVENTORY_POSITIONS : stores
    INVENTORY_LOTS o|--o{ INVENTORY_POSITIONS : identifies
    ITEMS ||--o{ STOCK_TRANSACTIONS : records
    ASSEMBLIES ||--o{ ASSEMBLY_ITEMS : contains
    ITEMS ||--o{ ASSEMBLY_ITEMS : component
    EVENT_OCCURRENCES ||--o{ FACTION_ORDERS : scopes
    FACTIONS ||--o{ FACTION_ORDERS : requests
    FACTION_ORDERS ||--o{ FACTION_ORDER_LINES : contains
    ITEMS ||--o{ FACTION_ORDER_LINES : requested
    FACTION_ORDER_LINES ||--o{ STOCK_RESERVATIONS : reserves
    FACTION_ORDERS ||--o{ CUSTODY_HANDOVERS : hands_over
    CUSTODY_HANDOVERS ||--o{ CUSTODY_HANDOVER_LINES : contains
    FACTION_ORDER_LINES ||--o{ RETURN_RECONCILIATIONS : reconciles
    ITEMS ||--o{ RETURN_SUBMISSIONS : pending_check
    ITEMS o|--o{ DAMAGE_REPORTS : incident
    DAMAGE_REPORTS ||--o| REPAIR_CASES : repair
    ITEMS ||--o{ MAINTENANCE_SCHEDULES : schedules
    MAINTENANCE_SCHEDULES o|--o{ MAINTENANCE_RECORDS : evidence
    VENDORS o|--o{ PURCHASE_ORDERS : supplies
    PURCHASE_ORDERS ||--o{ PURCHASE_ORDER_LINES : contains
    PURCHASE_ORDERS ||--o{ GOODS_RECEIPTS : receives
    GOODS_RECEIPTS ||--o{ GOODS_RECEIPT_LINES : contains
    ITEMS ||--o{ EQUIPMENT_COMMITMENTS : commits
    EQUIPMENT_COMMITMENTS ||--o| LOAN_ARRANGEMENTS : agreement
```

General orders form a separate aggregate: creator and optional event are relational; line quantities/source locations/asset assignments are JSON maps rather than `general_order_lines`. Damage can target an item **or** an assembly (XOR), so the item relationship shown above is optional for assembly incidents.

## 4. Table inventory

### Identity and access (6 tables)

| Table | Key data and relationships |
|---|---|
| `app_users` | UUID; unique `(issuer, external_subject)`; name/email, role, JSON faction memberships mirrored from OIDC |
| `inventory_access_policies` | UUID; owner user FK; revision and timestamps |
| `inventory_access_groups` | UUID; unique name plus case-insensitive name index; revision |
| `inventory_access_group_members` | Composite `(group_id, user_id)` PK; group/user FKs |
| `inventory_access_grants` | Policy plus user **or** group; `can_edit`; XOR grantee check; unique grant per policy/grantee |
| `inventory_media_objects` | Unique object key; uploader FK; optional resource type/ID pair; both absent means staged |

Items, locations and assemblies each have a unique nullable `access_policy_id`. A policy establishes private access and account ownership; legacy item `visibility_scope`, assigned user/group and event scopes still coexist (PLAN-01). Display `owner_name`, keeper, location keeper and current custodian are different roles. Policy grants do not transitively disclose private components or locations.

### Catalog and storage geography (6 tables)

| Table | Key data and relationships |
|---|---|
| `items` | UUID, unique SKU, category/subcategory, description/hint, event tags, active flag, tracking mode, inventory role, minimum stock, value cents, ownership/consent metadata; storage/return locations; category meters/dates |
| `item_images` | UUID; item FK, object key and display order |
| `assemblies` | UUID; name/description/hint, image object key, event tags and optional access policy |
| `assembly_items` | Composite `(assembly_id, item_id)` PK; component quantity |
| `warehouses` | UUID; unique code, name/description and active flag |
| `storage_locations` | UUID; warehouse, parent location and keeper user FKs; type, address-like fields, coordinates, zoom, overlay URL/bounds, active flag and optional access policy |

Location services enforce no cycles and same-warehouse parentage. Item tracking mode becomes immutable after stock or movements; serialized items cannot be consumable. Code resolves identities without changing stock. Category data includes vehicle fuel consumption/battery due date, generator operating hours and food best-before.

**Current retirement gap:** items and locations are deactivated, but assemblies have no active flag and `CatalogService.deleteAssembly` removes composition/policy/entity. Unlinked events are removed by `deleteEvent`. FKs from order lines/damage may constrain deletion; this is not general retirement support (GAP-01).

### Stock and warehouse operations (9 tables)

| Table | Key data and relationships |
|---|---|
| `asset_instances` | UUID; item/current location/current custodian FKs; unique asset code; availability/condition/service state, hours, serial/manufacturer, active flag and version |
| `inventory_lots` | UUID; item FK; unique `(item_id, lot_number)`; expiry/best-before/manufacture, supplier lot, requirements and status |
| `inventory_positions` | UUID; item/location/optional lot FKs; on-hand, reserved, damaged, quarantined and transit quantities; last count; version |
| `stock_transactions` | UUID; item/actor FKs plus optional asset/lot/order/event/damage/locations; movement type, quantity, UTC time, reason/notes, before/after availability, idempotency UUID, position map and related-entity reference |
| `stock_reservations` | UUID; item/asset/order/line/location/creator links; requested/reserved/released quantities and status; version; unique active asset reservation key |
| `inventory_transfers` | UUID; source/destination locations, requester/receiver, unique transfer number and idempotency key, status, dispatch/receipt times |
| `inventory_transfer_lines` | UUID; transfer/item/optional asset/lot FKs; requested/picked/received/discrepancy quantities |
| `inventory_count_sessions` | UUID; unique session number; warehouse/location/item/category scope, blind flag, creator/approver, status/times |
| `inventory_count_lines` | UUID; session/item/location/lot/asset links; observed/recounted/approved/variance quantities and expected asset version/state |

The position uniqueness constraint is `(item_id, location_id, lot_id)`. It uses PostgreSQL's ordinary nullable-key semantics; it does **not** by itself enforce a single null-lot row. Operational uniqueness and locking must also be assessed in the services/ORM, rather than inferred from this constraint.

### Events, orders and custody (10 tables)

| Table | Key data and relationships |
|---|---|
| `event_occurrences` | UUID; event type/name/status, start/end dates, planned/used JSON quantities |
| `factions` | UUID; unique `(event_type, slug)`, name and active flag |
| `faction_orders` | UUID; event/faction/creator FKs; unique order code; status, pickup location/coordinates/date, collector and lifecycle actors |
| `faction_order_lines` | UUID; order/item/source assembly FKs; requested, allocated, reserved, prepared, handed-over and reconciliation quantities |
| `order_line_asset_assignments` | UUID; order/line/asset FKs; unique `(faction_order_id, asset_instance_id)` |
| `faction_order_history` | Bigint identity; order/actor links, occurrence time, action/from/to, notes, JSON delta and unique idempotency key |
| `general_orders` | UUID; creator/optional event FKs; name/purpose/status; JSON requested/prepared/handed-over/returned/consumed/damaged/missing/written-off quantities, source locations, assigned and reconciled assets |
| `general_order_history` | UUID; order/actor FKs; time/action/notes, JSON delta and unique command ID |
| `custody_handovers` | UUID; faction order, marshal, collector and location FKs; unique handover code/idempotency key, type/time, acknowledgement key and condition confirmation |
| `custody_handover_lines` | UUID; handover/order line/item/optional asset FKs; quantity and condition notes |

Unifying `orders` / `order_lines` with a faction/general kind is planned (PLAN-02); those tables do not currently exist. General-order JSON references rely on service validation, unlike relational faction line FKs.

### Returns, lifecycle and maintenance (6 tables)

| Table | Key data and relationships |
|---|---|
| `return_reconciliations` | UUID; faction order/line/item/asset/recorder links; outcome, quantity, condition before/after, note and idempotency key |
| `return_submissions` | UUID; item/asset, submitter/return-for user, expected location, faction/general order/event links; status, placement photo, prior asset state/version and acknowledgement actor/time; unique member command ID |
| `damage_reports` | UUID; item XOR assembly; optional asset/order/handover, reporter/handler; severity/status, quantities, notes, safety impact, position map and idempotency key |
| `repair_cases` | UUID; unique damage-report FK; asset/handover/repair owner/vendor/approver links; status, parts/cost/verification notes and pending repaired quantity |
| `maintenance_schedules` | UUID; item/asset/responsible user; date/hour/usage interval, warning, next due, checklist, active/checkout-block flags |
| `maintenance_records` | UUID; item/asset/schedule/inspector links; inspection type/result/time, hours, next due, certificate key/number and notes |

Item-level maintenance status/calendar columns still duplicate schedule-based state. They are used in current evaluation/report fallback paths; schedules-only maintenance is a target (PLAN-10).

### Planning and purchasing (7 tables)

| Table | Key data and relationships |
|---|---|
| `planning_overrides` | UUID; event/item/actor FKs; quantity/reason and timestamps |
| `vendors` | UUID; name/contact/address/payment/internal notes; active/preferred flags |
| `purchase_orders` | UUID; vendor/event/creator links; unique order number, status, order/expected dates |
| `purchase_order_lines` | UUID; purchase/item FKs; unique purchase/item pair, ordered/received quantities, unit price cents |
| `goods_receipts` | UUID; purchase/receiver/location links; unique receipt number/idempotency key, status and received time |
| `goods_receipt_lines` | UUID; receipt/purchase line/item/lot FKs; expected/received/damaged/rejected quantities |
| `vendor_documents` | UUID; vendor/purchase/receipt/uploader links; unique storage key, type/MIME/size/checksum, original filename, reference/date/value/currency/retention |

Receiving is a stock command. An unreceived purchase line is ordered supply, not physical on-hand, custody or transfer transit. Supplier-document access is role-restricted and still subject to resource policy.

### Ownership and lending (2 tables)

| Table | Key data and relationships |
|---|---|
| `equipment_commitments` | UUID; item/event/recording user links; quantity, JSON asset IDs, available window, pickup/return details, consent/cancellation evidence |
| `loan_arrangements` | UUID; unique commitment FK and provider location; loan/rental kind, provider/contact/terms, collection/return quantities/assets, transfer IDs, JSON history and revision |

Rental/loan economics and evidence live in the agreement's current fields/JSON; there is no separate billing/payment subsystem or relational loan-line table.

### Member work and system support (9 tables)

| Table | Key data and relationships |
|---|---|
| `member_requests` | UUID; requester/item/asset/location/handler links; kind/quantity/notes, status/response/time, unique command ID and revision |
| `notifications` | UUID; recipient/order links; type/payload, delivery/read state and retry evidence |
| `action_reminders` | UUID; user FK, action key and reminder time; unique user/action |
| `category_maintenance_policies` | UUID; unique category, interval days and timestamps |
| `inventory_codes` | UUID; globally unique stored code, target type/UUID, active/primary flags and retirement time; polymorphic target validated in services |
| `operational_reports` | Report name PK; generation version/times, source token and JSON rows; eight snapshot kinds |
| `sync_command_audit` | UUID; unique command ID, owner/operation/payload/local time, server result/status/conflict/retry; supersedes and resolution-root FKs to command IDs |
| `domain_event_outbox` | UUID; unique event ID, aggregate/actor/command, type/payload, delivery status/attempts/availability/published time/error |
| `source_revisions` | Composite `(name, shard)` PK; revision/epoch; 16 shards per tracked source table |

All 55 baseline tables are listed once above. This inventory is descriptive; use the SQL for exact lengths, defaults, nullability and constraint definitions.

## 5. Stock authority and invariants

```text
onHand     = posted inbound movement - posted outbound movement
checkedOut = checkout - checkin - consumed - missing
inTransit  = dispatched transfers not yet received
owned      = onHand + checkedOut + inTransit
available  = max(0, onHand - damaged - reserved - blocked/quarantined)
ordered    = unreceived purchase quantity, displayed separately
```

These are conceptual aggregates, not SQL to apply indiscriminately to each tracking mode. Bulk uses ledger totals and lockable positions; serialized stock is classified from exact asset states. Eligibility then blocks unavailable stock according to maintenance, contributor damage, usable lots and equipment consent. A pending return is still checked out. Repairs never create units; write-off is authorized separately.

`InventoryOperationsService.stock` still uses `items.base_amount` if no `added` movement exists. Documenting the ledger as the **sole** persisted quantity origin would therefore overstate current behavior (GAP-02). New stock must use canonical commands; simplification of the old opening-quantity path is pending.

Order reconciliation must satisfy `handedOver = returned + consumed + damaged + writtenOff + outstanding`, with missing accounted within outstanding. Reservations can only use eligible availability; an order edit credits its own allocation, not other orders' stock. Position/asset changes, movement evidence and outbox writes commit together under locks.

Stock/order history is append-only by application contract. This baseline does not supply general UPDATE/DELETE-denial triggers for ledger/history tables; do not claim database-enforced immutability. Outbox rows are delivery records with finite retention, so they do not replace permanent movement/order history.

## 6. Query, indexing and snapshot behavior

FK/location/stock indexes support operational reads. Catalog substring search uses `pg_trgm` GIN indexes on lowercased name/SKU/category. Lowercased code indexes accelerate exact case-insensitive lookup; those indexes are non-unique, while stored SKU/asset/label values have unique constraints. Alias retirement and cross-code reuse rules are enforced by code-management services.

API list mapping batches ledger, damage, reservation, position, asset, maintenance and purchasing facts. Dynamic availability is not globally cached. Faction reference caching uses committed revisions. Privacy query scoping and `PrivacyResponseFilter`/reference-graph projection currently coexist (PLAN-01).

Statement triggers increment the relevant `source_revisions` shard (`pg_backend_pid() % 16`) within the source transaction, including rollback behavior. Readers sum shards; report source tokens and faction cache keys detect committed changes. `operational_reports` stores manually rebuilt snapshots, not continuous materialized live inventory. Kinds: events, availability, returns, repairs, maintenance, purchases, counts, movements.

## 7. Files, offline storage and retention

Media uploads first create staged metadata; attachment binds object keys to a resource. Allowed bytes/types/quotas and 24-hour staged expiry are configured in the API. Private media is authorized per download and uses no-store; image/certificate/document references do not grant access themselves. Store opaque object keys rather than granting public bucket access. Coordinate database and object-storage recovery.

`ash-inventory` currently uses IndexedDB version 4:

| Object store | Key | Content |
|---|---|---|
| `catalog-cache` | Namespaced `key` | Query/detail snapshot plus successful-download timestamp |
| `sync-queue` | `idempotencyKey` | Owner, operation/payload, client time and correction link |
| `sync-failures` | `idempotencyKey` | Rejection/conflict evidence |
| `sync-history` | `idempotencyKey` | Applied/archived local evidence |

Catalog keys include account/role/faction context and normalized query. Private projections are excluded from durable catalog caching. Queue/failures/history belong to the original account and cannot replay under another. Authentication is separately mirrored to `ash-auth` version 1, store `session`, key `oidc-session`, including token/session data. Session storage and memory support normal requests; logout clears session data and account caches. Device/browser eviction can remove offline state; it is not a backup.

The PWA shell cache is versioned per build. Published outbox events default to 30-day purge. Staged media defaults to 24 hours. Permanent stock/order/access evidence and downloaded exports have different lifetimes; exported files cannot be recalled by revoking an app grant.

## 8. Deployment and recovery

Default Compose uses PostgreSQL 18; cluster replicas share the primary database. The storage Compose hosts a separate PostgreSQL instance for logical replication. Publication/subscription, schema copying and backup jobs require operator setup; the replica service alone does not establish replication.

Logical replication is an asynchronous table copy, not physical hot standby or automatic database failover. Matching DDL and sequence management are operator responsibilities. WAL archiving, dump encryption, media synchronization and claimed RPO/RTO values need an exercised recovery plan. See [logical replication](postgres-logical-replication.md), [Step 1](DEPLOYMENT_STEP1.md) and [Step 2](DEPLOYMENT_STEP2.md). Restore, real S3 and cluster acceptance remain open (ACC-04/05).
