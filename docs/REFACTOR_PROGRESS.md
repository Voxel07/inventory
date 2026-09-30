# A01–A06 progress

| Finding | Status | Change |
|---|---|---|
| A01 | Implemented | Hide inaccessible assemblies and nested component projections; remove shared assembly cache. |
| A02 | Implemented | Session generations isolate queries/drafts, refreshes, media, requests and offline data. Durable queues/history remain account-owned. |
| A03 | Implemented | Validate asset snapshot version/state/location under item → asset locks; protect custody, reservations and bulk holds. |
| A04 | Implemented | Restore only the unchanged submission marker with unresolved custody; always retain rejection evidence. |
| A05 | Implemented | Share maintenance facts, scope-specific counters and evaluation across live operations, planning, reports and inbox. |
| A06 | Implemented | Share serialized stock classification; expose transit separately and retain owned totals for bulk/serialized transfers. |

Validation: frontend/backend builds, ESLint and whitespace passed; all 87 backend tests (H2) and nine client tests passed. Baseline edited directly for A03/A04.

Earlier suite failures resolved: typed planning UUID results and the canonical `due` maintenance assertion.

Pending: PostgreSQL baseline initialization and browser acceptance.
