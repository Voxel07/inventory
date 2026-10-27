# Audit Findings (2026-10-27)

Review of backend, frontend and tests. P1–P4 fixed and verified on 2026-10-27:
`tsc -b` clean, `bun test` 107/107, `vite build` OK, backend `mvn test` 277/277 against a throwaway Postgres 18.
Status: `[x]` done, `[~]` deliberately not changed (reason given), `[ ]` open.

## P1 – Data exposure

- [~] **Admin ntfy topics have guessable names.** Not changed: the deployment uses its own ntfy server with authentication.
  - [x] Users can no longer save an admin topic (case-insensitive) as their personal topic. `ntfy-test` refuses it as well. `NtfyTopicFeed.reserved`
- [x] **`/api/users/assignable` exposed email, roles and factions.** It now returns `ActorSummary {id, name}` for active accounts only and searches by name only. A new `minRole` filter replaces the keeper picker's client-side role filter, which also broke paging.
- [x] **Found during the fix:** `StorageLocationResponse.keeperUserEmail` sent keeper emails to staff. Removed; the keeper name stays.
- [x] **Impersonation audit.** Each impersonated request is logged (administrator, account, method, path). Outbox events store `impersonator_id` (baseline schema). Added `ImpersonationApiTest` (event attribution, non-admin, invalid/unknown/deactivated target) and a disabled-flag check.

## P2 – Performance / UX

- [x] **`user.*` events reset every client.** The stream now sends `user.changed` only to the affected account and `users.changed` (account lists only) to everyone else. Local writes to `/api/users/*` are `users.changed`.
- [x] **SSE family mismatch (`location.`, `planning.`) refetched everything.** Now matched by prefix. Test added.
- [x] **Each stream reconnect invalidated everything.** The server sends `stream.expiring` 30 s before the token-bound end. The client refreshes the token, opens the next stream, then closes the old one, with no invalidation. A reconnect after an outage still refreshes. Frontend test added.
- [x] **Images re-downloaded on every token refresh.** `useMediaUrl` now shares downloads per session and access epoch (LRU of 200) and ignores token rotation.
- [~] **Privacy filter graph query per response.** Not changed: the client relies on `X-Private-Inventory` (also for admins) for offline eviction, and the `jit=off` setting keeps execution under 100 ms (`application.properties`). Measure before changing it.
- [x] **Inventory summary read the whole catalog.** Admin results are now cached under the `availability` revision token plus the current minute (the 7-day window slides). Rewriting it in SQL would duplicate the ledger/equipment rules. Non-admin results depend on grants and are still computed per request.
- [x] **Custody balances filtered in memory.** New `CustodyBalanceService.of(person, item)` filters in SQL. Used by return submissions, account lifecycle and MCP.
- [x] **`FactionOrderDetail` loaded every order of the faction.** It now calls `/api/orders/faction/previous` (same rule). The client-side `findPreviousFactionOrder` was removed; the backend test covers the rule now.
  - [~] Other `loadAllPages` uses (label printing, CSV import matching, hierarchy pickers, user filter) genuinely need complete data.
- [x] **Eager associations** in `MemberRequest`, `ActionReminder`, `EquipmentCommitment`, `ItemImage`, `PlanningOverride`, `LoanArrangement` are now `LAZY`.
- [x] **`userAccessHistory` N+1:** actors are batch-loaded (`UserOrm.byIds`).
- [x] **Bundle.** Only the active language is downloaded (lint enforces DE/EN key parity). `manualChunks` was removed: Rolldown pulled shared helpers into the vendor groups, so the data grid, jsPDF and Leaflet loaded at startup. Startup JS went from 646 to 287 KiB gzip, plus about 48 KiB for the language.

## P3 – Hardening

- [x] **ntfy:** plain HTTP is refused once the host resolves to a public address (credentials travel with every post). Unit test added.
- [x] **`/q/openapi`** is off in prod (`OPENAPI_ENABLED=true` turns it on).
- [x] **LIKE searches** now escape `%`, `_` and `!` (`Inputs.containsPattern`/`escapeLike`, `escape '!'`) in every user search. The existing copies in `CatalogOrm` and `ReportStore` use the helper too.
- [~] **Webhook DNS rebinding:** not changed. HTTPS hostname verification already blocks a rebinding to an internal host, and the JDK `HttpClient` cannot pin the resolved address.

## P4 – Dead / duplicated code

- [x] Removed: `managesInventory`, `calendarStatus`, `requireFactionView`, `relatedReferences`, `DevLoginInput.password`, `GET /api/member/assignments` (+ service, `MemberOrm.locations`, frontend hook/API/query key), CSV alias constants, `generalOrderApi.create`/`getAll`, `getOrders`/`updateOrder` aliases, `UserResponse.username`/`ActorSummary.username`, unused locals.
- [~] `referenceOrigins` and `activeReservationQuantities` are kept as documented regression oracles.
- [x] 68 file-local `export`s removed.
- [x] One `PageBounds.of(page, size[, max])` replaces the private copies in `ApiQueryService`/`McpInventoryService`.
- [x] Single `CatalogOrm.locations(...)` and a single paged `getAssets(item, status, …)`.

## Test coverage gaps

Added: impersonation, assignable fields/role filter/LIKE/deactivated, reserved ntfy topics, webhook and ntfy address checks, inventory summary, previous faction order, SSE user targeting, SSE handover, event-family mapping.

Still open:
- [ ] `/api/item-categories`, `/api/items/{id}/responsibility/people`, `POST /api/users/{id}/lifecycle/transfer`, `NtfyTopicFeed` batching/drop, `NotificationDeliveryService`.
- [ ] The server side of `stream.expiring` (needs a short-lived token).
- [ ] MCP paths without the response privacy filter (tenant/private-grant edge).
- [ ] Frontend component/page tests, `offlineQueue`, `authManager` refresh/cross-tab logout.

## Environment note

`package.json`/`bun.lock` were changed outside this work at 00:18 (dependency bump including `typescript ~7.0.2`). `typescript-eslint` 8.72 does not support TS 7, so `eslint` and `check:i18n` cannot run until `typescript` is back on 6.x. Those files were left untouched.
