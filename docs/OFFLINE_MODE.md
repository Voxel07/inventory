# Offline operation and sync

Source: `offlineQueue.ts`, `resourceFactory.ts`, `usePagedList.ts`, `useResourceApi.ts`, `referenceDataService.ts`, `apiClient.ts`, `SyncResource` and the header/status/conflict UI. See [App Flow](APP_FLOW.md) for journeys and [Implementation Plan](IMPLEMENTATION_PLAN.md) for acceptance status.

## Supported scope

The PWA service worker caches the application shell. Its cache is versioned per build; navigations are network-first (the cached shell serves offline starts), hashed bundles cache-first, and it never caches `/api` or third-party resources. IndexedDB stores account-scoped catalog reads and a durable command queue. Items, assemblies, storage locations and events can fall back to saved query-specific results on eligible network/server failures. Cache timestamps indicate the last successful download; cached quantities are not a current availability promise.

Collection, detail and reference query readers now use `networkMode: 'offlineFirst'`, allowing a cold offline start to reach service-level IndexedDB fallback. Lists load further server pages only on demand (`usePagedList`, [PLAN-03](IMPLEMENTATION_PLAN.md)); offline, only pages downloaded earlier are available. Actual cold-start/device acceptance remains [ACC-02](IMPLEMENTATION_PLAN.md). Private projections are excluded from durable catalog caching, and all private-resource writes remain online-only.

Faction-order details are cached per order and account after an online read. A user who opened an order can reopen it offline and queue preparation, transitions and reconciliation; preparation is built from that snapshot and the server revalidates stock, assets and status on replay. General orders can be created offline; their detail has no offline cache, so preparation, transitions and reconciliation of a general order queue only from a screen that is already open. Order lists and orders never opened online have no offline fallback.

Item details are cached by exact item identity within the account/role/faction namespace. Online detail reads, downloaded list pages (including later and filtered pages), and successful create/update responses populate these entries. A downloaded item can be opened offline even if its detail was never visited; an item never downloaded has no fallback. Query-specific lists remain separate and are not assumed complete. Online 403/404 or successful deletion removes the exact item entry. Offline detail queries run their first attempt so IndexedDB fallback can be reached; fallback timestamps remain the original download time. Item pages cache themselves instead of a separate page-zero reconnect precache.

| Queued write | Server action |
|---|---|
| Individual stock transaction | `transaction` |
| Damage report without a new media upload | `damage.create` |
| Faction- or general-order creation (`kind` in the payload) | `order.create` |
| Order status transition (either kind) | `order.transition` |
| Order preparation (either kind) | `order.prepare` |
| Order reconciliation (either kind) | `order.return` |
| Blind count / recount submission | `count.submit`, `count.recount` |
| Transfer receipt | `transfer.receive` |
| Warehouse return acceptance | `return.accept` |
| Photo-free personal return | `member.return` |

Catalog mutations, general-order edits, contributor requests, photo-backed returns, photos/media, assembly batch checkout, ownership/commitments, loans, label management, purchasing/receiving, transfer creation/dispatch, count creation/start/approval/posting, lots, repair/maintenance, reminders and report rebuilds require connectivity. Their forms are not durable offline drafts.

Initial sign-in requires connectivity. A persisted authenticated session supports cached use; switching accounts scopes commands and catalog access to the signed-in account. Unowned commands are not replayed. Legacy migration/export support has been removed; current storage has one account-scoped format.

## Command lifecycle

1. Supported writes receive a UUID command key, owner, payload and local timestamp.
2. Queued success means saved on the device; it does not confirm stock or server acceptance.
3. Reconnection posts batches to `/api/sync`, with retry/backoff for transport failures.
4. Each server command validates authorization and transactional state. Its stock change and applied audit evidence commit together; idempotent replay returns recorded results.
5. Applied entries leave the queue and remain in local history. Conflict/rejection entries appear in the sync-issues UI with retained evidence.

## Review and correction

Use the header Sync/Offline panel for queue state, cache freshness, local command history and personal server audit. Open a sync issue to inspect current server context. A correction requires connectivity, edited payload, a resolution note and a new command ID linked to the failed command. Original terminal evidence remains immutable, and only one correction chain may apply. Archiving a failure retains history; it does not undo any server command.

The server remains authoritative. Cached data and pending commands never bypass availability, asset identity, role/scope or lifecycle checks. Report snapshots, uploaded media and new online-only workflows are outside the offline command protocol.

## Verification limits

Current account switching, cold starts, replay/correction concurrency and browser IndexedDB behavior still require interactive acceptance.

## Explicit catalog download

Sign-in and reconnection do not download the whole catalog. **Save catalog** starts one sequential download per account generation, at most 100 pages of 100 records per main catalog. It includes public item, assembly, location and event projections plus factions/event types; private projections stay excluded. Public rows in a mixed page retain the original continuation without storing private rows. The panel shows downloading, complete or partial state, failed catalog names and completion time; durable storage/network failures cannot report success. Account changes cancel publication into the old scope. This is not an atomic database snapshot across all six catalogs.

Only supported field forms already loaded online can queue counts, transfer receipts and acceptance. No count/transfer workspace is automatically downloaded, and these forms are not durable drafts. Online and queued field actions use the same `/api/sync` audit IDs. Saved public item SKUs/UUIDs can resolve offline without a server request; plain asset/order-code lookup still requires connectivity. Encoded URLs remain direct navigation.
