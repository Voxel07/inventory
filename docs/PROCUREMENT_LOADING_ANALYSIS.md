# Procurement loading analysis

Reviewed and optimized on 2026-09-30. This is a source-code analysis; live request timings,
database query counts, and production data volumes have not been measured.

## Implemented fix

The procurement calculation now uses `PlanningStockOrm.snapshot()` to retrieve
all stock inputs in **one SQL statement / one database round trip**. Its tagged
`UNION ALL` branches aggregate ledger totals, damage, reservations, and checkout
counts, and retrieve positions/lots, assets, maintenance schedules, commitments,
loans, and consumption history together. General order reservation maps are read
once. Independent collections are not joined together, avoiding multiplied stock
quantities and oversized Cartesian results.

`PlanningStockService` builds request-local physical and policy-adjusted stock
maps. Availability rules are shared with the existing equipment workflows;
event availability is cached by item, event, and credited reservation quantity.
There are no database calls inside the item/date/event planning loops. Planning
order/forecast reads remain separate queries, with required lazy relationships
fetch-joined. Incoming deliveries are grouped by item before calculating dates.

The frontend groups suppliers in linear time and shows table/card skeletons
while the actual deficits query is loading, including when the event scope
changes. Background refreshes preserve existing rows and display an updating
message. A failed request no longer also displays the successful empty state.
There is no simulated percentage: this endpoint returns one completed response
and exposes no intermediate progress.

TypeScript, targeted ESLint, Java syntax parsing, SQL projection/source review,
and whitespace checks were used for verification. Procurement lint passes;
the latest project-wide TypeScript run reports errors outside `Procurement.tsx`
in other concurrently edited equipment/operations files. Builds and test suites were
not run, following `.codex/AGENTS.md`. Live latency and database execution remain
unverified.

## Original bottleneck: repeated database work

`src/pages/Procurement.tsx` starts the deficits query immediately. Events and
purchase orders load independently; neither gates the deficits query. The request
is `GET /api/procurement/deficits`, delegated to `PlanningService.deficits()`.

The endpoint calculates every active item's shortages across the planned event
scope before returning any rows. Its stock batch calculation is followed by a
second, individual physical-stock calculation for every item:

- `InventoryOperationsService.stock(List<Item>)` batches transaction, damage,
  reservation, and serialized asset reads, but calls `positions.blocked(item)`
  for each bulk item and `equipment.available()` for each item. The latter always
  queries open contributor damage; conditional equipment also queries agreements.
- `PlanningService.deficits()` then calls `inventory.physicalStock(item)` for
  every item. For a bulk item this executes six explicit queries: transaction
  totals, custody write-offs, damage totals, reservation totals, all general
  orders in preparing/ready status, and inventory positions. The same general
  orders are read and their quantity maps aggregated again for each bulk item.
- For restricted equipment, `inventory.availableFor(item, event, ...)` repeats
  physical-stock and commitment checks inside the item/date/event loops. The
  same item/event availability is recalculated at multiple planning dates.

For ordinary bulk items, the two paths together add approximately eight explicit
queries per item, on top of the initial planning/batch queries and any lazy
relationship loads. As an illustration, 200 bulk items mean about 1,600 repeated
queries; an average 15 ms per sequential query would consume about 24 seconds.
These are illustrative inputs, not measured production figures.

## Additional multipliers

- `PlanningOrm.lines()`, `generalOrders()`, `incoming()`, and `overrides()` read
  their entire matching datasets. Event selection is applied in Java after
  loading order data. `lines()` does not fetch-join its lazy order relationship,
  which is subsequently dereferenced for event and status information.
- Demand calculation traverses items × distinct start dates × scoped events.
  Incoming purchase lines are scanned for each item and again for each date.
- The frontend copies the accumulated supplier array for every row when grouping
  deficits, making a large supplier group quadratic to construct. All shortage
  rows are rendered at once. This can add work after the response arrives, but
  does not explain slow server time to first byte.

## Why the observed wait can exceed the request timeout

`apiClient.ts` aborts each fetch after 20 seconds, while the query client in
`App.tsx` allows two retries. A timed-out first attempt followed by a successful
retry can therefore produce an approximately 30-second visible load. The
30-second `staleTime` controls freshness; it does not delay the initial fetch.
Authorization runs before the fetch timeout begins. The timeout is cleared once
fetch receives response headers, so reading/parsing the body is outside that timer.
Without a network trace, retry amplification cannot be distinguished from a
single slow response, authentication delay, or client rendering cost.

## Recommended optimization order

1. Separate batch physical-stock calculation from policy-adjusted availability,
   keep both maps for the request, and reuse physical stock in planning.
2. Batch position and open contributor-damage reads. Load the relevant
   commitments, loan arrangements, and equipment once; reuse item/event
   availability across planning dates without changing consent or reservation rules.
3. Restrict planning reads to the required event scope in SQL and fetch the
   relationships actually used. Preserve handed-over demand, overlapping reusable
   equipment, and latest-override semantics.
4. Index incoming deliveries by item and delivery date. Build supplier groups
   with array pushes, then paginate or virtualize unusually large rendered lists.

Confirm with a network trace showing request attempts, time to first byte, and
render time, plus an endpoint trace showing SQL query count and duration. This
would establish the actual contribution of each source-level bottleneck before
changing the shortage calculation.

The findings above describe the original implementation; the stock-query and
supplier-grouping multipliers have been addressed by the implemented fix.
