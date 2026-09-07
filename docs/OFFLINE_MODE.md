# Offline operation & sync

The app is a PWA: the shell is cached by the service worker and the catalog is
kept in IndexedDB. This page documents exactly what works without a connection
and how the queue replays.

## The boundary (what is offline-capable)

**Reads (cached, read-only):**

- Items, assemblies, storage locations, and events are precached on sign-in and
  refreshed opportunistically. On network failure, list and detail reads fall
  back to the cached catalog.

**Writes (queued in IndexedDB, replayed via `/api/sync`):**

| Operation | Offline action type |
| --- | --- |
| Stock transaction (checkout/checkin) | `transaction` |
| Damage report | `damage.create` |
| Order status transition (submit/prepare/ready/pickup/cancel/reopen) | `order.transition` |
| Save preparation quantities | `order.prepare` |
| Record return (partial/full) | `order.return` |

**Not offline-capable (deliberate):**

- Creating or editing items, assemblies, storage locations, users, events, and
  general orders requires a connection. Catalog maintenance is an HQ-side task
  and is intentionally excluded from the queue to avoid unresolvable conflicts.
- The initial sign-in requires a connection, but the OIDC session is mirrored to
  IndexedDB, so a PWA cold start restores the session and can work offline
  (cached reads + queued writes) without re-authenticating.

## Queue semantics

1. Each offline action is appended with a client-generated **UUID idempotency key**
   and a local timestamp.
2. The header shows **"Offline — N queued"** while actions wait.
3. When connectivity returns, the queue posts to `/api/sync`. The server applies
   each action idempotently, so replays never double-book stock.
4. Flush failures are retried with exponential backoff (2s → 60s) and
   rescheduled automatically.

## Sync conflicts

The server returns `applied`, `conflict`, or `rejected` per action.

- `applied` actions are removed from the queue.
- `conflict`/`rejected` actions are moved to a **sync-issues** list and surfaced
  in the header. Common conflicts are stock that was reserved by another order
  while offline, or a state transition that is no longer valid.

The header chip opens a dialog where each issue can be reviewed and **discarded**
after resolving it manually (e.g. adjusting the order online).

## Known limits

- The cached catalog has no version stamp; a device offline for a long time may
  scan against stale data. Reconnect and re-sign-in to refresh.
- Conflicting actions are surfaced for manual resolution, not auto-reconciled.
