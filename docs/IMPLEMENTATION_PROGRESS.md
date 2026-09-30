# Implementation progress

Updated 30 September 2026. F01–F23 are implemented in source; runtime/UI acceptance is pending. [FEATURE_GAP_ANALYSIS.md](FEATURE_GAP_ANALYSIS.md) maps features; [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) tracks consolidation.

## Current status

| Scope | Delivery | Verification |
|---|---|---|
| F01–F18 | Operational workflows, hierarchy, offline recovery and report snapshots present | Complete responsive/role acceptance pending |
| F19 | Ownership, keeper and availability commitments present | Earlier revision passed frontend build and 68 backend tests; subsequent changes are not covered by that result |
| F20–F23 | Contributor workspace, reminders, scanning/labels and loan lifecycle present | Static checks only; runtime acceptance pending |
| Consolidation | C01–C08 source work: ORM boundaries, sync/event services, reusable order controls, canonical API inputs/hooks, shared allocation/maintenance/custody policy, query keys/feedback, CSV module split and effect-state rule enabled. Dead UI/aliases and runtime stock backfill removed. | Non-emitting typecheck; full frontend lint (206 files); Java syntax (162 files) and extracted ORM call checks. C09 runtime gate remains pending. |
| PostgreSQL schema | Single `V1.0.0__init.sql` baseline with all 49 tables; eight incremental scripts and two legacy backfills removed | Fresh database execution and SQL/entity type validation pending; no database changed |

Checked boxes indicate source delivery, not tested acceptance or deployment.

## Delivered workflows

- [x] F01: Separate planned, requested, prepared, handed-over, outstanding, returned, consumed, missing, damaged and written-off event quantities. Direct movements and return submissions retain event occurrence attribution. Historical handed-over totals survive returns; planned-only items remain visible.

- [x] F02: Demand planning includes forecasts, faction/general orders, reservations, safety stock, overlapping reusable demand, cumulative consumables and dated incoming purchases. Explanations expose late/undated supply, location stock and audited overrides.

- [x] F03: Supplier-grouped shortage selection, editable multi-line purchase drafts, ordering, cancellation of remaining quantities and event references.

- [x] F04: Partial goods receiving with actual destination, accepted/damaged/rejected quantities, exact asset codes, existing lot selection, receipt history and remaining quantities.

- [x] F05: Actual location positions and serialized assets on Storage, Item Detail and Operations; source selection during preparation and movements. Preparing or cancelling serialized allocations preserves physical location.

- [x] F06: Transfers with source/destination, dispatch, cancellation, partial receipt and discrepancy handling.

- [x] F07: General-order preparation, reservations, pickup, exact asset reconciliation, missing/late-return handling, administrative write-offs and lifecycle audit history.

- [x] F08: Server-derived custody balances, pending acknowledgements, explicit return outcomes and acknowledgement/rejection notes. Repeated faction item lines aggregate into one outstanding balance.

- [x] F09: Role-specific warehouse, custody, purchasing, maintenance, event and administrative actions. Read-only accounts cannot create/change orders; private catalog visibility also applies when adding order lines. Administrative write-offs are enforced server-side.

- [x] F10: Blind stock counts, entry/recount, independent approval, posting and count history.

- [x] F11: Lot creation, editing, hold/release and expiry information; usable lots issue by earliest expiry. Create the lot in Operations before selecting it during receiving.

- [x] F12: Repair cases with responsibility/vendor, parts/cost notes, lifecycle transitions, verification and return to service. Repaired quantities remain held until verification and release.

- [x] F13: Asset-specific calendar/hour/usage maintenance schedules, warning windows, blocking, required checklist notes and completion evidence. The existing inspection form now supports exact asset selection.

- [x] F14: Supplier contact/details and purchase/receipt document upload, retrieval and retention metadata.

- [x] F15: Warehouse/site management, parent-location hierarchy, location types, active-state editing, warehouse/subtree filtering and location-path labels. Server rejects cycles, cross-warehouse parenting and deactivation above active children. Deactivation preserves stock and historical item/asset links.

- [x] F16: Guided server-state review and corrected command submission with new IDs, retained original evidence, server payload validation, local command history, account-scoped queues/cache, cache timestamps, a visible cached-data indicator and personal server sync audit. Explicit online/offline scope; legacy unowned-command migration/export support removed.

- [x] F17: Eight persisted, rebuildable operational reports with metric definitions, item/event/location/warehouse/category/status/date filters, source freshness, pagination, CSV export and per-item monthly purchase/consumption/write-off totals. Reports are query-only and restricted to warehouse staff and administrators.

- [x] F18: Administrator outbox status, dead-letter retry, sync audit and refresh timestamps.

- [x] F19: Explicit ownership and keeper/contact, dated/event commitments with exact serialized assets, pickup/return terms, history, concurrency checks, authorization and shared planning/reservation/checkout enforcement. Organization-owned totals exclude external/private equipment.

- [x] F20: Server-scoped contributor custody/storage, exact asset returns including general orders, damage/pickup requests and warehouse responses.
- [x] F21: Live role-targeted action inbox with personal in-app reminder times.
- [x] F22: Camera scanning, exact asset aliases, immutable code replacement/retirement, location labels and scanned-location actions.
- [x] F23: Provider agreements linked to commitments, transfer-backed partial collection/return, extensions, concurrency checks and history.

## Navigation

- **Events**: operational quantities and planning context.

- **Procurement**: shortage explanations and supplier purchase drafts.

- **Operations**: location stock, transfers, counts, lots, receipts, purchases, suppliers, repairs, maintenance schedules, reports and system health. Available tabs depend on the signed-in role.

- **Orders / General**: preparation through reconciliation and history.

- **Checked out / My dashboard / Returns**: custody and acknowledgement worklists.

- **Storage / Manage warehouses**: site details; parent/type/active fields in the existing location editor. Use warehouse and subtree filters to navigate actual location stock.

- **Header / Sync–Offline**: always accessible queue, offline scope, local history, cache freshness and personal server audit. The sync-issues indicator opens guided conflict correction.

- Existing Items, Assemblies and Storage layouts remain the foundation, with the new stock information integrated into them.

## Operational definitions

Forecasts describe total event demand: planning uses the larger of unfulfilled forecast and active requests rather than adding both. Reusable equipment is planned across overlapping event windows, with readiness on the day after an event ends; consumables accumulate. Incoming purchases cover dated demand only when expected delivery is on time.

Missing equipment remains outstanding until return, consumption or authorized write-off resolves it. Return submission retains custody until warehouse acknowledgement; warehouse availability and custody are separate quantities.

Location hierarchy preserves descriptive fields, historical links and inactive locations. Parent links are explicit; stock navigation uses actual positions. Report snapshots are manually rebuilt from transactional records and source/event watermarks; they show freshness and never authorize commands.

Offline commands/catalog/history are scoped to the account. Original terminal evidence is immutable; corrections use fresh IDs, require a resolution note, and only one applied correction chain is allowed. Unsupported actions require connectivity. See [OFFLINE_MODE.md](OFFLINE_MODE.md).

## F19 implementation decisions and rollout

- **Navigation:** Item Detail → Ownership, keeper & commitments; Asset Detail shows the same pool information. Staff can edit ownership/keeper, record a commitment or cancel one with a reason. The editor uses the existing German/English responsive forms. Changes require connectivity.

- **Separate concepts:** `organization`, `private_owner` and `external` ownership are independent of visibility scopes, assigned users/groups, nominal/current location and checkout custodian. Keeper/contact are explicit text fields and do not silently follow a transfer or handover. Use one item per owner stock pool; all serialized units of that item have that owner. Mixed-owner bulk inventory must be split into separate item records.

- **Defaults:** New stock is organization-owned and generally available. Private/external stock requires an explicit owner/provider and restricted availability. Visibility and home storage do not imply ownership.

- **Commitments:** Quantity, optional event occurrence, inclusive pickup/use date range, pickup instructions, agreement evidence, and (for returnable equipment) return due date and instructions. Serialized offers require exact active, usable assets. The date range must cover the whole event; return due must be on/after its end. Historical offers are retained and cancellation records a reason. These agreements authorize existing stock; they do not receive inventory or automatically change physical location.

- **Conservative capacity:** Only one overlapping commitment per item stock pool, including the return window. Current stock must be idle and usable when recording an offer. Future offers do not assume outstanding stock will return on time. Reservations, custody, missing quantities and transfers block ownership/policy changes or cancellation; keeper/contact updates remain possible. Item locks serialize changes with stock/order commands; a separate revision rejects stale agreement edits.

- **Enforcement:** Both order workflows and direct checkout enforce the same policy. Future commitments permit preparation but pickup must fall within the actual pickup window. Bulk allocations share the committed cap, subtracting reservations/custody; consumable usage also reduces that cap. Serialized allocation uses only committed identities. Returns still work after commitment expiry. Expiry does not silently cancel orders or reconcile custody.

- **Planning and reporting:** Event planning credits eligible committed supply without crediting reservations twice; shortages in restricted stock recommend obtaining a commitment instead of automatically buying into that owner's pool. Organization-owned totals exclude private/external stock while physical stock/custody remain visible. Generic location availability reports show unrestricted organization stock only, retain ownership labels and physical quantities, and direct restricted-stock planning to event commitments. Storage transfers remain available independently of lending consent.

- **Access and evidence:** Existing item visibility applies to the new APIs. Only administrators/warehouse crew mutate agreements. Domain events record profile before/after values, actor, commitment details and cancellation reasons; report freshness includes commitment changes. F20 self-service and F23 provider-return evidence extend these commitments, as described below.

## Contributor, reminder, scanning and loan behavior

### Navigation

- **My equipment** (`/contributor`) is available to every signed-in account and is the home screen for non-management accounts. It shows personal custody, explicitly assigned stored equipment, requests/responses and return decisions. Read-only accounts cannot submit requests or returns.
- **Actions & reminders** (`/actions`) appears in navigation and has a header count. It refreshes every minute and on inventory events. Staff see work for their role; contributors see their own work.
- **Header / QR search / Scan with camera** feeds the existing scan event, including active order scanners. **Item/Asset Detail / Labels & code aliases** manages aliases. **Storage / stock details / Labels / scan / transfer** opens a location's labels, stock and transfer action.
- **Operations / Borrowing / rental** creates agreements from existing external/private commitments. **Operations / Transfers** performs physical movements; return to the agreement to attach completed transfer evidence.

### F20: access and review

Warehouse staff assign a real account to an exact storage location in My equipment. This does not implicitly assign children. Free-text keeper/contact, visibility and ownership do not grant self-service access. Contributors receive minimal identity, quantity and location information for their own custody/storage. Faction serialized custody expands checkout/reconciliation evidence into exact asset rows; no asset UUID entry is needed.

Return submissions retain custody until warehouse acceptance. Quantity cannot exceed outstanding minus pending submissions. General orders now share the existing acknowledgement queue with direct/faction returns. Stable member command IDs prevent duplicate requests/returns on retry. Warehouse rejection and acknowledgement notes appear in the contributor workspace. Stock already reconciled elsewhere causes acceptance to fail; staff can reject the stale submission with an explanation.

Damage and pickup requests retain reporter, item/asset/location, quantity, original notes, handling state and warehouse response. Replies reject stale revisions. Open damage requests conservatively block the entire item pool from planning availability and checkout. They do not guess an adjustment or warehouse damage location. Staff inspect the equipment, use the existing return/damage/repair workflow for physical stock changes, then close the request with inspection and stock evidence. Pickup coordination never moves stock. Private request/agreement notes remain in scoped responses and administrator audit; shared SSE carries only invalidation metadata for these events.

### F21: in-app reminders

Reminders are persisted per account and delivered **in-app**; no email or push worker is added. Defer an action for up to 30 days or restore it immediately. It reappears on the next visit/refresh after its reminder time. Completed tasks disappear based on transactional state, regardless of saved reminders.

Overdue custody uses the event end date; undated direct custody remains in My equipment without an invented deadline. Receipt tasks cover ordered/partially received purchases, including undated deliveries. Lot warnings use the earlier expiry/best-before date within 30 days. Maintenance uses the schedule warning window and the same item/asset hour/usage counters as checkout guards. Loan tasks show collection and provider-return dates. New commands require connectivity.

### F22: scanning and replaceable labels

Camera scanning uses browser `BarcodeDetector` and the rear-facing camera where supported. It requires camera permission and HTTPS/localhost. Unsupported browsers explain the limitation and retain manual/handheld input. The stream stops on successful scan, explicit stop, dialog close/navigation and tab hiding. Images stay on the device.

Aliases use up to 128 ASCII letters/digits and `._:-`. They cannot be rewritten or reassigned. Replacement creates a new alias and retires the old label atomically; retired aliases return an explicit error instead of falling through to SKU lookup. Primary updates lock the target. Asset aliases resolve the exact asset and parent item. Location labels open the selected stock context and preselect the transfer source. Scanning never posts a movement by itself. Permanent item/asset identities remain distinct from replaceable aliases.

### F23: physical borrowing/rental lifecycle

Use one physical pool per provider, as in F19. Register equipment at its provider location and record a returnable commitment with exact assets or bulk/lot quantity. Create the agreement **before transport**. It records borrowing/rental kind, provider/contact, provider location and terms/cost/agreement evidence. Dates and quantities come from the commitment.

Collections and returns are partial by completed transfer. Each transfer must be created after the agreement, fully received without discrepancies, contain only its item and use the provider location in the correct direction. It may be linked only once. Exact assets and remaining quantities are checked. Discrepancies, damage, missing equipment, reservations and outstanding custody must be resolved before provider-return recording; partial provider returns also use the conservative idle-pool rule.

Agreements create no inventory. Uncollected quantities contribute zero loan availability. Only collected, unreturned quantities/assets may be prepared or issued. Provider-held stock is excluded even between physical return and evidence recording. Extensions retain consent/reason, lengthen dates and reject overlaps under an item lock/revision check. Cancel the linked commitment after all collected equipment has returned; any uncollected remainder can then be cancelled. History remains visible. Rental costs are agreement evidence, not accounting postings.

## Verification and remaining work

This consolidation used `tsc -p tsconfig.app.json --noEmit`, targeted ESLint, Java syntax parsing (147 main source files), and structural inspection of the 49-table baseline against entity column names, foreign keys and indexes. These checks do not compile Java, execute SQL or exercise runtime workflows.

Following `.codex/AGENTS.md`, no application build, packaging command, test suite or database command was run. No Flyway repair or deployed data mutation was performed. The single baseline is for empty disposable databases; existing databases must be recreated after baseline edits.

- [ ] Fresh PostgreSQL baseline plus Hibernate validation.
- [ ] Backend compilation/regression when explicitly requested.
- [ ] Desktop/mobile acceptance across contributor/read-only/warehouse/planner/marshal/maintenance/admin roles.
- [ ] Partial receiving/transfers/count approval; exact asset reservations/returns; concurrency and command replay.
- [ ] Hierarchy cycles/deactivation/reactivation and storage reassignment.
- [ ] Offline correction, account switching, retained evidence and cache freshness.
- [ ] Reports rebuild/filter/export, source changes during generation and stale indicators.
- [ ] Contributor quantity limits/duplicate submissions, acknowledgement/rejection and damage blocking/release.
- [ ] Reminder expiry/restoration and due date/hour/usage thresholds.
- [ ] Camera permissions/support, repeated frames, stream cleanup, label retirement/replacement and scan interception.
- [ ] Loan partial collection/return, transfer evidence, provider stock exclusion, extensions and cancellation.

Remaining code consolidation is tracked separately in [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md).
