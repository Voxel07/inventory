# Backend test failures on main (9 tests)

Sorted by priority. Status: [x] fixed, [ ] open.

## P1 – Production bug: order sub-routes unreachable (6 tests, 404)
- [x] `/api/orders/{kind}/{id}/pickup-groups[/notify]`, `/handovers`, `/reconciliations` returned 404 for every request.
- Cause: after the order consolidation, `OrderPickupResource` and `CustodyResource` used `@Path("/api/orders/{kind}/…")`.
  JAX-RS selects the root resource with the most literal characters first (`/api/orders/faction`, `/api/orders/general`)
  and never backtracks to another root class, so these classes were shadowed. The frontend calls exactly these URLs.
- Fix: routes moved into `OrderResource` and `GeneralOrderResource` (`/{id}/pickup-groups`, `/{id}/handovers`, …);
  shadowed classes deleted.
- Tests: `OrderPickupApiTest` (4), `InventoryApiTest.generalReservationsProtectSourcesAndMissingRemainsInCustody`,
  `ArchitectureApiCoverageTest.custodyEvidenceAndNotificationsKeepTheOriginalRecipient`.

## P2 – Pool metrics exported constant zeros (1 test)
- [x] `TelemetryExportTest`: `acquireCount() == 0`.
- Cause: `af7c3fb` set `quarkus.datasource.jdbc.metrics.enabled=false` together with JDBC statement tracing, so
  Agroal stopped collecting and `DatabasePoolTelemetry` exported zeros for every `inventory.db.pool.*` metric.
- Fix: re-enabled only pool metrics (cheap counters); per-statement JDBC tracing stays off.

## P3 – Stale test: baseline counts (2 tests)
- [x] `BaselineSchemaTest` expected 61 tables / 28 revision sources.
- Cause: order consolidation (`7178114`) intentionally dropped `general_orders`, `general_order_lines`,
  `general_order_line_assets`, `general_order_history` (and their two revision triggers). Schema is correct; Hibernate
  validation passes.
- Fix: test updated to 57 tables / 26 revision sources.

## Verification
- [x] Full suite green against throwaway Postgres (207 tests, 0 failures)
