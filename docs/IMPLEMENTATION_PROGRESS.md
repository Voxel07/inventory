# Operational workflow implementation

Implemented scope: F01–F23 from FEATURE_GAP_ANALYSIS.md. F15–F17 were completed in the 29 September follow-up.

Updated 29 September 2026. This records implementation status, not acceptance-test sign-off.

## Status summary

| Scope | Implementation | Verification / release |
|---|---|---|
| P0 F01–F09 | Implemented in the working tree | Final verification pending |
| Backend-available P1 F10–F14, F18 | Implemented in the working tree | Final verification pending |
| Remaining P1 F15–F17 | Implemented in the working tree; source review complete | Build, regression execution and UI acceptance deferred for user testing |
| Additional P2 F19 | Implemented: ownership, keeper and availability commitments | See F19 verification below |
| Additional P2 F20–F23 | Implemented: contributor workspace, action inbox, scanning/labels and loan lifecycle | Static verification only; runtime/UI acceptance pending |
| PostgreSQL migration V1.1.6 | Ownership defaults and equipment commitments added | Not executed on PostgreSQL |
| PostgreSQL migration V1.1.2 | Added, including legacy bulk-position backfill | Not executed/verified on PostgreSQL |
| PostgreSQL migrations V1.1.3–V1.1.5 | Location hierarchy, sync correction evidence and report snapshots added | Not executed/verified on PostgreSQL |

Checked boxes below mean implementation delivered, not tested acceptance criteria or production deployment.

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

- [x] F16: Guided server-state review and corrected command submission with new IDs, retained original evidence, server payload validation, local command history, account-scoped queues/cache, cache timestamps, a visible cached-data indicator and personal server sync audit. Explicit online/offline scope; older unowned commands remain exportable for manual reconciliation.

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

## Definitions and migration

Forecasts describe total event demand: planning uses the larger of unfulfilled forecast and active requests rather than adding both. Reusable equipment is planned across overlapping event windows, with readiness on the day after an event ends; consumables accumulate. Incoming purchases only cover dated demand when their expected delivery is on time.

Missing equipment remains outstanding until a return, consumption or authorized write-off resolves it. A return submission remains in custody until warehouse acknowledgement. Warehouse availability and custody are separate quantities.

Migration `V1.1.2__operational_workflows.sql` adds event attribution, general-order audit/state, planning overrides, location/lot allocation evidence and repair hold quantities. It backfills unlocated legacy bulk quantities at the configured default location. It does not guess historical event occurrences or lot identities. Legacy lot stock without a lot remains unavailable for issuing.

## Verification and handoff

Earlier in this implementation, the frontend production build and TypeScript check passed, and 57 backend tests passed. Subsequent source changes include the final custody aggregation, location preservation, permission controls, checklist validation and migration refinements.

At the user's request during the earlier F15–F17 pass, builds and runtime tests were deferred; the 29 September follow-up explicitly prioritizes changes and user testing. A syntax-only inspection of sixteen changed TypeScript/TSX files found no parse errors; it was not a typecheck, build or runtime test. Regression cases were added in `RemainingP1ApiTest`, and the old location-deletion expectation was updated to preserved links; neither has been executed. That earlier working tree was therefore **not fully verified**. The subsequent F19 pass ran the build and full backend suite successfully; see the verification results below. Desktop/mobile workflow verification is incomplete; PostgreSQL migration execution has not been verified. These checks are left for the user's feedback cycle.

### Outstanding follow-up

- [ ] User review of the final changes on mobile and desktop, including role-specific workflows.

- [x] Compile and run regression checks: completed in the F19 follow-up (frontend production build and 68 backend tests).

- [ ] Verify the PostgreSQL migration and legacy-stock backfill against an appropriate non-production database.

- [x] Source review of F15–F17 completed; implementation choices and verification limits recorded below.

- [ ] User acceptance: hierarchy cycles/deactivation/reactivation; offline failure correction and account switching; report rebuild/filter/export and stale indicators.

- [x] F20–F23: Member self-service, in-app reminders, camera scanning, label management and borrowing/rental arrangements implemented; acceptance pending.

F15–F17 were included in the earlier follow-up. F19 is included in the subsequent ownership request below; F20–F23 are included in the current follow-up below.

## F15–F17 implementation decisions and rollout

- `V1.1.3__location_hierarchy.sql` adds optional parent links. Existing descriptive area/location/position fields remain unchanged; no warehouse or parent is guessed for old locations. The ordinary location list still returns active locations; `includeInactive=true` exposes retained history and enables reactivation.

- `V1.1.4__sync_resolution_evidence.sql` adds correction links, resolution roots and notes. Terminal command evidence is immutable. Corrections are normal authorized commands with fresh IDs; only one correction chain may apply. Successful inventory changes and applied audit records share a transaction.

- Offline queue database version 4 adds a history store and scopes new commands/catalog data to the account. Pre-upgrade commands lack account identity and are retained for evidence export instead of automatic replay. Reconcile their result on the server before recreating them. Reload older open tabs during the upgrade.

- Offline queue scope is limited to individual stock transactions, faction-order create/prepare/transition/return and damage reports without newly uploaded media. Photo uploads/return submissions, general orders, assembly batch checkout, purchasing/receiving, transfers, counts, lots, repairs/maintenance, catalog changes and report rebuilds require connectivity. Online-only forms are not durable offline drafts. Queued success means stored locally, not confirmed stock availability.

- `V1.1.5__operational_reports.sql` creates disposable report snapshots. Use **Operations → Reports → Rebuild report** for initial population and refresh. The report records start/completion timestamps and compares domain-event and source-table watermarks; source changes during generation abort publication. The UI also asks for refresh after five minutes because due/expiry metrics change with time.

- Reports cover event demand/use, actual-location availability, unresolved custody, repair backlog, maintenance due, purchase history, completed-count variance, and consumption/write-off ledger records. Blind count expectations are excluded until posted/cancelled. Date meanings appear with each report. Monthly quantities require selecting one item; mixed units are never combined into a trend total.

- Availability reports explicitly retain unlocated legacy stock (zero location availability pending reconciliation) and pending-check asset custody. Maintenance reports include legacy item calendar dates when no item-level schedule exists. Repair backlog includes damage awaiting triage as well as active repair cases.

- Snapshots are manually rebuilt, not a new background worker. Domain events/source watermarks invalidate freshness; inventory commands continue validating transactional records. No migration, report build or database mutation has been executed as part of this coding session.

## F19 implementation decisions and rollout

- **Navigation:** Item Detail → Ownership, keeper & commitments; Asset Detail shows the same pool information. Staff can edit ownership/keeper, record a commitment or cancel one with a reason. The editor uses the existing German/English responsive forms. Changes require connectivity.

- **Separate concepts:** `organization`, `private_owner` and `external` ownership are independent of visibility scopes, assigned users/groups, nominal/current location and checkout custodian. Keeper/contact are explicit text fields and do not silently follow a transfer or handover. Use one item per owner stock pool; all serialized units of that item have that owner. Mixed-owner bulk inventory must be split into separate item records.

- **Defaults:** `V1.1.6__equipment_ownership.sql` explicitly migrates legacy stock to organization-owned/generally available, preserving existing behavior. Review legacy privately owned items after migration; neither personal visibility nor home storage is treated as ownership evidence. Private/external items require a named owner/provider and `commitment_required` or `unavailable` policy. Organization equipment may also require a commitment or be unavailable.

- **Commitments:** Quantity, optional event occurrence, inclusive pickup/use date range, pickup instructions, agreement evidence, and (for returnable equipment) return due date and instructions. Serialized offers require exact active, usable assets. The date range must cover the whole event; return due must be on/after its end. Historical offers are retained and cancellation records a reason. These agreements authorize existing stock; they do not receive inventory or automatically change physical location.

- **Conservative capacity:** Only one overlapping commitment per item stock pool, including the return window. Current stock must be idle and usable when recording an offer. Future offers do not assume outstanding stock will return on time. Reservations, custody, missing quantities and transfers block ownership/policy changes or cancellation; keeper/contact updates remain possible. Item locks serialize changes with stock/order commands; a separate revision rejects stale agreement edits.

- **Enforcement:** Both order workflows and direct checkout enforce the same policy. Future commitments permit preparation but pickup must fall within the actual pickup window. Bulk allocations share the committed cap, subtracting reservations/custody; consumable usage also reduces that cap. Serialized allocation uses only committed identities. Returns still work after commitment expiry. Expiry does not silently cancel orders or reconcile custody.

- **Planning and reporting:** Event planning credits eligible committed supply without crediting reservations twice; shortages in restricted stock recommend obtaining a commitment instead of automatically buying into that owner's pool. Organization-owned totals exclude private/external stock while physical stock/custody remain visible. Generic location availability reports show unrestricted organization stock only, retain ownership labels and physical quantities, and direct restricted-stock planning to event commitments. Storage transfers remain available independently of lending consent.

- **Access and evidence:** Existing item visibility applies to the new APIs. Only administrators/warehouse crew mutate agreements. Domain events record profile before/after values, actor, commitment details and cancellation reasons; report freshness includes commitment changes. F20 self-service and F23 rental/return-to-provider lifecycle are not implemented by F19; the recorded return obligation is informational and uses existing stock/custody workflows for physical movements.

### F19 verification

`bun run build` passed (TypeScript and Vite production build; existing bundle-size warning). Targeted ESLint checks passed. `mvn -q test` passed: 68 tests, zero failures/errors, including eight new `EquipmentApiTest` scenarios covering ownership defaults/scope, authorization and stale edits, event/quantity limits, overlap/return rules, shared reservations and planning, exact serialized selections, future pickup restrictions, date-only offers, physical transfers and report ownership/freshness. PostgreSQL migration execution and interactive desktop/mobile acceptance remain pending. Tests use the existing isolated H2 test profile; no production database migration was run.

Two existing blockers found during verification were corrected: the offline freshness query accidentally used the legacy-evidence function and an invalid query option; operational report freshness referenced a nonexistent `MaintenanceRecord.updatedAt` instead of its immutable `createdAt`.

## F20–F23 decisions and handoff — 29 September 2026

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

### Schema and verification

Following `.codex/AGENTS.md`, no new migration/versioned script, application build, packaging command or test suite was added/executed. Entity/schema definitions were edited directly in the existing disposable sources `V1.0.0__init.sql` and `V1.1.6__equipment_ownership.sql`. No database was changed and no Flyway checksum repair was run. Recreate disposable databases from these definitions rather than applying a new incremental migration.

Non-emitting frontend type checking (`tsc -p tsconfig.app.json --noEmit`) passes. Targeted ESLint passes without warnings; Java source parsing passes for all 145 source files. These provide static verification only; they do not establish backend compilation, database validity or runtime acceptance. Existing F01–F19 working-tree changes were retained.

Manual acceptance remains pending:

- Contributor/read-only/warehouse roles, personal scope, exact assets, quantity limits, duplicate submissions, return acceptance/rejection, storage reassignment and damage blocking/release.
- Inbox targeting, completion, account switching, reminder expiry/restoration and date/hour/usage thresholds.
- Phone/desktop camera permissions, unsupported browsers, repeated frames, stream cleanup, active order scan interception, retired/replaced aliases and scanned-location transfer source.
- Bulk/lot/serialized loans: partial collection/return, duplicate/wrong-direction evidence, reservation/custody conflicts, provider stock exclusion, extension overlap, cancellation and final physical quantities.
- Fresh database validation, backend compilation/regression when authorized, and responsive browser acceptance for all four features.
