# Feature coverage and remaining gaps

Reviewed 30 September 2026 against frontend routes, services and backend implementations. This replaces the pre-implementation gap analysis and supersedes the obsolete 27 September UI audit. No new interactive UI verification was performed.

## Current assessment

F01–F23 are present in source. Receiving, transfers, counting, procurement integration, event outcomes, hierarchy, reporting, ownership, contributor work and borrowing/rental all have user workflows. They are no longer missing-feature findings. Source presence does not prove transactional correctness, role coverage or responsive acceptance.

The primary remaining work is consolidation and verification. See [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) for concrete duplication and layering findings, [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md) for behavior/verification, and [requirements](../REQUIREMENTS_ARCHITECTURE.md) for invariants.

## Feature matrix

Priority retains the original delivery ordering, not a current severity rating.

| ID | Priority | Workflow | Requirement / purpose | Current state |
|---|---|---|---|---|
| F01 | P0 | Event operations view with separate planned, requested, prepared, handed-over, outstanding, returned, consumed, missing, damaged and written-off quantities. Include planned-only items and attributable direct checkouts. | ORD-01/04/05; domain event-demand/utilization reporting | Present in source; acceptance pending |
| F02 | P0 | One demand and availability planner connecting event plans, faction/general orders, existing reservations, usable stock, receipt dates and transferable stock. Explain shortages and record overrides. | PRC-01; domain replenishment calculation and overrides | Present in source; acceptance pending |
| F03 | P0 | Purchase-order workspace: select several shortages, group by supplier, edit a draft, submit/record the order, cancel remaining quantities, track delivery and retain item/event links. | PRC-02/03; domain draft PO generation | Present in source; acceptance pending |
| F04 | P0 | Goods receiving: partial deliveries, actual location, accepted/damaged/rejected quantities, lot and serial capture, receipt history and remaining delivery balance. | PRC-03; purchasing/receiving contract | Present in source; acceptance pending |
| F05 | P0 | Stock by actual location, including available/reserved/damaged/quarantined/in-transit quantities and exact serialized assets. Choose the source when preparing or moving stock. | INV-01/02; stock/positions contract | Present in source; acceptance pending |
| F06 | P0 | Location transfers with dispatch, destination receipt, partial receipt and discrepancy resolution. | Domain transfers; central/home/rented storage | Present in source; acceptance pending |
| F07 | P0 | Complete general-order preparation, reservations, return outcomes, exact asset reconciliation, lifecycle history and per-action permissions; reuse faction-order behavior where appropriate. | ORD-01/03/04; AUD-01/02; SEC-01 | Present in source; acceptance pending |
| F08 | P0 | Authoritative custody and return worklists, outstanding/missing/late-return handling, pending acknowledgement and explicit resolution notes. | ORD-04/06; RET-01/02; custody contract | Present in source; acceptance pending |
| F09 | P0 | Shared capability policy for UI actions and backend commands, including owner/faction scope, admin-only actions and privileged corrections. | SEC-01/02; domain authorization matrix | Present in source; acceptance pending |
| F10 | P1 | Blind stocktaking by location/category/item, recount, independent variance approval, posting adjustments and visible count history. | Domain counts and adjustments | Present in source; acceptance pending |
| F11 | P1 | Lot/batch operations: receive, select, locate, hold/release, see expiry, and issue by earliest appropriate expiry. | Domain lot tracking/FEFO; extends CAT-06 beyond one item-level date | Present in source; acceptance pending |
| F12 | P1 | Repair cases with triage, responsibility, progress, costs/parts, verification and return to service. | DAM-01/02; domain repair lifecycle | Present in source; acceptance pending |
| F13 | P1 | Asset-specific maintenance schedules, calendar/hour/usage intervals, warning windows, required checklists and completion evidence. | MNT-01; CAT-06; domain maintenance | Present in source; acceptance pending |
| F14 | P1 | Supplier details and purchase/receipt document management: attach, retrieve, authorize and retain invoices, delivery notes and certificates. | Domain vendor documents; completes purchasing context | Present in source; acceptance pending |
| F15 | P1 | Structured warehouse/location hierarchy, location type, active status and location-aware stock navigation. | LOC-01; domain warehouses/locations | Present in source; acceptance pending |
| F16 | P1 | Guided offline conflict resolution, per-action offline status, cache freshness and server sync-audit access. Decide and document offline scope explicitly. | OFF-01/02; domain offline protocol | Present in source; acceptance pending |
| F17 | P1 | Rebuildable operational reports: event demand/use, availability by location, unresolved returns, repair/maintenance backlog, consumption, purchases, count variance and write-offs. | Domain reporting and projections | Present in source; acceptance pending |
| F18 | P1 | Admin operational view for outbox health, failed-event inspection/retry and sync failures; show report freshness where relevant. | Domain outbox/operator access and projection lag | Present in source; acceptance pending |
| F19 | P2 | Explicit ownership, keeper and availability commitment, independent of catalog visibility and physical location. | Distributed/private equipment use case | Present in source; acceptance pending |
| F20 | P2 | Scoped member self-service for equipment in their custody/storage, return submission, damage reporting and pickup coordination. | Extends existing RET workflows to everyday contributors | Present in source; acceptance pending |
| F21 | P2 | Action inbox and targeted reminders for pickups, overdue returns, pending acknowledgements, receipts, expiring lots and maintenance. | Efficiency; current order-ready notifications are a starting point | Present in source; acceptance pending |
| F22 | P2 | Camera scanning in the web field workflow, code alias/replacement management, location labels and scan-to-location actions. | Builds on ORD-06 and existing label/code lookup | Present in source; acceptance pending |
| F23 | P2 | Borrowing/rental arrangements with provider, committed quantity/assets, collection/return dates and extension/return status. | Domain rental role exists; practical sourcing beyond purchases | Present in source; acceptance pending |

## Outstanding scope and acceptance

- F16 queues only stock transactions, faction-order creation/preparation/transitions/returns and damage reports without new uploads. General orders, contributor commands, purchasing, transfers, counts, loans, labels, maintenance, report rebuilds and catalog mutations require connectivity. See [OFFLINE_MODE.md](OFFLINE_MODE.md).
- F17 snapshots are manually rebuilt and disposable; commands continue to validate transactional records.
- F19 uses one owner per item stock pool. Mixed-owner quantities must be separate items; commitments authorize stock without receiving it.
- F20 return submissions retain custody until acceptance; damage requests conservatively block availability pending inspection and explicit resolution.
- F21 reminders are in-app; no email/push delivery worker exists.
- F22 camera scanning depends on browser `BarcodeDetector` and HTTPS/localhost; manual and handheld input remain available.
- F23 physical collection/return requires completed transfers and matching evidence; rental costs are agreement evidence, not accounting entries.

Acceptance must cover permitted/forbidden roles, narrow mobile and desktop layouts, partial completion, repeated commands, competing stock allocations, exact serialized identities, failed-command correction and retained history. Current source/static inspection does not establish those results. Fresh PostgreSQL initialization and backend compilation/regression remain pending under the repository verification policy.
