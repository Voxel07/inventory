# Performance acceptance

These are acceptance targets, not measured production claims. Use the current disposable baseline and record application version, PostgreSQL version, dataset, machine, pool size and concurrency with every run. Initial reference machine: 4 dedicated vCPUs, 8 GiB RAM, local SSD, PostgreSQL and one API node; no Redis requirement.

| Workload | Target |
|---|---|
| 10,000 items / 100,000 movements; 20% private resources and location grants; 10 concurrent readers | Catalog/history page p95 ≤500 ms, p99 ≤1 s; correct scoping and continuation |
| 100,000 items / 1,000,000 movements; 30 concurrent readers | Page p95 ≤1 s, p99 ≤2 s; no application allocation proportional to the entire history for a page |
| Warm report, 25,000 snapshot rows (default budget); five independent filters | p95 ≤1 s; ≤200 authorization candidates per batch and ≤200 output rows; no full report entity hydration |
| Cold asynchronous report rebuild within configured source/output budgets | ≤15 s; one rebuild per report, no duplicate generation; peak report-worker RSS increase ≤512 MiB |
| Summary / inbox at the first dataset, five concurrent callers | p95 ≤2 s / ≤1 s; report SQL/CPU/allocations and pool wait separately |
| Two overlapping storage edits, structure ≤1,000 nodes / ≤16 total levels including the root | No corrupt paths/grants; second editor settles or conflicts within 5 s; no all-location row lock/load |
| Explicit offline catalog download, 10,000 records per main catalog maximum | Foreground page p95 ≤1 s; serial downloads share the account rate budget; quota/network failure shows partial state |
| Pool pressure | No acquisition timeout; waiting p95 ≤100 ms; steady-state RSS returns within 15% of pre-run after GC |

Summary and MCP alert reads deliberately scan the visible catalog in batches of 500 and aggregate history facts; they are not page-local calculations. Inbox cost grows with open tasks, custody and schedules. Report reads enqueue rebuilds and retain the previous generation. Report-worker source/output budgets default to 25,000 rows; oversized generations fail without replacement. Authorized report paging/totals stream bounded candidate batches and can scan the generation; measure this work separately from returned rows. Rebuilds and reads require fresh acceptance after modularization; historical SQL observations below do not establish their performance. Location structure input is bounded, but moving a large existing subtree still refreshes descendants under one hierarchy transaction fence. Sharing directories, event types/factions, recipient worklists and some single-resource child collections are explicit complete reads; the universal paging claim does not apply to them.

Use `scripts/performance-acceptance.py --base-url ... --path '/api/items?page=0&size=100' --requests 200 --concurrency 10` against a prepared acceptance dataset. A token comes from the named environment variable, never the command line/output. The runner is read-only and saves request counts, errors, p50/p95/p99 and machine-readable observations. Run private/grantee/denied readers separately. Correlate with SQL statistics, OTEL pool wait, process RSS and outbox lag; the HTTP runner alone cannot certify memory, correctness or contention targets. Use the existing PostgreSQL query regression suite for constant-query assertions and explicit privacy scenarios.

Record real results in [validation evidence](VALIDATION_2026_10_20.md). Larger-data, device and deployment acceptance stay pending until actually executed.

## Measured movement SQL — 20 October 2026

A separate disposable PostgreSQL 18.6 database held 10,000 items, 100,000 movements, 20% private items and 250 directly granted private items. It had one public site/section and no orders, damage cases, inherited/group grants or reservations. Docker reported 24 CPUs and 16,724,451,328 bytes memory; this is larger than the reference machine above. Warm-cache `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` measured identifier-only SQL, excluding HTTP, ORM eager hydration, mapping, client process startup and exports. Both paths returned 100 rows; the optimized predicate's total visible count was verified as 82,500.

| Scoped movement SQL | First page p50 / p95, ms (30 samples, 10 readers) | Offset 50,000 median / max, ms (3 sequential samples) |
|---|---|---|
| Recursive per-row resource function | 38.30 / 42.90 | 18,704.46 / 19,291.55 |
| Inline item/location predicates; shared order/damage checks | 5.26 / 7.95 | 1,027.85 / 1,062.78 |

Both measured variants enforce full movement relationship privacy. The pre-follow-up reader scoped only the item and is excluded from this comparison.

The movement reader now inlines item/location policy checks before paging and uses the shared resource function for present order/damage references. This preserves hidden-relationship filtering while avoiding recursive movement re-reads for simple histories. Deep offsets still scan many candidates; these figures do not establish an API latency SLA, larger-topology capacity or a general improvement for every resource.

Other operational readers and JSON report projections still evaluate resource visibility functions per candidate row. The previous global denied-ID scan is gone, but broad performance acceptance remains open. Measure candidate/returned rows, function/relationship work, EXPLAIN buffers, HTTP latency, CPU/RSS and pool wait under the complete workloads above. REV-28 records measured movement SQL separately from this remaining acceptance.

Retained local fixture, plans and result JSON: `backend/target/review-followup-performance/`. The fixture and probes are reproducible from the retained `fixture.sql`, `measure.py` and `measure-optimized.py`; they run only against the named disposable database.

A portable fixture is checked in at [visibility-benchmark.sql](../tests/fixtures/visibility-benchmark.sql), and the read-only probe at [visibility_benchmark.py](../tests/tools/visibility_benchmark.py). Initialize a fresh disposable database with the canonical baseline and that fixture. Run the probe once with `--mode recursive`, then with `--mode inline`; supply `--container`, `--database`, `--user` and a separate `--output` directory for each. Defaults are 30 first-page samples / 10 readers and three sequential deep-page samples. The checked-in harness also passed a one-sample smoke run against the fixture.
