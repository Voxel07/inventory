# ASH Inventory

Responsive inventory and custody management for event logistics. The repository contains the React PWA and its transactional Quarkus/PostgreSQL backend.

## Current state — 30 September 2026

F01–F23 are present: catalog, event planning/results, purchasing/receiving, stock movement/counting, orders/custody, maintenance, offline recovery, reports, ownership/commitments, member self-service, reminders, scanning and borrowing/rental. Runtime and desktop/mobile acceptance remain pending. Earlier F19 build/test results apply to that revision only.

Start with the [architecture overview](docs/ARCHITECTURE.md) for product requirements, technical requirements, app flow, styling and data storage. The [implementation plan and progress](docs/IMPLEMENTATION_PLAN.md) records source-confirmed gaps, target refactors and pending acceptance.

## Development

Frontend (Bun):

```bash
bun install
bun run dev
bun run build
```

Backend (Java 25):

```bash
cd backend
mvn quarkus:dev
```

Every profile (dev, test, prod) creates the schema from the single Flyway baseline `V1.0.0__init.sql`; Hibernate only validates it. Data is disposable: after a baseline change, recreate the database. Tests recreate the `TEST_DB_URL` database on every start. Architecture and schema rules: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Copy `.env.example` to `.env`, set the public API, frontend, and Authentik URLs and a unique `DB_PASSWORD` (required, no default), then run the complete stack with `docker compose up --build`. Runtime settings are written to a separate `config.js`; compiled frontend bundles are not modified. The SPA uses OIDC Authorization Code + PKCE and Quarkus validates its bearer access tokens. For local development without Authentik, use the development overrides documented at the bottom of `.env.example`.

The Authentik OAuth2/OIDC provider must use client type **Public**, because the React application cannot securely hold a client secret. Its Client ID must match `OIDC_CLIENT_ID`, and its redirect URI must exactly match `VITE_OIDC_REDIRECT_URI`. A confidential provider will complete the browser redirect but reject the subsequent token exchange with `invalid_client`. Enable the `offline_access` scope mapping when refresh tokens are required, keep the access-token lifetime short (≤ 5 minutes) and enable refresh-token rotation: the API validates JWTs locally, so the access-token lifetime bounds how long a revoked token is still accepted (or set `OIDC_REQUIRE_INTROSPECTION=true`).

The sign-out button revokes the refresh and access tokens at the provider's `revocation_endpoint`, signs out every open tab, and then redirects to the provider's `end_session_endpoint` from OIDC discovery, including the ID token and configured redirect URI. To make this RP-initiated logout also end the user's main Authentik SSO session, configure the provider's invalidation flow with a **User Logout** stage. In Authentik, open **Flows and Stages → Flows → default-provider-invalidation-flow → Stage Bindings**, bind the existing `default-invalidation-logout` stage, and assign that flow to the provider. Without this Authentik setting, its default behavior ends only the Inventory application session.

Authentik only decides who may use the inventory: members of the group `inventory` (`INVENTORY_ACCESS_GROUP`) can sign in; everyone else gets 403. Roles (`tenant`, `read_only`, `faction_leader`, `ash`, `warehouse_crew`, `admin`) and faction memberships are set in the app on the **Users** page by the inventory admin. New users start as read only; `INVENTORY_BOOTSTRAP_ADMINS` (e-mails or usernames) names the first admins. Users may have multiple assigned roles; the highest role in the ladder determines access. Accounts are bound to the token's issuer and immutable `sub`, never to the username. The permission matrix, role combinations and the sharing scenarios are described in [Authentik setup §3](docs/AUTHENTIK_SETUP.md#3-access-and-roles).

## Sample inventory import

Import [`sample_stock.csv`](sample_imports/sample_stock.csv) through **My dashboard → Items → CSV import → Combined**, using an administrator account and automatic location creation for the complete fixture. The combined file contains 340 items, 50 assemblies, 14 event occurrences, 16 faction orders, 14 returns, 3 standalone checkouts, 5 general orders and 209 operations. It includes historical LightSim stock movements and repairs, DE and TNO reports, a planned LightSim 2027 event, ready pickups, overdue custody, a pending return acknowledgement, a partially received purchase, an expiring lot, maintenance warnings, private/external commitments, borrowing and rental arrangements, transfers, a blind count and member requests. The six `Demo-` items keep the operational scenarios separate from the original inventory.

Combined CSV checkout rows use `Typ=Ausleihe`, `Name`, `Menge`, `Eventtyp`, and `Fraktion`; serialized items may also specify `AssetCodes` (one code per unit). General-order rows use `Typ=Allgemeine Bestellung`, `Zweck`, `Bestellte Artikel`, `Bestellstatus`, and optionally `Rückgabeartikel` / `Verbrauchte Artikel`. Preparation runs before marking orders ready, including exact serialized asset assignments.

Event rows include `Name`, `Eventtyp`, `Eventdatum`, optional `Startdatum` / `Enddatum` (YYYY-MM-DD), and JSON arrays in `Teilnehmer` / `Zeitplan` (English headers: `attendees` / `timeline`). `Startdatum` is the first event day and takes precedence over `Eventdatum` when both are set; `Enddatum` defaults to the start date. The sample has six fictional attendees and four timeline entries for each of its 14 events, including preparation and in-game activities. Item and assembly previews search all rows and show the first 50 matches plus every error row; action previews scroll within a fixed-height table.

An attendee uses `personName`, optional `arrivesAt`, `leavesAt`, `foodStampsIssued` (boolean), `notes`, and a nonempty `roles` array. Each role uses `role` (`faction_leader`, `faction_deputy`, `faction_hq_crew`, `as_held`, or `event_crew`); faction roles require `faction` containing a faction name of that event type, and event crew may set `assignment`. A timeline entry uses `category` (`preparation` / `in_game`), `title`, `startsAt`, optional `endsAt`, `owner`, `location`, `description`, and `status` (`planned`, `in_progress`, or `completed`; defaults to `planned`). Times use local event wall-clock values such as `2027-06-12T09:00`, without a timezone. CSV-quote JSON cells and double their internal quotes, as in the downloadable combined template. Invalid lists, roles, dates, or reversed ranges mark the event row as an error before import. Retries reuse people by name, preserve linked accounts, update attendances by person, and update timeline entries by category/title/start time; records absent from the CSV are retained. Ambiguous person names require correction before import can finish.

Operational rows use `Typ=Aktion`, a unique `Name`, an `Aktion` command, and a JSON object in `Daten`. Supported commands are `stock`, `damage`, `repair`, `repair_transition`, `lot`, `maintenance`, `purchase`, `receipt`, `equipment`, `commitment`, `loan`, `loan_collect`, `transfer`, `count`, `member_request`, and `member_return`. After items, assets and events, import applies a leading dated stock/repair history before orders and checkouts to establish their stock balances. It then runs the remaining actions in file order; named action outputs are shared across both phases. References such as `@item:Demo-Klapptisch`, `@location:Palettenlager`, `@event:LS:2027-06-12`, and `@row:Demo Zusage Leihzelt` resolve to the imported records; row references must point to an earlier action. `@date:+14` and `@datetime:-7` resolve relative to the local import date, keeping lot and maintenance warnings reproducible. Member requests and return submissions belong to the importing user; reminders can then be scheduled from the action inbox.

The combined fixture includes six stock-history LightSim events and 190 historical operations dated from January 2021 through September 2026. GPS trackers, radios, RGB floodlights, field PCs, network cables and small Hesco barriers have opening balances, annual stock increases, checkouts and returns, six completed repairs, six write-offs and three outstanding damage reports. These six items start at zero in the catalog rows; dated opening operations recreate their baseline quantities. Shared catalog items appear once, with the stock fixture quantities retained. Import into an empty database for reproducible opening balances.

Stock-history commands use these JSON fields in `Daten`:

| Command | Required fields | Behavior |
| --- | --- | --- |
| `stock` | `itemId`, `transactionType`, `quantityChanged`, `reason` | `adjusted` adds stock; `checkout` and `checkin` record custody movements. Checkout also requires `eventType` and `faction`. |
| `damage` | `itemId`, `amount`, `description`, `severity` | Records damaged stock; serialized items require `assetInstanceId`. |
| `repair` | `damageReportId` | Creates or reuses the repair for a damage report, usually referenced by `@row:<damage action name>`. |
| `repair_transition` | `repairId`, `status` | Moves through `triaged → awaiting_repair → in_repair → repaired → verified → returned_to_service`, or to `written_off` before verification. `repaired` and `written_off` require `amount`; `verified` requires `verificationResult`. |

Each of these commands accepts optional `occurredAt`, an ISO timestamp with a timezone such as `2023-06-10T10:00:00Z`. Historical dates require administrator permissions, cannot be in the future, and repair dates cannot precede the related damage or recorded repair activity. The date is stored on stock transactions, damage/repair creation, and repair start/completion; repaired and written-off ledger entries use the transition date. Server audit updates retain the import time. Omitting the field records the current time. Stock/damage commands have stable idempotency keys, repair creation reuses the damage's case, and repeated imports skip repair stages already completed. Quantities must be positive integers; write-offs always use the repair workflow.

On a fresh import, the six history items finish with these balances (all historical checkouts are returned):

| Item | Owned | Damaged | Available |
| --- | ---: | ---: | ---: |
| GPS-Feldtracker | 54 | 2 | 52 |
| Handfunkgerät | 47 | 1 | 46 |
| LED-Flutlicht RGB 20W | 29 | 1 | 28 |
| Feld-PC Intel | 9 | 0 | 9 |
| Patchkabel Cat.6 RJ45 20m | 35 | 0 | 35 |
| Hesco-Barriere klein (1x1m) | 75 | 0 | 75 |

On **Maintenance**, set a category's interval in days to schedule its items. An interval of `0` disables scheduled maintenance for that category. Existing items inherit the setting immediately, and newly created items inherit it when saved.

## PostgreSQL schema and API

OpenAPI, Swagger UI, and health endpoints are available at `/q/openapi`, `/q/swagger-ui`, and `/q/health`. Flyway applies the single editable `V1.0.0__init.sql` baseline; Hibernate validates it. Recreate disposable databases after schema changes.

Roles are enforced by the backend services (shared by REST, MCP and offline replay) using the six roles listed above. Every organization member reads all order lists; faction leaders change only the lists of the factions the admin assigned to them; inventory lifecycle actions remain warehouse-only.

The backend exposes explicit workflow APIs rather than generic entity CRUD:

- stock master data: `/api/warehouses`, `/api/storage-locations`, `/api/inventory-lots`, and `/api/inventory-positions`
- purchasing: `/api/vendors`, `/api/purchase-orders`, `/api/goods-receipts`, and `/api/vendor-documents`
- controlled movements: `/api/transfers` and `/api/inventory-counts`
- lifecycle and custody: `/api/maintenance-schedules`, `/api/repairs`, and the nested order handover/reconciliation resources
- operations: `/api/sync/audit` and the administrator-only outbox status, dead-letter, and retry resources

## Deployment

- [Authentik setup](docs/AUTHENTIK_SETUP.md)
- [Step 1 — Single VPS + S3/backup storage node](docs/DEPLOYMENT_STEP1.md)
- [Step 2 — Multi-node API (shared database)](docs/DEPLOYMENT_STEP2.md)
- [Observability (OpenObserve)](docs/TECHNICAL_REQUIREMENTS.md#7-observability)

## Offline field operation

The production build installs as a PWA. The service worker caches the shell; IndexedDB stores account-scoped catalog reads and supported stock/faction-order/damage commands with UUID idempotency keys. The queue replays through `/api/sync` after connectivity returns and its status is shown in the header. Other mutations require connectivity.

The exact online/offline boundary, queue semantics, and conflict handling are documented in [`docs/OFFLINE_MODE.md`](docs/OFFLINE_MODE.md).

## Internationalization

Localization runs on [i18next](https://www.i18next.com/) with German (`de`) and
English (`en`) catalogs in [`src/i18n`](src/i18n). Shared copy uses the
key-based `useT()` hook from `src/utils/naming` (e.g.
`t('header.queuedActions', { count })`), which supports interpolation and
pluralization. Context-specific bilingual copy uses `useLocalizedText()`.

## Faction order workflow

Open **Events → Faction lists** to create a dated list for a faction. Individual items and assemblies can be selected; both are filtered by their event tags. A draft can copy the previous list and display changes. Its lifecycle is:

```text
draft → submitted → preparing → ready → picked up → partially returned/returned → closed
```

Prepared quantities reserve available stock from other open lists. Assembly quantities are normalized into component lines. Pickup and return run atomically under row locks, incomplete components retain customer custody, and the append-only order ledger records server time, actor, status, and line deltas.
