# Refactoring bug fixes

Updated: 2026-10-02. Status: completed and verified locally.

This file tracks the requested fixes, additional findings, and verification. The user explicitly authorized builds, test suites, and an isolated Docker database, overriding the restriction in repository `agent.md`. Verification includes frontend build/lint/tests and backend API regression tests.

## Requested fixes

- [x] 1. Remove only the Stock by location search box from item details. The item retains a linked, quantity-bearing stock-location list when physical stock occupies more than one location, grouping lots or individual assets by location. Single-location items use the existing location in Details. Stock locations are visible to item readers, rather than only users allowed to transact.
- [x] 2. Make every Operations tab display compact list entries. Transfers, loans, counts, lots, purchasing, receipts, suppliers, repairs, maintenance and system entries use compact expandable rows; report tables have compact cells.
- [x] 3. Compact notifications in the Actions & reminders modal. Dense list entries replace separate cards and reduce headings, spacing and action sizes.
- [x] 4. Default delivery acceptance to all goods accepted, with useful fields prefilled. Outstanding quantities, zero damage/rejection, location, reference, local time and serialized codes are filled. Lot-tracked receipts can create a prefilled new lot on save; retries reuse the created lot. Inspection notes remain optional. Transfer receipt quantities also default to the remaining dispatched amounts.
- [x] 5. Fix missing receipt entries and incorrect quantities in stock history. Backend receipts already wrote `received` transactions; the chart ignored that type. Chart deltas now include receipts, signed adjustments, transfers and write-offs, anchored to current physical on-hand stock. Regression checks verify receipt idempotency and correct chart totals.
- [x] 6. Remove Info and Components columns from assemblies; add item search in assembly details using the shared items list. Fixed-height assembly rows and summary API payloads avoid expanded item data on long lists. Assembly details reuse ItemsList with component quantities, search and location/category filters.
- [x] 7. Limit transfer sources to locations holding available selected stock; show availability and enforce quantity limits. Choices follow usable positions/assets and lots. The form shows stock and enforces a maximum; the backend rejects unavailable sources and excessive combined quantities at creation and dispatch.
- [x] 8. Show expected count quantities and storage locations; save partial counts and resume; remove the separate Start step and extra note. New sessions start counting immediately; quantities default to blank, expected values show by default, zero is preserved and partial counts/recounts persist until every line is completed.
- [x] 9. Investigate and fix unstable item/assembly stock and unnecessary reloads/cache behavior. Assembly stock uses live item projections, incomplete loading shows an ellipsis, progressive queries retain refreshes, assemblies use one cached catalog query, and active private snapshots refresh without being erased. Window focus no longer causes unnecessary refetches; explicit writes/realtime invalidation continue refreshing stock.
- [x] 10. Support middle-click/new tabs in sidebar, items, and assemblies navigation. Native router links support new-tab gestures; grid rows additionally handle middle-click outside interactive controls. Browser checks observed separate item, assembly and sidebar tabs while retaining the source tab.
- [x] 11. Link item-detail storage locations to their detail pages. Primary and per-position locations open the existing storage page with URL-backed location selection and its stored items.

## Additional findings

- [x] Progressive pagination could cancel an in-flight refresh and could fetch while disabled. Gate on all fetching and enabled state; preserve active refreshes.
- [x] Assembly API ignores paging; the infinite-list hook could reload the same catalog indefinitely when its length equalled the page size. Use a single cached query.
- [x] Assembly expansions omit live stock and expose base amounts. Detail and list stock now come from the item catalog; incomplete component loading blocks checkout.
- [x] Transfer creation previously accepted unavailable sources and excessive quantities, deferring validation to dispatch. Validate source stock, duplicate-line totals and asset condition at creation and dispatch.
- [x] Count UI offered an all-inventory scope that the backend rejected. Allow unfiltered counts of all visible inventory.
- [x] Private snapshot timers reset active lists every minute. Refresh active snapshots in place, purge failed/inactive reads, and retain immediate eviction on offline/access revocation.
- [x] A cancelled private refresh could erase the valid snapshot. Cancellation now retains it; session-isolation regression coverage verifies this.
- [x] Checkout policy availability incorrectly hid transferable external equipment. Added explicit physical `transferableQuantity` to positions while retaining checkout policy availability; verified external-stock transfers in the API suite.
- [x] StockPositions could retain an old item's/location's filter when route props changed. Fixed route props now take precedence over optional interactive filters.
- [x] Storage selection existed only in component state, preventing direct links. It now lives in the locationId query parameter, including normal selection and back navigation.

## Progress and verification

- Follow-up: moved ownership/provider, keeper/contact, availability and commitment controls into the item Details panel, removed the standalone ownership section there, and reduced the special-instruction panel to its content height and one-third width on desktop. Retained ownership editing and commitment workflows.
- Follow-up verification: build, lint and diff checks passed. Browser fixtures verified two linked locations with 5 and 2 units, a single-location item retaining its Details link without a redundant table, ownership fields inside Details, prefilled ownership editing, and the compact instruction panel. Screenshot: `docs/item-details-verification.jpg`. The temporary preview server and browser tab were stopped afterward.

- Frontend: `bun run build`, `bun run lint`, `bun test` and `git diff --check` passed. All 24 frontend tests passed, including stock-history reconciliation and private snapshot refresh/cancellation checks. The build retains its existing large vendor-chunk warning.
- Backend: 95 distinct tests passed across InventoryApiTest (49), EquipmentApiTest (9), PriorityRefactorApiTest (9), MaintenanceStockApiTest (6), PrivateInventoryApiTest (8), InventoryMcpTest (12), and InventoryMcpAuthenticationTest (2). The focused Inventory/Equipment suites were rerun after the transferable-stock change. New checks cover partial count/recount persistence including zero, receipt retry history, unavailable/excessive transfer sources, duplicate line totals and external equipment transport.
- MCP/sample smoke: initialized the real local `/mcp` endpoint, discovered 21 tools, seeded 340 sample items and 50 sample assemblies using the application's CSV parsers and canonical MCP creation tools. Existing test data brought total assemblies to 53. Canonical serialized creation generates asset codes; this smoke seed covers the sample catalog rather than importing every CSV action/order row.
- `tests/refactoring.sample-smoke.ts` passed against the isolated PostgreSQL API: receipt +5 with an idempotent retry, stock history reconciliation, rejected excessive transfer, dispatch/receipt of 2 units, and persisted/resumed partial count. It also prepares an ordered lot-tracked receipt for browser verification. Run explicitly against an isolated loopback development API; each run adds new operation records.
- Browser: `tests/refactoring.browser.html` uses actual production components with fixtures by default. `?live` targets the isolated API at 127.0.0.1:18085. Verified compact operation/reminder lists; default bulk receiving; creation and acceptance of a new lot with all 4 units accepted; limited transfer source choices and max quantities; blank/zero partial counts and resume; assembly search and correct live stock; receipt/history display; location links showing 13 stored sample item types; and new-tab navigation. New browser tabs load the normal app and require its usual session setup.
- Delivery verification screenshot: `docs/refactoring-bugfix-verification.jpg`.
- Temporary Vite/API processes and the Docker database container are removed after verification. No production inventory was modified.
