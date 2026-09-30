# Offline operation and sync

Updated 1 October 2026 against `offlineQueue.ts`, `resourceFactory.ts`, `apiClient.ts`, `SyncResource` and the header/status/conflict UI.

## Supported scope

The PWA service worker caches the application shell. IndexedDB stores account-scoped catalog reads and a durable command queue. Items, assemblies, storage locations and events can fall back to saved query-specific results on eligible network/server failures. Cache timestamps indicate the last successful download; cached quantities are not a current availability promise.

Current limitation: collection hooks still use the default online query scheduling, so a cold offline start can pause before their service-level IndexedDB fallback runs. Warm in-memory lists can conceal this. Exact item detail queries explicitly allow a first offline attempt; collection scheduling remains R04 in the [current review](REPOSITORY_REVIEW.md).

Item details are cached by exact item identity within the account/role/faction namespace. Online detail reads, downloaded list pages (including later and filtered pages), and successful create/update responses populate these entries. A downloaded item can be opened offline even if its detail was never visited; an item never downloaded has no fallback. Query-specific lists remain separate and are not assumed complete. Online 403/404 or successful deletion removes the exact item entry. Offline detail queries run their first attempt so IndexedDB fallback can be reached; fallback timestamps remain the original download time. Item pages cache themselves instead of a separate page-zero reconnect precache.

| Queued write | Server action |
|---|---|
| Individual stock transaction | `transaction` |
| Damage report without a new media upload | `damage.create` |
| Faction-order creation | `order.create` |
| Faction-order status transition | `order.transition` |
| Faction-order preparation | `order.prepare` |
| Faction-order reconciliation | `order.return` |

Catalog mutations, general orders, contributor requests/returns, photos/media, assembly batch checkout, ownership/commitments, loans, label management, purchasing/receiving, transfers, counts, lots, repair/maintenance, reminders and report rebuilds require connectivity. Their forms are not durable offline drafts.

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

Current account switching, cold starts, replay/correction concurrency and browser IndexedDB behavior still require interactive acceptance. Source/static checks alone do not establish field resilience. No browser storage was changed during cleanup.
