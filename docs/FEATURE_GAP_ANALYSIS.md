# Feature gaps and requirements completion

Reviewed 28 September 2026 against the current checkout. Companion to [UI_WORKFLOW_AUDIT.md](D:/Code/ASH/inventory/docs/UI_WORKFLOW_AUDIT.md).

Implementation follow-up: see [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md) for the delivered F01–F19 scope and current verification limits. The assessment and detailed findings describe the pre-implementation baseline; the backlog includes a separate current-progress column. “Implemented” means present in the working tree, with final verification pending.

## Assessment

The app has a useful catalog and a substantial faction-order workflow, but it does not yet provide a complete operational system for equipment distributed between central storage, members' homes, and rented spaces. The largest gaps are receiving purchases, moving and counting stock, connecting event plans to procurement, and reporting what actually happened at an event.

Many required capabilities already have backend models and endpoints. They still need user workflows, integration with existing stock handling, and end-to-end verification. An endpoint alone does not make a requirement usable or prove that all its invariants work across every workflow.

Keep Items, Assemblies, and Storage as the catalog foundation. Complete the operational journeys around them rather than replace those pages. Faction-order reservations, serialized asset selection, previous-event comparison, return submissions with acknowledgement, and immutable stock transactions are valuable existing capabilities.

## Scope and interpretation

Sources are the normative [requirements](D:/Code/ASH/inventory/REQUIREMENTS_ARCHITECTURE.md), linked [domain architecture](D:/Code/ASH/inventory/docs/DOMAIN_ARCHITECTURE.md), current frontend routes/services, and corresponding backend services/resources. This follow-up is a source-based gap analysis; it does not claim new runtime verification of the proposed workflows. The companion UI audit records the desktop/mobile screens inspected previously.

The requirements table labels everything implemented, but that overstates end-user completeness. The domain architecture itself acknowledges remaining frontend breadth and reporting projections. This report distinguishes:

- **Incomplete:** a user workflow exists but omits required behavior or presents unreliable results.
- **Backend available:** relevant commands/data exist, but no complete frontend workflow was found. Backend integration and invariants still require verification.
- **Additional requirement:** a practical capability justified by the distributed-storage use case, not explicitly promised by the current requirements.

Priority **P0** means operational correctness or completing a central daily workflow; **P1** means completing the documented operational scope; **P2** means an efficiency improvement or a new product decision. These are implementation priorities, not security severity ratings.

## Prioritized feature backlog

| ID | Priority / baseline state | Feature to complete or add | Requirement / purpose | Progress — 29 September 2026 |
|---|---|---|---|---|
| F01 | P0 — incomplete | Event operations view with separate planned, requested, prepared, handed-over, outstanding, returned, consumed, missing, damaged and written-off quantities. Include planned-only items and attributable direct checkouts. | ORD-01/04/05; domain event-demand/utilization reporting | Implemented; final verification pending |
| F02 | P0 — incomplete | One demand and availability planner connecting event plans, faction/general orders, existing reservations, usable stock, receipt dates and transferable stock. Explain shortages and record overrides. | PRC-01; domain replenishment calculation and overrides | Implemented; final verification pending |
| F03 | P0 — incomplete | Purchase-order workspace: select several shortages, group by supplier, edit a draft, submit/record the order, cancel remaining quantities, track delivery and retain item/event links. | PRC-02/03; domain draft PO generation | Implemented; final verification pending |
| F04 | P0 — backend available | Goods receiving: partial deliveries, actual location, accepted/damaged/rejected quantities, lot and serial capture, receipt history and remaining delivery balance. | PRC-03; purchasing/receiving contract | Implemented; final verification pending |
| F05 | P0 — backend available, UI incomplete | Stock by actual location, including available/reserved/damaged/quarantined/in-transit quantities and exact serialized assets. Choose the source when preparing or moving stock. | INV-01/02; stock/positions contract | Implemented; final verification pending |
| F06 | P0 — backend available | Location transfers with dispatch, destination receipt, partial receipt and discrepancy resolution. | Domain transfers; central/home/rented storage | Implemented; final verification pending |
| F07 | P0 — incomplete | Complete general-order preparation, reservations, return outcomes, exact asset reconciliation, lifecycle history and per-action permissions; reuse faction-order behavior where appropriate. | ORD-01/03/04; AUD-01/02; SEC-01 | Implemented; final verification pending |
| F08 | P0 — incomplete | Authoritative custody and return worklists, outstanding/missing/late-return handling, pending acknowledgement and explicit resolution notes. | ORD-04/06; RET-01/02; custody contract | Implemented; final verification pending |
| F09 | P0 — inconsistent | Shared capability policy for UI actions and backend commands, including owner/faction scope, admin-only actions and privileged corrections. | SEC-01/02; domain authorization matrix | Implemented; final verification pending |
| F10 | P1 — backend available | Blind stocktaking by location/category/item, recount, independent variance approval, posting adjustments and visible count history. | Domain counts and adjustments | Implemented; final verification pending |
| F11 | P1 — backend available | Lot/batch operations: receive, select, locate, hold/release, see expiry, and issue by earliest appropriate expiry. | Domain lot tracking/FEFO; extends CAT-06 beyond one item-level date | Implemented; final verification pending |
| F12 | P1 — backend available | Repair cases with triage, responsibility, progress, costs/parts, verification and return to service. | DAM-01/02; domain repair lifecycle | Implemented; final verification pending |
| F13 | P1 — backend available, simple UI exists | Asset-specific maintenance schedules, calendar/hour/usage intervals, warning windows, required checklists and completion evidence. | MNT-01; CAT-06; domain maintenance | Implemented; final verification pending |
| F14 | P1 — backend available | Supplier details and purchase/receipt document management: attach, retrieve, authorize and retain invoices, delivery notes and certificates. | Domain vendor documents; completes purchasing context | Implemented; final verification pending |
| F15 | P1 — incomplete | Structured warehouse/location hierarchy, location type, active status and location-aware stock navigation. | LOC-01; domain warehouses/locations | Implemented; user verification pending |
| F16 | P1 — partial | Guided offline conflict resolution, per-action offline status, cache freshness and server sync-audit access. Decide and document offline scope explicitly. | OFF-01/02; domain offline protocol | Implemented; user verification pending |
| F17 | P1 — incomplete | Rebuildable operational reports: event demand/use, availability by location, unresolved returns, repair/maintenance backlog, consumption, purchases, count variance and write-offs. | Domain reporting and projections | Implemented; user verification pending |
| F18 | P1 — backend available | Admin operational view for outbox health, failed-event inspection/retry and sync failures; show report freshness where relevant. | Domain outbox/operator access and projection lag | Implemented; final verification pending |
| F19 | P2 — additional requirement | Explicit ownership, keeper and availability commitment, independent of catalog visibility and physical location. | Distributed/private equipment use case | Implemented; API regression and build verification recorded in IMPLEMENTATION_PROGRESS.md |
| F20 | P2 — additional requirement | Scoped member self-service for equipment in their custody/storage, return submission, damage reporting and pickup coordination. | Extends existing RET workflows to everyday contributors | Implemented; static verification only, runtime/UI acceptance pending |
| F21 | P2 — additional requirement | Action inbox and targeted reminders for pickups, overdue returns, pending acknowledgements, receipts, expiring lots and maintenance. | Efficiency; current order-ready notifications are a starting point | Implemented; static verification only, runtime/UI acceptance pending |
| F22 | P2 — additional requirement, code API exists | Camera scanning in the web field workflow, code alias/replacement management, location labels and scan-to-location actions. | Builds on ORD-06 and existing label/code lookup | Implemented; static verification only, runtime/UI acceptance pending |
| F23 | P2 — additional requirement | Borrowing/rental arrangements with provider, committed quantity/assets, collection/return dates and extension/return status. | Domain rental role exists; practical sourcing beyond purchases | Implemented; static verification only, runtime/UI acceptance pending |

P2 means “new scope or lower dependency,” not “unimportant.” If private equipment is regularly borrowed for events, F19/F20/F23 should move into the first operational release. If all equipment is organization-owned and merely kept at homes, F05/F06 plus keeper/contact information may be sufficient initially.

## What the critical features must do

### F01: Make event results meaningful

The current event mapper derives `usedQuantities` from handed-over minus returned quantities. Returning everything can therefore make a completed event appear to have used nothing. Direct checkouts are not part of that aggregation. See [ApiMapper](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/ApiMapper.java) and [EventDetail](D:/Code/ASH/inventory/src/pages/EventDetail.tsx).

Replace the ambiguous “used” figure with named measures. Historical handed-over quantity must survive a return. Outstanding custody must fall as units are reconciled. Consumable usage must be distinct from equipment deployment. Show all planned/requested items even before anything leaves storage.

Direct checkout currently records an event type and faction. That satisfies the literal type/faction context described by INV-03, but is insufficient to reliably attribute use to a particular occurrence/year. Add an occurrence relationship for occurrence-specific reporting. Do not silently guess an occurrence for old records; show unassigned historical movements and provide an audited correction path if needed.

**Acceptance:** an event with 20 planned radios, 16 handed over and 16 returned still shows 16 handed over and zero outstanding. An event with only a plan remains visible. A direct checkout linked to that event contributes to the appropriate totals once, without duplicating an order checkout.

### F02: Connect planning to actual sourcing

The inspected deficit calculation uses active faction-order requested quantities and minimum-stock rules. Event plan quantities and general orders do not feed that demand. Outstanding purchase quantities are aggregated by item without a required-by-date comparison. See [InventoryOperationsService](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/InventoryOperationsService.java) and [PurchasingOrm](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/orm/PurchasingOrm.java).

First define whether an event plan is a total forecast, additional central demand, or an alternative to faction requests. Do not add it to orders blindly. Show the selected rule and a breakdown so a planner can explain every shortage. Account for this event's own reservations without subtracting them twice.

Add required dates and distinguish consumables from reusable equipment. Two non-overlapping events can reuse radios if their return/readiness window permits; overlapping events cannot promise the same assets twice. A purchase arriving after the event does not solve its shortage. Stock at a home counts as a sourcing option only when it can be collected and is committed for the relevant period.

**Acceptance:** a planner can see why ten units are short, which locations can supply them, what arrives before the event, and what remains to buy or borrow. Overrides preserve the actor and reason. The same demand/reservation is never deducted twice.

### F03/F04: Finish the purchase-to-stock journey

The current purchasing component creates a supplier from typed input and records a single-line purchase, immediately advancing it to ordered. The backend supports richer purchase and receipt data. See [ProcurementOrders](D:/Code/ASH/inventory/src/components/procurement/ProcurementOrders.tsx), [PurchasingResource](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/PurchasingResource.java), and [PurchasingDtos](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/dto/PurchasingDtos.java).

Provide a supplier-grouped purchasing basket and editable draft. Distinguish a shortage report from an actual supplier purchase order. Receiving belongs in the warehouse task flow and should also be reachable from the purchase detail. Show expected, received, rejected, damaged and still-outstanding quantities separately.

**Acceptance:** of ten ordered radios, six arrive, five pass inspection and one is damaged. The operator captures all six serial identities and the receiving location. Only eligible stock becomes available. The purchase retains the correct remaining delivery balance; replaying the receipt does not create another six radios.

### F05/F06/F15: Make distributed storage operational

The storage UI primarily relates items to their nominal/default storage location. This is not a complete view of actual bulk positions or the current location of each asset. Position and transfer APIs already exist in [StockManagementResource](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/StockManagementResource.java) and [TransferResource](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/TransferResource.java).

Add a stock tab to each existing location, plus location balances on item detail. Keep normal storage, current physical location, custodian, and expected return location distinct. Introduce structured warehouse/location relationships where required; the current [StorageLocation model](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/model/StorageLocation.java) uses a warehouse relationship and descriptive area/location/position fields, without an explicit parent-location relationship.

**Acceptance:** moving a generator from a member's garage to central storage records dispatch and receipt. While moving, it is visible in transit and cannot be promised from both places. A partial bulk receipt leaves the unreceived quantity unresolved. Moving storage does not create a borrower checkout.

### F07/F08/F09: Close execution and accountability gaps

Faction orders have the stronger lifecycle. General orders move from submitted to ready without equivalent preparation/reservation behavior, expose fewer return outcomes, and select serialized returns from a prefix of assigned asset IDs instead of receiving the actual returned IDs. Their non-stock transitions also lack the same explicit lifecycle audit/event treatment. See [GeneralOrderService](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/GeneralOrderService.java).

Either explicitly define general orders as a smaller product scope with documented guarantees, or bring them onto the same operational rules. Their ready status must not imply reserved stock if none is reserved. Exact asset selection and reliable return accounting are necessary in either design.

Use server-derived custody balances instead of browser sums of checkout/check-in transactions that omit other outcomes. Expose immutable handovers/reconciliations in the order/asset history. Preserve the existing distinction between return submission and warehouse acceptance. Make missing, later found, damaged, consumed and authorized write-off separate outcomes.

Review action authorization at the same time: `GeneralOrderService.locked()` authenticates but does not itself enforce action/owner scope; the inspected non-stock transitions have no further role guard. Stock operations can still invoke downstream guards, so this finding does not imply every stock mutation is unprotected. Frontend manager groups also span more roles than individual backend commands permit.

**Acceptance:** two orders cannot reserve the same final asset; returning radio R-17 returns R-17 rather than the first radio in a list; missing equipment can later be recovered without rewriting history; unauthorized actors cannot change an order merely because they know its ID. A submitted return remains unavailable until acceptance.

## Complete the remaining documented operations

**Stocktaking (F10).** Build the interface on [CountResource](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/CountResource.java). The backend already supports count, recount, approval and posting. However, [CountService.approve](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/service/CountService.java) checks admin role but does not check that the approver differs from the counter. The domain document requires independent approval for material variance. Define materiality and enforce that rule on the server. Show original count, recount and final adjustment rather than overwrite observations.

**Lots and expiry (F11).** Lot records and expiry-sorted listing exist, but sorting a list is not an integrated FEFO issue workflow. Complete lot-aware selection, allocation, expiry/hold handling and receipt-to-return traceability. Verify server enforcement across every applicable reservation and checkout path. Do not present the item-level food best-before field as equivalent to managing multiple batches of the same product.

**Repairs and maintenance (F12/F13).** [LifecycleResource](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/LifecycleResource.java) exposes repair cases and advanced schedules. Existing damage resolution and simple maintenance pages are useful, but need the repair stages, assignment, verification and per-asset schedule workflow. A repair completion must not release unsafe equipment before required verification. Recording operating hours must affect the appropriate schedule. Test blockers at reservation as well as checkout.

**Documents (F14).** Add supplier detail and attachment controls to purchase/receipt detail, with download/access checks and preserved metadata. These need not become a separate document-management product. Existing APIs and DTOs provide a starting point; UI availability does not replace testing authorization and storage lifecycle.

**Offline and operational recovery (F16/F18).** The current queue supports selected transaction/damage/order commands. Photo-backed return submission is not a complete offline workflow: media staging requires connectivity and the submission service lacks the relevant queued action. Show which actions can be completed, drafted or only performed online. Provide a conflict explanation with current server state and a safe correction/resubmission path. Keep original command evidence; do not automatically overwrite stock state. The [OperationsResource](D:/Code/ASH/inventory/backend/src/main/java/org/ash/inventory/resource/OperationsResource.java) already offers outbox status, dead-letter listing and retry; expose these to administrators along with sync audit.

**Reporting (F17).** Prioritize event readiness, outstanding custody and availability by location. Then add consumption/purchase trends, repair and maintenance backlog, and count/write-off reports. Each report needs explicit metric definitions, filters and a freshness timestamp. Expensive projections should be rebuildable from authoritative records; inventory commands must continue validating transactional state.

## Additional features for homes and rented spaces

Visibility, ownership and storage are different facts. CAT-05 provides visibility scopes and assigned person/group fields, but those do not fully describe ownership or an agreement to lend equipment.

For example, an organization-owned generator at a member's home should remain organization inventory with that member as keeper. A privately owned radio offered for an event needs an owner and a dated commitment; merely making it visible must not make it allocatable organization stock. A rented container on the same property is a location, while rented radios are externally sourced equipment with a return obligation.

Introduce only the fields/workflows needed for those cases: owner/provider, keeper/contact, physical location, pickup availability, committed event/date range and return obligation. Provide members a scoped “My equipment / In my custody” view with permitted return and damage actions. This requires an explicit self-service permission policy; it should not grant general warehouse powers.

Make an action inbox role-specific and link directly to the relevant task. Use the existing notification infrastructure, expanding beyond the inspected order-ready producer. Camera scanning is useful on mobile, while keyboard/hardware scanning should remain available on desktop. These additions should accelerate the same workflows, not create a second inventory system.

## Requirements traceability

| Requirement group | Evaluation and completion work |
|---|---|
| CAT-01–04 | Core catalog/assembly/serialized detail capabilities exist. Retain them; fix read-only detail discoverability identified in the UI audit. No catalog rewrite is justified. |
| CAT-05 | Scoped visibility exists. Ownership/keeper/loan commitment is additional scope (F19), not proof that CAT-05 itself is absent. |
| CAT-06 | Category-specific fields exist. Advanced per-asset maintenance and multiple food batches need F11/F13 under the broader domain contract. |
| LOC-01 | Maps and descriptive storage structure exist; actual position browsing and explicit hierarchy need F05/F15. |
| INV-01/02 | Stock projections and guards exist; complete consistent location/lot/maintenance integration and trustworthy UI quantities (F02/F05/F11/F13). This review does not certify every guard. |
| INV-03/04 | Type/faction context and serialized controls exist. Occurrence attribution is needed for reliable event reports; exact general-order asset returns need F01/F07. |
| ORD-01–06 | Faction workflows cover much of this. General-order parity, event readiness, outstanding reconciliation and scan usability need F01/F07/F08/F22. Preserve the existing prior-event baseline. |
| RET-01/02 | Photo return submission and warehouse acknowledgement exist. Improve custody balances, acknowledgement feedback and scoped access (F08/F20); offline photo submission is separate scope. |
| AUD-01/02 | Faction history exists; general-order lifecycle history and consistent evidence display need F07/F08. |
| DAM-01/02, MNT-01 | Incident resolution/comments and basic maintenance exist; full repair/verification and advanced schedules need F12/F13. |
| PRC-01–03 | Current demand sources/date handling are incomplete; the buying-to-receiving journey needs F02/F03/F04/F14. |
| OFF-01/02 | Selected command replay and query-scoped caching exist. Improve recovery/freshness and resolve scope disagreement (F16). |
| SEC-01/02 | OIDC and canonical roles exist. Align screen/action capability and server scope checks (F09), including newly exposed workflows. |
| API-01/02 | Explicit DTO and capability patterns exist. No new end-user feature is needed solely for these IDs; preserve them when adding workflows. This is not an exhaustive contract audit. |
| Additional domain contract | Transfers, counts, lots, documents, advanced lifecycle, operational recovery and reporting require F05/F06/F10–18. |

## Decisions to resolve in the requirements

1. **Event demand:** define how plans and orders combine, which statuses commit stock, and reusable-equipment availability windows. Otherwise a redesigned procurement screen can still buy the wrong amount.
2. **Order scope:** clarify whether ORD/AUD guarantees apply equally to general and faction orders. The current implementation differs materially.
3. **Offline scope:** the main OFF-01 promises supported commands, while the domain architecture says every mutation is queued. [OFFLINE_MODE.md](D:/Code/ASH/inventory/docs/OFFLINE_MODE.md) and implementation follow a selected set. Prefer an explicit supported-action matrix and deliberately add field-critical operations.
4. **Quantity definitions:** reconcile quarantine and reservation treatment across the requirements and domain formulas. The domain return equation lists missing separately while prose also calls it outstanding; define whether “outstanding” includes missing, then use that definition consistently without double counting.
5. **Private equipment:** decide whether the app manages only organization-owned equipment stored privately, or also privately owned equipment lent to events. The latter needs F19/F23 and different ownership totals.
6. **Approval policy:** define material count variance, authorized write-offs, repair verification and self-service return permissions. Enforce these rules on the server.

## Delivery order and completion criteria

**First delivery — trustworthy event and stock decisions.** Resolve the definitions above; fix event metrics, general-order asset/permission gaps and authoritative custody displays. Add location balances and the unified demand calculation. This gives procurement reliable inputs.

**Second delivery — complete physical operations.** Add purchase drafts and receiving, transfers, and stocktaking. Integrate serial/lot capture, location selection and audit history into each journey. These features make the app usable without parallel spreadsheets for buying, moving and verifying stock.

**Third delivery — complete the documented lifecycle.** Expose repairs, advanced maintenance, lot holds/expiry, supplier documents, offline recovery and operational reporting. Ship the admin recovery view with workflows that depend on domain-event delivery.

**Fourth delivery — contributor efficiency.** Add ownership/loan commitments where needed, scoped member access, camera scanning and targeted reminders. Bring these earlier if private lending is essential to the first real event.

For every delivery, acceptance should cover the complete journey on a narrow mobile screen and desktop, the permitted/forbidden roles, partial completion, duplicate submission, conflicting stock use and recovery after a failed command. Verify historical evidence and final inventory quantities, not just that a form submits successfully. Do not mark a feature complete solely because its API exists.

No application implementation was changed by this analysis.

### F19 implementation follow-up — 29 September 2026

Item Detail now records organization/private/external ownership, owner/provider, keeper/contact and an independent availability policy. One item represents a homogeneous owner stock pool; use separate items for different owners. Serialized commitments name exact assets, while bulk/lot commitments specify a quantity. Event-bound or date-only offers retain pickup instructions, return deadline/instructions, agreement evidence and cancellation history. Commitments never create stock.

Private visibility is not ownership, and physical transfers do not change ownership or keeper. Private/external stock is excluded from organization-owned totals. Restricted stock contributes to planning/preparation/checkout only through a matching commitment; checkout also checks today against pickup dates. Warehouse staff manage agreements under catalog access rules. Member self-service (F20) and rental lifecycle/return-to-provider tracking (F23) remain separate scope. See the progress document for conservative overlap rules, migration assumptions and verification limits.

### F20–F23 implementation follow-up — 29 September 2026

The contributor workspace provides scoped custody/storage tasks, exact-asset return submissions, damage reports and pickup coordination with warehouse responses. A live action inbox adds personal in-app reminder times. Camera scanning, alias replacement/retirement, location labels and scan-to-transfer context are exposed in the UI. Borrowing/rental agreements link F19 commitments to transfer-backed partial collection/return, extensions and history.

See IMPLEMENTATION_PROGRESS.md for authorization, conservative damage/loan availability rules, browser support, disposable-schema edits and manual acceptance cases. Static verification is not acceptance sign-off. No application builds, test suites or database commands were run for this follow-up, following `.codex/AGENTS.md`.
