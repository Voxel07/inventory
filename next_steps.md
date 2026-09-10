# Next Steps — Solid Event Logistics Implementation

## 1. Scope and product principle

ASH Inventory is primarily an **event logistics and equipment custody system**. It is not intended to become a general e-commerce, shipping or full ERP platform.

The complete operational chain should be:

```text
Vendor purchase
  -> goods receipt and bill/document reference
  -> storage and stock verification
  -> event demand and reservation
  -> order preparation and staging
  -> internal/customer handover
  -> field deployment
  -> return, consumption, damage, or loss reconciliation
  -> repair, maintenance, write-off, or restock
```

The system must support two fundamentally different inventory behaviors:

1. **Bulk stock** — fences, tables, cable ties, BBs, gas, tape, and similar high-volume goods. Track quantities, containers, condition, and location, but do not require a barcode for every unit.
2. **Serialized assets** — generators, radios, electronic props, tools, and other expensive or safety-critical equipment. Track each physical unit with its own identity, custody, condition, maintenance, and history.

Internal customers and faction leaders are familiar operational participants. The system should therefore optimize for speed, trust, and clear accountability rather than external-commerce complexity.

## 2. Current architecture: strengths to preserve

The existing `REQUIREMENTS_ARCHITECTURE.md` already specifies the most important event-specific capabilities:

- Event occurrences and faction orders
- Copying a previous event year's baseline
- Assemblies and component quantities
- Preparation, staging, pickup, return, and closure states
- Custody and audit concepts
- Damage and loss reports
- Incomplete assembly returns
- Maintenance and checkout blocking
- QR scanning
- Storage locations with map overlays
- Demand-versus-stock shortage planning
- Offline PWA operation and idempotent synchronization

The work below closes the gaps between those concepts and a reliable end-to-end implementation.

## 3. Priority model

- **P0 — required for a dependable first production version**
- **P1 — required for a complete operational system**
- **P2 — useful later, but not required for the current event-logistics scope**

## 4. P0 — Inventory foundation

### 4.1 Define the inventory tracking model

Add an explicit item tracking mode rather than using only `is_consumable`:

```text
tracking_mode = BULK | SERIALIZED | LOT_TRACKED
inventory_role = CONSUMABLE | RETURNABLE | REPAIRABLE | RENTAL
```

Recommended behavior:

- `BULK`: quantity-based stock; a QR/barcode may identify the product or container, but individual units are not required to have codes.
- `SERIALIZED`: every physical unit has an `asset_instance` and a unique QR code or short human-readable code.
- `LOT_TRACKED`: quantities are tracked by lot/batch and expiry date; individual-unit codes are optional.
- `CONSUMABLE`: normally decreases through usage or write-off and does not require check-in.
- `RETURNABLE`: expected back after the event.
- `REPAIRABLE`: can enter a repair queue and later return to service.

Add validation so the mode controls the allowed workflows. For example, a serialized generator cannot be checked out using only an aggregate quantity, and a bulk fence item does not require a unit-level asset record.

### 4.2 Add physical asset instances

The current `items` and `stock_transactions` model records quantities, but it cannot identify which generator or radio was handed over.

Add an `asset_instances` table containing:

- `id`
- `item_id`
- `asset_code`
- `serial_number` (nullable)
- `manufacturer`
- `model`
- `purchase_date`
- `purchase_price_cents`
- `replacement_value_cents`
- `current_location_id`
- `current_custodian_id` or custody reference
- `condition_status`
- `service_status`
- `availability_status`
- `notes`
- `created_at`, `updated_at`

Suggested asset states:

```text
AVAILABLE
RESERVED
STAGED
IN_CUSTODY
IN_FIELD
RETURNED_PENDING_CHECK
DAMAGED
IN_REPAIR
IN_MAINTENANCE
LOST
WRITTEN_OFF
```

Every serialized asset should be printable with a durable QR label. The QR should resolve to the asset, not merely to the generic item type.

### 4.3 Replace the single item location with inventory positions

`items.storage_location_id` only supports one default location. It does not support fences distributed across several storage areas or a generator moving from a warehouse to an event site.

Add:

- `warehouses` or operational sites
- `inventory_positions`
- `location_id`
- `item_id` for bulk stock
- `asset_instance_id` for serialized assets
- `quantity_on_hand`
- `quantity_reserved`
- `quantity_damaged`
- `quantity_quarantined`
- `quantity_in_transit`
- `last_counted_at`

For bulk stock, the position stores quantities. For serialized assets, the asset instance stores the exact location and the position is derived or used for reporting.

Support location types such as:

```text
WAREHOUSE
BIN
STAGING
EVENT_SITE
VEHICLE
IN_CUSTODY
QUARANTINE
REPAIR
SCRAP
```

Retain the planned OSM coordinates and overlays for operational locations, but keep the logical stock position separate from the map presentation.

## 5. P0 — Vendor intake and purchasing history

### 5.1 Vendor records

Add lightweight vendor management for internal purchasing:

- Vendor name
- Contact person
- Email and phone
- Address
- Website
- Payment/reference notes
- Preferred vendor flag
- Internal notes
- Active/inactive state

This does not need to become a full accounts-payable module.

### 5.2 Purchase orders and goods receipts

Add the ability to record what was ordered and what physically arrived:

`purchase_orders`

- Order number
- Vendor
- Order date
- Expected delivery date
- Status
- Event or planning reference
- Notes

`purchase_order_lines`

- Item
- Ordered quantity
- Unit price
- Expected quantity
- Received quantity
- Remaining quantity
- Optional asset details
- Notes

`goods_receipts`

- Receipt number
- Purchase order
- Received by
- Received at
- Receiving location
- Status
- Notes

`goods_receipt_lines`

- Item
- Expected quantity
- Received quantity
- Damaged quantity
- Rejected quantity
- Lot/batch or asset references
- Receiving notes

Receiving must update stock atomically and support partial delivery, over-delivery, shortage, and damage.

### 5.3 Store vendor bills and reference documents

A bill should be stored as a reference document, not necessarily processed as accounting data.

Add `vendor_documents`:

- `id`
- `vendor_id`
- `purchase_order_id`
- `goods_receipt_id`
- Document type: `INVOICE`, `DELIVERY_NOTE`, `QUOTE`, `WARRANTY`, `CERTIFICATE`, `OTHER`
- Original filename
- MIME type
- Object-storage key
- File size and checksum
- Document date
- Invoice/reference number
- Total amount and currency, when known
- Uploaded by and uploaded at
- Notes

Requirements:

- Open and download the original document from the purchase or receipt screen.
- Keep documents in Garage S3, not PostgreSQL blobs.
- Store a checksum and immutable metadata.
- Restrict access to HQ users.
- Support multiple documents per purchase or receipt.
- Include documents in backup and migration procedures.

OCR and automatic invoice extraction are optional P2 features. Manual metadata entry is sufficient initially.

## 6. P0 — Stock movements, reservations, and availability

### 6.1 Create a complete inventory ledger

The existing transaction types are too narrow for the planned workflow. Add transaction types for:

```text
RECEIVED
ADJUSTED
RESERVED
RESERVATION_RELEASED
TRANSFER_OUT
TRANSFER_IN
STAGED
CHECKED_OUT
CHECKED_IN
CONSUMED
DAMAGED
MISSING
REPAIRED
WRITTEN_OFF
```

Each movement should include:

- Item or asset instance
- Quantity, where applicable
- Source location
- Destination location
- Related order, purchase order, receipt, damage report, repair, or maintenance record
- Actor
- Server timestamp
- Client command/idempotency key
- Before and after availability snapshot
- Reason and notes

Never update stock by editing a balance without a corresponding ledger entry.

### 6.2 Add reservations

The architecture says preparation reserves stock, but there is no reservation model yet.

Add `stock_reservations`:

- Order and order line
- Item or asset instance
- Location, if allocation is location-specific
- Requested quantity
- Reserved quantity
- Released quantity
- Status
- Created and released timestamps
- Actor or process that created it

Required rules:

- An asset can be reserved by only one active order.
- Bulk stock cannot be reserved beyond available quantity.
- Cancelling an order releases reservations.
- Preparing an order does not silently remove stock from the warehouse.
- Pickup converts a reservation into custody.
- Return or cancellation closes the reservation.

Define these quantities explicitly:

```text
available = on_hand - reserved - quarantined - damaged
```

For serialized assets, availability is calculated from asset state rather than aggregate quantity.

### 6.3 Add transfers

Add internal transfer workflows for warehouse, staging, vehicle, and event-site movements:

- Transfer request
- Source and destination
- Requested lines
- Picked quantity/assets
- In-transit state
- Received quantity/assets
- Discrepancy handling
- Transfer history

Transfers must be distinct from checkout. A move from the main warehouse to the event site does not transfer customer custody.

## 7. P0 — Event order execution

### 7.1 Separate requested, allocated, prepared, handed over, and reconciled

Extend `faction_order_lines` with explicit quantities/states:

```text
requested_quantity
allocated_quantity
reserved_quantity
prepared_quantity
handed_over_quantity
returned_quantity
consumed_quantity
damaged_quantity
missing_quantity
written_off_quantity
```

For serialized lines, also store the assigned asset instances through an order-line assignment table rather than embedding IDs in JSON.

### 7.2 Add a custody handover record

The planned order fields such as `picked_up_by` are not enough to capture the actual handover event.

Add `custody_handovers`:

- Order
- Handover type: `CHECKOUT` or `CHECKIN`
- Internal marshal
- External/internal collector
- Timestamp
- Location
- Assigned assets and quantities
- Condition confirmation
- Notes
- Optional signature or acknowledgement
- Optional photos
- Handover QR/code

For internal customers, identity verification can remain lightweight: select the known faction leader or marshal, confirm the name, and record the operator. A full identity-verification provider is unnecessary.

### 7.3 Make return reconciliation component-aware

The existing incomplete-kit concept should be implemented with a dedicated reconciliation record, not just counters on the order line.

For each returned line or asset, record one outcome:

```text
RETURNED_GOOD
CONSUMED
RETURNED_DAMAGED
MISSING
RETURNED_LATE
WRITTEN_OFF
```

For serialized assets, record the exact asset and condition before/after. For bulk items, record quantities.

The order may close only when every line is reconciled to one of those outcomes.

## 8. P0 — Counts and stock accuracy

Add inventory-count workflows:

- Count session
- Scope by warehouse, location, category, or item
- Blind count option
- Bulk count entry
- Serialized-asset scan count
- Variance calculation
- Recount and approval
- Adjustment transaction generation
- Count completion and sign-off
- Accuracy reporting

High-volume fences and tables should be countable by quantity or stack/pallet/container. Expensive assets should be counted by scanning or confirming their individual asset codes.

## 9. P0 — Barcode and QR policy

The current QR scanner should be extended with a clear code policy:

### Product-level codes

Used for:

- Bulk items
- Packaging
- Containers
- Locations
- Assemblies

Scanning identifies the item or location and asks for a quantity.

### Asset-level codes

Used for:

- Generators
- Radios
- Electronic props
- Tools
- Other high-value or safety-critical equipment

Scanning identifies one physical asset and allows direct custody, return, repair, and maintenance actions.

Required functions:

- Short manual code fallback
- Multiple codes per product
- Printable asset labels
- Printable location labels
- Code collision validation
- Replaceable labels without losing asset history
- Fast scan-to-action flows on mobile

RFID is explicitly out of scope.

## 10. P0 — Repairs, damage, and maintenance

### 10.1 Repair workflow

The existing damage reports need a complete repair lifecycle:

```text
REPORTED
-> TRIAGED
-> AWAITING_REPAIR
-> IN_REPAIR
-> REPAIRED
-> VERIFIED
-> RETURNED_TO_SERVICE
```

Support:

- Damage discovered during return or independently
- Link to order, handover, and asset
- Photos before and after repair
- Problem description
- Severity and safety impact
- Repair owner
- Internal or external repair provider
- Parts and cost notes
- Repair duration
- Verification result
- Return-to-service approval
- Replacement or write-off decision

### 10.2 Maintenance and inspection

Keep the planned DGUV V3, runtime, battery, and chrono records, but move recurring maintenance into a schedule model:

- Maintenance type
- Interval by date, operating hours, or usage count
- Next due value
- Warning window
- Responsible person
- Required checklist
- Result
- Certificate/document reference
- Checkout-blocking flag

An overdue asset must be blocked server-side, not just visually warned in the frontend.

## 11. P1 — Lots, batches, expiry, and controlled consumables

Add lot tracking for goods where age or batch matters:

- Gas and fluids
- Batteries
- Pyrotechnics
- Medical supplies
- Chemicals
- Food or drinks, if ever stored

Add:

- Lot/batch number
- Supplier lot
- Manufacture date
- Expiry date
- Best-before date
- Quantity remaining
- Storage requirements
- Recall/hold status
- FEFO selection rule

This does not require an individual barcode for every unit.

## 12. P1 — Demand and procurement planning

The planned deficit view should become an actionable planning tool:

- Demand from upcoming event orders
- Existing reservations
- On-hand stock
- Stock in repair or quarantine
- Expected receipts from purchase orders
- Safety stock
- Net deficit
- Recommended purchase quantity
- Recommended supplier
- Lead time
- Event date and required-by date
- Manual planner override
- Reason for override

The view should distinguish:

- Consumables to purchase
- Bulk equipment to purchase
- Serialized equipment to purchase or rent
- Items available elsewhere and transferable
- Items blocked by repair or maintenance

Generating a purchase-order draft is more useful than only exporting a CSV.

## 13. P1 — Reporting for event operations

Add inventory-specific reports separate from application observability:

- Stock by warehouse/location
- Available, reserved, and unavailable stock
- Event demand versus stock
- Unresolved returns
- Missing assets by faction/event
- Damage and repair backlog
- Asset utilization
- Maintenance due and overdue
- Consumable usage by event
- Purchase history by vendor
- Vendor bill/document index
- Inventory count variances
- Stock accuracy
- Write-offs and replacement values

Reports should support filtering by event, year, faction, category, vendor, status, and location, with CSV/PDF export where useful.

## 14. P1 — Users, roles, and internal operating rules

Implement server-enforced roles appropriate for the internal operation:

```text
HQ_ADMIN
WAREHOUSE_CREW
MARSHAL
EVENT_PLANNER
MAINTENANCE_CREW
FACTION_LEADER
READ_ONLY
```

At minimum:

- Faction leaders see only their own event orders and handovers.
- Warehouse crew can receive, prepare, count, transfer, and check in/out.
- Marshals can execute handovers and returns.
- Maintenance crew can manage repairs and inspections.
- Only authorized users can write off, delete, or correct stock.
- Vendor documents are visible only to permitted HQ roles.

Use soft deletion/deactivation for master data. Historical transactions and documents must remain readable.

## 15. P1 — Notifications and operational queues

Implement notifications for:

- Order ready for pickup
- Shortage requiring acknowledgement
- Overdue return
- Missing asset
- Damage report assigned
- Repair completed
- Maintenance due soon
- Maintenance overdue
- Low stock
- Purchase order overdue
- Offline actions waiting to sync

Initial implementation can use in-app notifications plus email. SMS is optional. Store notification state and delivery errors so an operator can see whether a message was actually sent.

## 16. P1 — Offline safety and synchronization

The planned IndexedDB queue should apply to every offline mutation, not only order history.

Each queued command needs:

- Client-generated UUID
- User and device
- Operation type
- Payload
- Local timestamp
- Sync status
- Retry count
- Server result
- Conflict/error message

Server requirements:

- Idempotency for stock movements, handovers, returns, damage reports, and counts
- Transactional conflict detection
- No duplicate checkout or check-in after retries
- Explicit conflict resolution for two offline operators acting on the same serialized asset
- Readable sync audit history

If an offline operation cannot be safely merged, keep it pending and require an HQ user to resolve it. Never silently overwrite stock.

## 17. P1 — Document and media handling

Use the planned S3-compatible storage for:

- Item photos
- Asset photos
- Damage photos
- Repair photos
- Vendor bills
- Delivery notes
- Warranty documents
- DGUV certificates
- Printed/generated order PDFs

Every file needs:

- Owning domain record
- Original filename
- MIME type
- Size
- Checksum
- Uploader
- Created timestamp
- Retention/deletion policy

## 18. P2 — Explicitly out of scope for now

Do not block the solid event-logistics implementation on:

- Shipping carriers
- Customer-facing e-commerce
- RFID
- Automated warehouse robotics
- Full accounting or accounts payable
- Complex external customer portals
- Manufacturing/MRP
- Multi-echelon supply planning
- International tax and currency complexity

Transport manifests and CMR documents may remain deferred unless the event operation later requires formal vehicle logistics.

## 19. Recommended implementation order

### Phase A — Correct stock semantics

1. Define `tracking_mode` and `inventory_role`.
2. Add asset instances.
3. Add warehouses and inventory positions.
4. Add complete stock ledger transaction types.
5. Add reservations.
6. Add internal transfers.
7. Add server-side invariants and concurrency tests.

### Phase B — Vendor-to-stock intake

1. Add vendors.
2. Add purchase orders and lines.
3. Add goods receipts.
4. Add partial/damaged receiving.
5. Add vendor document storage and retrieval.
6. Update stock atomically from receipts.

### Phase C — Event execution

1. Extend order lines with all lifecycle quantities.
2. Add serialized asset assignments.
3. Add custody handovers.
4. Implement preparation and staging reservations.
5. Implement component-level return reconciliation.
6. Add bulk and serialized scan flows.

### Phase D — Accuracy and lifecycle management

1. Add count sessions and variance approval.
2. Complete damage and repair workflow.
3. Complete maintenance schedules and checkout blockers.
4. Add lot/batch/expiry support.
5. Add usage and write-off workflows.

### Phase E — Planning and operational visibility

1. Upgrade shortage view into replenishment planning.
2. Add purchase-order drafts.
3. Add notifications and operational queues.
4. Add event, vendor, asset, damage, and maintenance reports.
5. Add role enforcement and document permissions.

### Phase F — Offline and production hardening

1. Apply idempotent offline commands to every mutation.
2. Add conflict resolution.
3. Test multi-device field operation.
4. Test database recovery and document restoration.
5. Validate backups and restore procedures.
6. Run a full event simulation from vendor receipt to final return closure.

## 20. Definition of done

The system is ready for a solid production pilot when it can complete this scenario without spreadsheets or implicit manual state:

1. A vendor purchase is recorded.
2. A delivery is partially received and one item is damaged.
3. The bill and delivery note are attached and retrievable.
4. Bulk tables and fences are added by quantity and stored across locations.
5. A generator is created as a serialized asset with a QR label.
6. A previous event order is copied into a new event occurrence.
7. Bulk quantities and specific generator assets are reserved.
8. Warehouse staff prepare and stage the order.
9. The faction leader collects the order and custody is recorded.
10. The order is used during the event.
11. Some consumables are marked consumed.
12. One table is missing, one radio is damaged, and the generator is returned late.
13. The system records all three outcomes without closing the order prematurely.
14. The radio enters repair and the generator receives a runtime/maintenance update.
15. A count confirms remaining bulk stock and serialized assets.
16. The shortage view reflects the true available stock.
17. All actions remain auditable and can be synchronized after offline operation.

If this scenario works reliably, the architecture will support the real event-logistics mission without carrying unnecessary shipping, RFID, or public-commerce complexity.
