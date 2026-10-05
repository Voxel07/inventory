# Code review — 5 October 2026

Whole-application review: backend (Quarkus, 182 Java files), frontend (React 19, ~210 modules), schema, deployment config.
Static review only; nothing was built, tested or measured. Sorted by priority. Status: ☐ open · ☑ done · ◐ partly done (rest deferred) · ⏸ deferred design work. Resolution notes: [Resolution](#resolution--5-october-2026).

Verification: [finding-by-finding source checks, test results and corrections](CODE_REVIEW_2026-10-05_VERIFICATION.md). Several claims and proposed fixes need qualification; #18's cited predicate mismatch is absent from the current code.

Previous review: [REPOSITORY_REVIEW.md](REPOSITORY_REVIEW.md). Of its open items, **R03, R04 and R05 are still open** (see #32–#34). R06 was addressed by [BACKEND_P2_FIXES.md](BACKEND_P2_FIXES.md).

---

## P1 — Security / identity

| # | Finding | Fix | Status |
|---|---|---|---|
| 1 | **Accounts are bound to a mutable username.** `ActorService.current()` keys `UserAccount.externalSubject` on `identity.getPrincipal().getName()`. Quarkus resolves that from `upn` → `preferred_username` → `sub`, so with Authentik it is the *username*. Renaming or reusing a username in Authentik hands the new person the old account, including its private items, shares, custody and audit identity. The issuer isn't stored either. [ActorService.java:37](../backend/src/main/java/org/ash/inventory/helper/security/ActorService.java#L37) | Set `quarkus.oidc.token.principal-claim=sub`. Store `issuer`+`sub` as the unique key, and keep name/email as display data only. Recreate the disposable DB. | ☑ |
| 2 | **Role and faction assignments are overwritten on every request.** Each request copies `role` from the token groups ([L83](../backend/src/main/java/org/ash/inventory/helper/security/ActorService.java#L83)). `factions` is copied from `identity.getAttribute("factions")` ([L59](../backend/src/main/java/org/ash/inventory/helper/security/ActorService.java#L59)), which no `SecurityIdentityAugmentor` ever sets, so it always resets to `[]`. Consequences: (a) the UserManagement page (`PATCH /users/{id}`) is lost on the user's next request; (b) under OIDC a faction leader has no factions and can't reach any order. | Choose one source of truth. Recommended: Authentik groups for the role, plus an augmentor that maps `inventory_faction_<event>_<name>` groups. Make UserManagement read-only (or remove it). Alternative: keep the DB authoritative and never overwrite from the token. | ☑ |
| 3 | **Logout doesn't invalidate tokens.** (a) Logout clears local state and redirects to `end_session`, but never calls the RFC 7009 `revocation_endpoint`. With scope `offline_access` ([runtimeConfig.ts:52](../src/config/runtimeConfig.ts#L52)) the refresh token can stay valid. (b) The backend validates JWTs locally, so access tokens work until `exp`. (c) Access, refresh and ID tokens are stored durably in IndexedDB `ash-auth` ([authStorage.ts](../src/services/authStorage.ts)). They survive a browser close and can be read by any XSS. (d) Logout isn't propagated to other tabs, which keep their `sessionStorage` tokens. (e) The SSE stream is authenticated once ([EventStreamResource.java:33](../backend/src/main/java/org/ash/inventory/resource/EventStreamResource.java#L33)) and stays open after the token expires or the user logs out. | Revoke the refresh token before `end_session`. Use a short access-token TTL (≤5 min) and refresh-token rotation in Authentik. Backend: enable introspection for revocation (`quarkus.oidc.token.allow-jwt-introspection` + `token-cache`, bounded e.g. 60 s), or accept the TTL as the revocation bound. Close the SSE `Multi` at the token's `exp`. Use a `BroadcastChannel` logout across tabs. Persist the refresh token only when offline mode needs it. Replace the hand-rolled client with `oidc-client-ts` (see #24). | ◐ |
| 4 | **Every SSO user is admitted.** A user with no `inventory_*` group becomes `faction_leader` ([L228](../backend/src/main/java/org/ash/inventory/helper/security/ActorService.java#L228)). `canViewItem` returns true for global/event items for that role, so any Authentik account can browse the catalog, locations and events. | No inventory group → 403 (or an explicit, configured default role). | ☑ |
| 5 | **Dev auth can be enabled in prod.** `DEV_AUTH_ENABLED` is honoured in the `prod` profile. `devLogin` creates `hq_admin` accounts for any e-mail. The frontend silently falls back to dev login whenever the OIDC config is missing. The rate limiter keys anonymous callers on spoofable `X-Actor-Id`/`X-Forwarded-For`. | Fail startup if `inventory.dev-auth.enabled=true` under `%prod`. In a prod build, refuse to start without OIDC config instead of showing dev login. | ☑ |
| 6 | **Media upload is unconstrained.** No MIME allowlist or magic-byte check. The client `Content-Type` is stored and echoed back (S3 mode). There's no explicit body limit. Staged uploads (`resourceType == null`) are never purged, so any user can fill the storage. [MediaResource.java:34](../backend/src/main/java/org/ash/inventory/resource/MediaResource.java#L34) | Allowlist (`image/webp,png,jpeg`, `application/pdf` for documents) with a sniffed type, plus `quarkus.http.limits.max-body-size`. Send `Content-Disposition: attachment` for non-images. Add a scheduled purge of staged objects older than 24 h, and a per-user quota. | ☑ |
| 7 | **nginx headers.** CSP `connect-src` allows *any* `http: https: ws: wss:` origin. `camera=()` blocks the scanner (R05). `add_header` inside `location` blocks (`/config.js`, static assets) drops every server-level security header for those responses (nginx inheritance). [nginx.conf:11](../nginx.conf#L11) | Limit `connect-src` to the API + OIDC origins and use `camera=(self)`. Repeat the headers via an `include` snippet in each location that sets `add_header`. | ☑ |

## P1 — Performance (DB load / scalability)

| # | Finding | Fix | Status |
|---|---|---|---|
| 8 | **Every server event reloads every query on every client.** SSE rewrites every domain event to `{type:"access.invalidated"}` ([EventStreamResource.java:38](../backend/src/main/java/org/ash/inventory/resource/EventStreamResource.java#L38)). The client answers each one with `cancelQueries()` + `resetQueries()` on the whole cache ([realtimeInvalidation.ts:6](../src/utils/realtimeInvalidation.ts#L6)). `privateMediaEpoch` also refetches every media blob on any `ash-api-change`. With N connected clients, one stock movement causes N × (all active queries × all pages) reloads. Because `resetQueries` drops the data, lists flash to spinners. The selective `affectedDomains` map is only used for local writes. A reconnect also issues a full reset ([apiClient.ts:452](../src/services/apiClient.ts#L452)). | Send `{type, resource}` without IDs; the event family isn't private. Map it through `affectedDomains` and use `invalidateQueries` (keeps data, refetches active only). Reserve the full reset for `access.changed` affecting the recipient. Coalesce events (~300 ms). Bump the media epoch only on `access.*`. | ☑ |
| 9 | **Privacy response filter on every JSON response.** `PrivacyResponseFilter` turns each response into a Jackson tree and regex-scans every UUID. It then runs a recursive CTE over a 50-branch `UNION` of all evidence tables (including `stock_transactions` and `jsonb_object_keys` over all general orders), and re-serializes the result ([InventoryAccessOrm.java:107](../backend/src/main/java/org/ash/inventory/orm/InventoryAccessOrm.java#L101)). This needed a global `jit=off` workaround. `deniedReferences(actor)` materializes **all** evidence IDs of all denied roots and binds them as `not in (:privateDenied)`. It's used by orders, transfers, counts, loans, purchasing, member, inbox, reports, stock management and **each media GET** ([InventoryMediaService.java:38](../backend/src/main/java/org/ash/inventory/service/InventoryMediaService.java#L38)). The set grows with the ledger and will hit PostgreSQL's 65 535 bind-parameter limit. Mixed rows are silently dropped, so page sizes and totals are wrong. | Make privacy a query predicate, not a response post-filter. Evidence rows already carry `item_id`/`location_id`: join to the policy using the existing `InventoryAccessOrm.visible()` predicate (or denormalize `access_policy_id` on insert). Then delete the response filter, the graph walk, `deniedReferences` and `jit=off`. Keep the response check only as a test assertion. | ◐ |
| 10 | **Global write serialization through `source_revisions` triggers.** 27 hot tables have a statement trigger that `UPDATE`s one counter row per table ([V1.0.0__init.sql:1075](../backend/src/main/resources/db/migration/V1.0.0__init.sql#L1075)). The row lock is held until commit, so all concurrent writers to `stock_transactions`, `inventory_positions`, `asset_instances`, … serialize. Multi-table commands take these locks in statement order, which risks deadlocks. The only benefits are the faction cache key and report freshness. | Drop the triggers and the `source_revisions` table. Report freshness: latest outbox `occurred_at` per aggregate family. Faction cache: invalidate on `catalog.changed` (already fanned out across nodes). | ☑ |
| 11 | **Frontend downloads whole collections.** `useProgressiveList` drains every page automatically ([useProgressiveList.ts:23](../src/hooks/useProgressiveList.ts#L23)). `useItems()` (full catalog, each row with a live stock projection) is mounted by **18 pages**, and search/filter/sort run in the browser even though `/api/items?search=` exists. Combined with #8, every event re-downloads the catalog, transactions, damage reports, orders and users. | Server-side paging/filter/sort (DataGrid `paginationMode="server"`). Add an `ItemPicker` autocomplete against the search endpoint, plus a light `ItemSummary` projection without stock for pickers and labels. | ◐ |

## P2 — Caching

| # | Finding | Fix | Status |
|---|---|---|---|
| 12 | **Current caching is ineffective.** The only `quarkus-cache` is `factions-cache` (Valkey) for a tiny list. `CatalogResponseCache.locations()/events()` only serialize; nothing is cached. `EtagResponseFilter` hashes the body *after* the full DB work, so it saves bandwidth, not DB load. Its `knownEtags` map is write-only and the request filter is empty (dead code). The report cache is a hand-rolled per-node `LinkedHashMap`. The hottest reads aren't cached: the actor lookup on every request (#13), grant/group checks per policy (`InventoryAccessOrm.granted`), the location tree, events, factions, categories and category maintenance policies. | Use `quarkus-cache` with the **Caffeine** backend (in-process) for reference data and the actor/access context. Invalidate through the existing `EventBroadcaster` listener on `catalog.changed`, `access.changed` and `user.changed`; it is already fanned out via Valkey pub/sub. Derive the ETag from the cache version so a 304 skips DB work, or delete the filter. Don't cache dynamic stock. | ◐ |
| 13 | **Actor resolution runs on every request.** `ActorService.current()` is `@Transactional`: one `SELECT` and possibly an `UPDATE` per request. Every tab also polls `/api/auth/me` every 60 s. | Cache the resolved actor by `(sub, token iat)` for the token lifetime (Caffeine). Write only when claims change. Drop the polling once #8 delivers `user.changed`. | ☑ |
| 14 | **quarkus-cache + Valkey: do you need both?** `quarkus-redis-cache` is just a remote backend *of* quarkus-cache. A network hop plus JSON serialization for a small, read-mostly dataset is slower than local memory. The default deployment ([docker-compose.yml](../docker-compose.yml)) runs **one** API node, yet still forces `EVENT_BACKEND=redis` and the Redis rate limiter. | **Recommendation:** use local Caffeine caches, with Valkey only as the *invalidation bus* (near-cache pattern). Remove `quarkus-redis-cache`. Keep `quarkus-redis-client` for cross-node SSE fan-out and the distributed rate limiter, and only in `docker-compose.cluster.yml`. Single node: `EVENT_BACKEND=memory`, no Valkey container. Use `EVALSHA`/`FUNCTION` for the rate-limit script. | ☑ |

## P2 — Duplication / complexity

| # | Finding | Fix | Status |
|---|---|---|---|
| 15 | **There are two order aggregates.** `FactionOrder`/`FactionOrderLine` use typed columns. `GeneralOrder` uses **12 jsonb maps** keyed by item-ID strings ([GeneralOrder.java](../backend/src/main/java/org/ash/inventory/model/GeneralOrder.java)). They have separate services (OrderService 1108 lines, GeneralOrderService), resources, frontend workflows, custody adapters and SQL `lower(q.key) = id::text` joins. There's no foreign-key integrity, and the privacy graph has to parse JSON. | One `orders` + `order_lines` model with `kind` (faction/general) and an optional faction. One lifecycle service and one UI workflow. | ⏸ |
| 16 | **`Item` has three overlapping access/ownership models:** legacy `visibilityScope/assignedUser/assignedGroup`, `InventoryAccessPolicy` (private), and descriptive `ownerName/keeperName`. `canViewItem` branches on both access models. | Use the policy as the only access model: public = no policy; person/group visibility = policy grants. Keep owner/keeper text purely descriptive. | ⏸ |
| 17 | **Maintenance state is duplicated.** `Item.maintenanceIntervalDays/nextMaintenanceDue/maintenanceStatus/currentOperatingHours` run in parallel with `MaintenanceSchedule` and `CategoryMaintenancePolicy`. `MaintenancePolicy.blocksItem` consults both. | Use schedules only, with the category policy as a schedule template. | ⏸ |
| 18 | **Availability eligibility is implemented three times** with different predicates: `EquipmentService` (anonymous `AvailabilityData`), `EquipmentReadService.Facts` and `PlanningStockService` ([L164](../backend/src/main/java/org/ash/inventory/service/PlanningStockService.java#L164) vs [EquipmentReadService.java:65](../backend/src/main/java/org/ash/inventory/service/EquipmentReadService.java#L65): the `checkoutBlocking` filter differs). Reports (R03) diverge as well. | One pure `AvailabilityPolicy` over one batch facts loader, used by commands, catalog, planning, reports and MCP. | ☑ |
| 19 | **Copy-paste helpers.** `required` / `requiredLocked` / `offset` / `blankToNull` are copied into ~10 services, although `PageBounds` and `EntityOrm` exist. | Move them to `EntityOrm` (`require`, `requireLocked`) and `PageBounds`. | ☑ |
| 20 | **Two schema sources.** Dev uses Hibernate `update`, so the trigger SQL is duplicated in `source-revisions.sql` and `DevelopmentRevisionSchema` installs it. | Dev and test run the Flyway baseline (drop-and-create); delete the duplicate (and see #10). | ☑ |
| 21 | **Authorization is split.** Some checks live in resources (e.g. `actor.requirePlanner()` in `CatalogResource` events), others in services. MCP and offline replay call services directly. | Do all role checks in services (or `@RolesAllowed` on services); resources only translate HTTP. | ☑ |
| 22 | **Two i18n systems.** About 2,400 inline `t('de','en')` pairs coexist with the i18next resources (131 keys). | Extract the pairs to i18next keys with a script; then use `useT()` only. | ⏸ |
| 23 | **Reference data hard-coded in the frontend.** Factions/event types (`FACTIONS_BY_EVENT`, `EVENT_TYPES` in [factionOrder.ts:7](../src/types/factionOrder.ts#L7)) duplicate the `factions` table and API. | Load them from `/api/factions` (cached, #12). | ☑ |

## P2 — Frontend libraries (state management / backend interaction)

TanStack Query v5 + Zustand 5 + MUI 9 + React 19 with the React Compiler are current and fit the app. The gaps are the hand-rolled infrastructure around them:

| # | Finding | Fix | Status |
|---|---|---|---|
| 24 | **Hand-rolled OIDC.** PKCE, refresh, logout and storage are written by hand (`oidcClient` 269 + `authManager` 228 + `authStorage` 72 lines). There's no revocation, multi-tab sync or session monitor (#3). | Use `oidc-client-ts` (+ `react-oidc-context`): `automaticSilentRenew`, `revokeTokensOnSignout`, `monitorSession`, and a `userStore` in `sessionStorage`. | ⏸ |
| 25 | **Hand-written API contract.** The API client (530 lines), `resourceFactory`, and hand-maintained `types/*.ts` mirror the Java DTOs, so they drift. The backend already ships `smallrye-openapi`. | Generate types and the client (`openapi-typescript` + `openapi-fetch`, or `@hey-api/openapi-ts` with its TanStack Query plugin). Keep only the session/offline middleware. | ⏸ |
| 26 | **Custom offline/cache plumbing.** There's an IndexedDB catalog cache plus queue (356 lines), a window `CustomEvent` bus and a manual QueryClient swap. This is the root of R04. | `@tanstack/query-persist-client` with an IDB persister (per-account key), `networkMode: 'offlineFirst'`, and paused-mutation persistence with `resumePausedMutations()`. Replace the `CustomEvent` bus with a `QueryClient` subscription. | ◐ |
| 27 | **No form library.** Large forms hold raw `useState` (FactionOrderForm 632 lines/16 states, ItemForm 567). Validation lives in handlers. | `react-hook-form` + `zod` (or TanStack Form), with schemas derived from the generated API types (#25). | ⏸ |
| 28 | **Old router style.** `BrowserRouter` + `<Routes>` with wrapper guards; no loaders/prefetch and no per-route error element. | React Router 7 data router (`createBrowserRouter`, route `lazy`, `loader` → `queryClient.ensureQueryData`, `errorElement`). | ⏸ |
| 29 | **Hand-written service worker.** It serves `index.html` and every navigation cache-first, so users keep a stale app after a deploy until `CACHE` is bumped by hand. | `vite-plugin-pwa` (Workbox precache manifest, network-first navigations, update prompt). | ☑ |
| 30 | **Lint is broken.** TS 7 isn't supported by typescript-eslint (BUGFIX #10), so the React Compiler rule isn't enforced. `eslint-plugin-react-compiler` is superseded by the compiler rules in `eslint-plugin-react-hooks` v7. | Pin TS 6 for linting (or use `tsgo` for type-check and TS 6 for ESLint). Drop `eslint-plugin-react-compiler`. | ☑ |

## P2 — Frontend component reuse

| # | Finding | Fix | Status |
|---|---|---|---|
| 31 | **Dialogs aren't reused.** `FormDialog`/`DialogForm` are used by only 3 forms. About 20 dialogs rebuild title/content/actions/full-screen by hand (`fullScreen={isMobile}` appears 11×). `PurchasingOperations` and `StockOperations` use the raw MUI `Dialog`, so they have no close button. Duplicated dialogs: the QR label dialog (Items, ItemDetail, FactionOrderDetail, AssetInstancesList) and the damage-report dialog (AssetDetail, AssemblyDetail, DamageReports). Tables are hand-built 14× (MUI `Table`) next to 6 DataGrids, and each repeats the `useCompactCatalog` mobile switch. | Add `QrLabelDialog` and `DamageReportDialog`, and move ad-hoc forms to `DialogForm`. Build one `DataTable` (DataGrid in server mode + compact card renderer), replacing `ListPagination`/`useClientPagination` for server data. | ◐ |

## P2 — Open items from the previous review

| # | Finding | Fix | Status |
|---|---|---|---|
| 32 | R03: the availability report still ignores the contributor-damage hold ([OperationalReportService.java:185](../backend/src/main/java/org/ash/inventory/service/OperationalReportService.java#L185)). | Solved by #18. | ☑ |
| 33 | R04: collection queries have no `networkMode`, so a cold offline start pauses before the IDB fallback. | Solved by #26. | ☑ |
| 34 | R05: nginx still sends `camera=()`. | Fix in #7. | ☑ |

## P3 — Database / misc

| # | Finding | Fix | Status |
|---|---|---|---|
| 35 | **Missing indexes.** PostgreSQL doesn't index foreign keys automatically. Unindexed examples: `inventory_positions(location_id)`, `stock_transactions(source/destination_location_id)`, `asset_instances(current_location_id)`, `stock_reservations(location_id)`, `inventory_lots(item_id)`, `custody_handover_lines(item_id)`. Lookups on `lower(asset_code)`, `lower(sku)` and `lower(name)` have no functional index, and `%search%` has no trigram index. | Add the FK indexes, functional unique indexes, and a `pg_trgm` GIN index on items `name`/`sku` to the baseline. | ☑ |
| 36 | **Server-timezone dates.** Availability and maintenance date logic uses `ZoneId.systemDefault()`, so results depend on the server's timezone. | Use one configured zone (`inventory.timezone=Europe/Berlin`). | ☑ |
| 37 | **Four independent 60 s timers per tab** (`/auth/me`, private-query refresh, media epoch, action inbox) that keep running while hidden. The outbox is polled every 1 s on each node. | Use TanStack `refetchInterval` with `refetchIntervalInBackground:false`; drop the timers that #8 makes redundant. Outbox: poll every 5 s or wake up via `LISTEN/NOTIFY`. | ☑ |
| 38 | **Money formatting is inline** (`cents / 100` + `€`) in several components. | Shared `formatMoney` via `Intl.NumberFormat`. | ☑ |
| 39 | **Dead code.** Frontend: `CatalogInstructionsDialog` (whole component); `bulkCheckin`, `bulkCheckout`, `getEventReport`, `deleteEventReport`, `useReturnOrder`, `expandFactionOrderComponents`, `isRequestTimeoutError`, `getStorageLocation`/`updateStorageLocation`/`deleteStorageLocation`, `getAssemblies`, `getInventoryAccess`, `namingOptions`; deps `@openobserve/browser-logs`, `@openobserve/browser-rum`, `eslint-plugin-react-compiler`. Backend: `EtagResponseFilter.knownEtags` + empty request filter; `CatalogResponseCache.locations()` (unused); the misleading "cache" class name for `events()`; the public mutable `ActorService.privateMutationDepth`. Config: `MEDIA_PUBLIC_BASE_URL` (no consumer). | Delete. | ☑ |

---

## Suggested order

1. #1, #2, #4, #5: identity binding and role source (small config/code changes; recreate the DB).
2. #8, then #11: stop the refetch storm (largest DB-load win, frontend only).
3. #10: drop the revision triggers.
4. #9: move privacy into query predicates (largest change; removes the most complexity).
5. #3/#24, #6, #7: token lifecycle, media, headers.
6. #12–#14: Caffeine near-cache with Valkey invalidation.
7. #15–#18: domain consolidation (order model, access model, maintenance, availability).
8. #25–#31: frontend library migration and component reuse, done incrementally per page.

---

## Resolution — 5 October 2026

Scope agreed for this bugfix job: fix every defect; for design recommendations implement the bounded parts and defer the migrations (⏸). Changes follow the corrections in the [verification](CODE_REVIEW_2026-10-05_VERIFICATION.md). The database baseline changed: **recreate dev, test and prod databases**.

| # | Status | Change |
|---|---|---|
| 1 | ☑ | `principal-claim=sub`; `app_users` unique by `(issuer, external_subject)`; name/e-mail read from JWT claims, display only. |
| 2 | ☑ | Role and factions come only from token groups (`inventory_faction_<EVENT>_<slug>` → `EVENT:slug`, parsed in `ActorService`). `PATCH /users/{id}` and the editor removed; User management is read-only. Dev auth: `X-Actor-Factions` header. |
| 3 | ◐ | Logout revokes refresh + access token (RFC 7009) before `end_session` and signs out all tabs (`BroadcastChannel`). SSE stream ends at token `exp` (max 1 h). Opt-in `OIDC_REQUIRE_INTROSPECTION` + bounded token cache; otherwise the access-token TTL is the revocation bound (documented). Durable IndexedDB session kept for offline cold start (OFF-02); its refresh token is revoked at logout. Library swap → #24. |
| 4 | ☑ | No `inventory_*` role → 403 (OIDC and dev headers). |
| 5 | ☑ | `ProductionAuthGuard` fails `prod` startup with dev auth enabled or OIDC disabled. Production builds offer no dev login unless `DEV_LOGIN=true` is set explicitly. Anonymous rate-limit key = trusted peer address; `X-Actor-Id` only with dev auth. |
| 6 | ☑ | Sniffed allowlist (WebP/PNG/JPEG/PDF, 415), 10 MB per file (413), `max-body-size` 11 M, 50 pending uploads per user (429), hourly purge of uploads older than 24 h, `Content-Disposition: attachment` for non-images. |
| 7 | ☑ | Entrypoint generates the header snippet: `connect-src` = self + API + OIDC origins, `camera=(self)`; included in every location with own `add_header`. |
| 8 | ☑ | SSE sends `{type: <family>.changed[, resource]}` (no IDs). Client maps it to query domains, coalesces 300 ms, invalidates in place; only `access.changed`/reconnect reset queries holding private data. No full reset on (re)connect; media epoch only on access changes. |
| 9 | ◐ | Denied sets bound as one `uuid[]` (`array_contains`, verified on Hibernate 7.4.9) — no bind-parameter ceiling; media checks walk one resource; privacy filter reports `X-Filtered-Rows` so lists keep paging. Predicate migration deferred until measured. |
| 10 | ☑ | Revision counters sharded (16 rows per table, by backend PID): no single hot row; commit-ordered, rollback-safe tokens kept (outbox replacement was not equivalent). |
| 11 | ◐ | Refetch storm removed by #8 (catalog refetched only on item/stock events, active queries only). Server paging, `ItemPicker` and summary projection deferred. |
| 12 | ◐ | `EtagResponseFilter` deleted; faction ETag derived from the committed revision (304 skips all reads); `CatalogResponseCache` → `CatalogResponses` (`locations()` removed). Further reference/actor caching deferred until measured. |
| 13 | ☑ | Actor lookup already request-memoized and write-on-change (verified). `/auth/me` polling removed: re-read only when a refreshed token arrives (roles live in the token). |
| 14 | ☑ | Caffeine only (`quarkus-redis-cache` removed). Single node: in-memory events and rate limit, no Valkey container; cluster compose keeps Valkey (+ Redis health check). |
| 15–17 | ⏸ | Order-model, access-model and maintenance consolidation: separate design work. |
| 18 | ☑ | Narrowed per verification: one item-level `AvailabilityData.eligible()` used by commands, planning, reports and MCP. |
| 19 | ☑ | ORMs extend `EntityOrm` (`require`, `requireLocked`, `requireLockedFresh`); `PageBounds.of(..).offset()`; `Inputs.blankToNull`. Lock/refresh semantics kept. |
| 20 | ☑ | Dev and test run the Flyway baseline (test: clean at start), Hibernate `validate` everywhere; `DevelopmentRevisionSchema` and `source-revisions.sql` deleted. |
| 21 | ☑ | Role checks moved into services (events, factions, damage, maintenance, deficits, outbox, report definitions, order transitions, batch transactions); duplicates in resources and sync replay removed. |
| 22 | ⏸ | i18n key extraction deferred. |
| 23 | ☑ | Factions seeded in the baseline, unique `(event_type, slug)`; `GET /api/event-types`; frontend and CSV import use API data (offline-cached); hard-coded lists removed. |
| 24–25, 27–28 | ⏸ | Library migrations deferred. |
| 26 | ◐ | Scheduling fixed (#33); persister/mutation-queue migration deferred. |
| 29 | ☑ | Service worker stamped with a build id per deployment; network-first navigations, cache-first hashed assets, same-origin only; stale-chunk reload. |
| 30 | ☑ | TS 6.0.3 for ESLint/editor, TS 7 kept as type checker (`typescript-native`, `bun run typecheck`). Compiler rules from `eslint-plugin-react-hooks` v7; `eslint-plugin-react-compiler` removed. Lint passes. |
| 31 | ◐ | `QrLabelDialog` (4 uses), `DamageReportDialog` (3 uses), close icon on purchasing/stock dialogs. `DataTable`/server-mode grid deferred (needs #11). |
| 32 | ☑ | Availability report applies the contributor-damage hold (regression test). |
| 33 | ☑ | Collection/reference queries use `networkMode: 'offlineFirst'`. |
| 34 | ☑ | See #7. |
| 35 | ☑ | FK indexes, `lower(asset_code)`/`lower(code)` lookups, `pg_trgm` GIN on item name/SKU/category, staged-media indexes (non-unique; no semantic change). |
| 36 | ☑ | `BusinessTime` with `inventory.timezone` (default Europe/Berlin) for all calendar dates, reports and document numbers. |
| 37 | ☑ | 60 s private-query and media timers removed. Outbox dispatches right after a local commit; fallback poll 5 s. |
| 38 | ☑ | `formatMoney`/`formatCents` (`Intl.NumberFormat`). |
| 39 | ☑ | Unused exports/component/deps and `MEDIA_PUBLIC_BASE_URL` removed; `privateMutationDepth` encapsulated (behaviour kept). |

### Found during the work

| Priority | Finding | Fix | Status |
|---|---|---|---|
| P1 | OIDC display name and e-mail were read from identity attributes that bearer tokens never set: every name was the subject. | Read `name`/`preferred_username`/`email` claims. | ☑ |
| P2 | Faction memberships matched faction names (ambiguous across events, free text). | `EVENT:slug` keys; `(event_type, slug)` unique. | ☑ |
| P2 | `DELETE /api/media/{staged}` deleted the object but kept its registry row. | Row removed too. | ☑ |
| P2 | Service worker cached every cross-origin GET (map tiles) cache-first without bound. | Same-origin only. | ☑ |
| P3 | `MemberService.java` was Windows-1252 encoded; custody labels showed `�` instead of `·`. | Re-encoded as UTF-8. | ☑ |
| P3 | With lint restored, 6 `react-refresh/only-export-components` errors. | Helpers moved to `catalogGrid.ts` / `maintenanceSchedules.ts`. | ☑ |
| P3 | `useFactions` swallowed API errors and fell back to hard-coded factions. | Replaced by `useFactionCatalog` (#23). | ☑ |

### Verification

| Check | Result |
|---|---|
| `mvn test-compile` | ✔ |
| Backend unit tests (`ActorServiceRoleTest`, `MediaTypesTest`, `EventStreamResourceTest`, `CatalogResponsesTest`, `MaintenancePolicyTest`, `PrivacyProjectionServiceTest`, `InventoryModelInvariantTest`, `InMemoryRateLimiterTest`, `MediaServiceTest`) | ✔ 26/26 |
| `array_contains` binding probe (Hibernate 7.4.9, H2, 60 000 IDs, one bind parameter) | ✔ (throw-away probe, not committed) |
| `bun run lint` | ✔ |
| `bun test` | ✔ 36/36 |
| `bun run build` (TS 7 type check + Vite) | ✔ |
| `@QuarkusTest` suites (PostgreSQL) | **Not run**: no Docker and no `TEST_DB_URL` here; the configured dev DB is shared and must not be dropped. New/changed API tests (roles, factions, media allowlist, report hold, event types/ETag) are written but unexecuted. |
| Browser/Authentik acceptance (logout revocation, multi-tab, SSE expiry, camera, CSP) | Not run. |
