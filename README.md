# ASH Inventory

Responsive inventory and custody management for event logistics. The repository contains the React PWA and its transactional Quarkus/PostgreSQL backend.

## Current state — 30 September 2026

F01–F23 are present: catalog, event planning/results, purchasing/receiving, stock movement/counting, orders/custody, maintenance, offline recovery, reports, ownership/commitments, member self-service, reminders, scanning and borrowing/rental. Runtime and desktop/mobile acceptance remain pending. Earlier F19 build/test results apply to that revision only.

See the [repository review and refactoring plan](docs/REPOSITORY_REVIEW.md) for feature ownership, operational semantics, source-confirmed defects, consolidation status and remaining acceptance work.

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
mvn -Ddev quarkus:dev
```

Development currently uses PostgreSQL and Hibernate schema update. H2 is configured for tests. Production uses the single Flyway baseline with Hibernate validation; schema ownership is documented in
[`REQUIREMENTS_ARCHITECTURE.md`](REQUIREMENTS_ARCHITECTURE.md#9-persistence-and-schema-state).

Copy `.env.example` to `.env`, set the public API, frontend, and Authentik URLs, then run the complete stack with `docker compose up --build`. Runtime settings are written to a separate `config.js`; compiled frontend bundles are not modified. The SPA uses OIDC Authorization Code + PKCE and Quarkus validates its bearer access tokens. For local development without Authentik, use the development overrides documented at the bottom of `.env.example`.

The Authentik OAuth2/OIDC provider must use client type **Public**, because the React application cannot securely hold a client secret. Its Client ID must match `OIDC_CLIENT_ID`, and its redirect URI must exactly match `VITE_OIDC_REDIRECT_URI`. A confidential provider will complete the browser redirect but reject the subsequent token exchange with `invalid_client`. Enable the `offline_access` scope mapping when refresh tokens are required.

The sign-out button redirects to the provider's `end_session_endpoint` from OIDC discovery, including the ID token and configured redirect URI. To make this RP-initiated logout also end the user's main Authentik SSO session, configure the provider's invalidation flow with a **User Logout** stage. In Authentik, open **Flows and Stages → Flows → default-provider-invalidation-flow → Stage Bindings**, bind the existing `default-invalidation-logout` stage, and assign that flow to the provider. Without this Authentik setting, its default behavior ends only the Inventory application session.

Authentik supplies application roles through its `groups` claim. Use these namespaced group names so they cannot be confused with roles belonging to another application:

| Authentik group | Inventory role |
| --- | --- |
| `inventory_hq_admin` | `hq_admin` |
| `inventory_warehouse_crew` | `warehouse_crew` |
| `inventory_marshal` | `marshal` |
| `inventory_event_planner` | `event_planner` |
| `inventory_maintenance_crew` | `maintenance_crew` |
| `inventory_faction_leader` | `faction_leader` |
| `inventory_read_only` | `read_only` |

The Authentik group is authoritative at sign-in; the corresponding internal role is stored in `app_users`. A token without a recognized inventory group receives the least-privileged `faction_leader` role.

## Sample inventory import

Import [`sample_stock.csv`](sample_imports/sample_stock.csv) through **My dashboard → Items → CSV import → Combined**, using an administrator account and automatic location creation for the complete fixture. The combined file contains 340 items, 50 assemblies, 14 event occurrences, 16 faction orders, 14 returns, 3 standalone checkouts, 5 general orders and 209 operations. It includes historical LightSim stock movements and repairs, DE and TNO reports, a planned LightSim 2027 event, ready pickups, overdue custody, a pending return acknowledgement, a partially received purchase, an expiring lot, maintenance warnings, private/external commitments, borrowing and rental arrangements, transfers, a blind count and member requests. The six `Demo-` items keep the operational scenarios separate from the original inventory.

Combined CSV checkout rows use `Typ=Ausleihe`, `Name`, `Menge`, `Eventtyp`, and `Fraktion`; serialized items may also specify `AssetCodes` (one code per unit). General-order rows use `Typ=Allgemeine Bestellung`, `Zweck`, `Bestellte Artikel`, `Bestellstatus`, and optionally `Rückgabeartikel` / `Verbrauchte Artikel`. Preparation runs before marking orders ready, including exact serialized asset assignments.

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

OpenAPI, Swagger UI, and health endpoints are available at `/q/openapi`, `/q/swagger-ui`, and `/q/health`. Production initializes an empty database from the single `V1.0.0__init.sql` baseline and Hibernate validates it. Data is disposable: edit the baseline/entities directly and recreate databases after schema changes. Incremental migrations and legacy baselining procedures are removed.

Roles are enforced by the backend using the seven canonical values listed above. Faction leaders can only access assigned factions; inventory lifecycle actions remain crew-only.

The backend exposes explicit workflow APIs rather than generic entity CRUD:

- stock master data: `/api/warehouses`, `/api/storage-locations`, `/api/inventory-codes`, `/api/inventory-lots`, and `/api/inventory-positions`
- purchasing: `/api/vendors`, `/api/purchase-orders`, `/api/goods-receipts`, and `/api/vendor-documents`
- controlled movements: `/api/transfers` and `/api/inventory-counts`
- lifecycle and custody: `/api/maintenance-schedules`, `/api/repairs`, and the nested order handover/reconciliation resources
- operations: `/api/sync/audit` and the administrator-only outbox status, dead-letter, and retry resources

## Deployment

- [Step 1 — Single VPS + S3/backup storage node](docs/DEPLOYMENT_STEP1.md)
- [Step 2 — Multi-node HA](docs/DEPLOYMENT_STEP2.md)

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
