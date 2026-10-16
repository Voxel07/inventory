# Local Docker memory comparison — 16 October 2026

Completed eight backend runs with **90,113 measured requests and zero workload errors**. Native reduces idle RAM, but default native GC did not reduce peak RAM under load. A free-heap retention experiment saved RAM at a substantial throughput cost. **Superseded by the re-run below:** an explicit native heap/young-generation size keeps ~97% of throughput at ~380 MiB peak. Raw evidence is in `backend/target/native-memory-benchmark/` (ignored by Git).

## Re-run and heap-sizing follow-up — 16 October 2026 (evening)

21 more runs, **270,657 measured requests, zero workload errors**, same harness, images and fixtures. Two rounds per variant in reversed order; a 60 s post-load idle phase was added (`--cooldown 60`). Capped variants also run under a hard `docker --memory` limit. Original evidence copied to `backend/target/native-memory-benchmark-original/`; new results in `results-rerun.json`, `results-capped.json`, `results-young.json`, `results-capped-512m.json` and `summary-rerun.csv`.

| Variant | Container limit | Idle | Loaded peak | Idle 60 s after load | Requests/s | p95 ms | p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JVM, defaults | none | 476–478 | 857–1,436 | 797–855 | 226–243 | 114–124 | 176–187 |
| JVM `-Xmx256m` (G1) | 768m | 417–438 | 522–526 | 521–525 | 207–238 | 117–168 | 182–193 |
| JVM `-Xmx256m` Serial | 768m | 420–422 | 549–560 | 547–559 | 220–238 | 117–138 | 178–187 |
| Native, defaults (4 runs) | none | 154–168 | 891–1,115 | 487–814 | 218–225 | 125–145 | 173–182 |
| Native-micro, defaults | none | 109–160 | 1,054–1,156 | 600–854 | 221–224 | 134–140 | 178–180 |
| **Native `-Xmx512m -Xmn256m`** | 768m | 153–161 | **379–385** | 339–354 | **219** | 153–154 | 180–181 |
| Native `-Xmx256m -Xmn128m` | 512m | 155–162 | 255–284 | 234–262 | 202–205 | 158–161 | 188–193 |
| Native `-Xmx256m` | 512m | 109–161 | 206–219 | 161–176 | 186–198 | 165–173 | 194–205 |
| Native `-Xmx128m` | 384m | 131–133 | 171–175 | 123–133 | 182 | 177–180 | 202–211 |

Working set in MiB. Throughput is ~10% higher across the board than the first session (host load); compare within this table only.

Verification of the original findings:

- **Confirmed:** native idles at ~110–170 MiB vs ~480 MiB for the JVM; default native has no loaded-peak advantage; throughput is equivalent; micro is the same binary with no runtime difference; native readiness 0.7 s vs ~4 s.
- **Confirmed and explained:** the API is pinned at exactly 2.00 CPU cores in every run, so the load is CPU-bound. The ~1 GiB peaks are not demand; with no limit both runtimes simply grow their heap (unconstrained JVM reached 1,436 MiB). The JVM never returns it while idle; native returns part of it, inconsistently.
- **Revised:** "retain default ergonomics" was based only on `MaxHeapFree`. Capping native's heap alone (`-Xmx256m`/`-Xmx128m`) costs 10–18% throughput because Serial GC's young generation scales with `-Xmx`, causing frequent collections. Sizing the young generation explicitly (`-Xmx512m -Xmn256m`) keeps 219 req/s against 220–225 for default native in the same session (−1–3%), p99 unchanged, p95 +10–30 ms, at **~60% lower peak RAM**.
- **New:** a 256 MiB JVM heap costs no throughput but the JVM still needs ~270–300 MiB off-heap (direct buffers, metaspace, code cache): the Serial-GC JVM with `-Xmx256m` was **OOM-killed under a 512m limit**. The JVM's practical floor for this load is ~550 MiB.
- **New:** unconstrained defaults are the main risk on a shared VPS. Always set an explicit heap and a container `mem_limit`.
- Postgres used ~90 MiB working set after load (231 MiB lifetime peak incl. cache); the frontend Nginx ~30 MiB.

## Valkey vs in-process backends — 16 October 2026

Same tuned native image (`-Xmx512m -Xmn256m`, 768m limit), 8 runs, zero errors. `native-valkey` sets `API_RATE_LIMIT_BACKEND=redis`, `EVENT_BACKEND=redis` and Valkey health checks against a `valkey/valkey:8-alpine` container on the same Docker network (best case: no cross-host latency). Rate-limit window tested at 60 s (~13k entries per caller, as in all runs above) and 1 s (~220 entries, comparable to production's 300/min). Results: `results-valkey.json`, `results-valkey-window1.json`, `summary-valkey.csv`.

| Backend | Requests/s | p95 ms | p99 ms | API loaded peak | Extra container |
| --- | ---: | ---: | ---: | ---: | ---: |
| In-process (rate limiter map + broadcast processor) | 211.7–214.4 | 156–158 | 185–188 | 365–397 MiB | — |
| Valkey | 210.9–212.9, one run 187.4 | 156–187 | 182–263 | 376–401 MiB | ~12 MiB |

- Valkey gives **no performance benefit** on one node: typically −1%, one run −12% with a p99 spike, and readiness +1–3 s for the Redis health check. The rate-limit `EVAL` is an extra network round trip on every `/api` and MCP request.
- Caffeine is not involved in either path. It only caches serialized factions per node; Valkey is never used as a cache. Moving that cache to Valkey would add a network hop and deserialization to a lookup that is currently an in-process map hit.
- Valkey is a correctness feature for 2+ API nodes (shared rate-limit budget, cross-node live events), not a speed-up. Keep `memory` for the single-container deployment.
- The window size made no measurable difference to in-process throughput (212–214 req/s at both), so the per-request timestamp copy in `InMemoryRateLimiter` is not a bottleneck.

## Setup

- Docker Desktop Linux/WSL2, AMD64, Docker 29.8.2; 24 host CPUs and 15.58 GiB available to Docker.
- Quarkus 3.39.5 / Java 25; native compiled with Mandrel 25.0.3.0, `-O2`, x86-64-v3 and Serial GC.
- Each API container gets 2 CPUs, no memory limit and no explicit heap size. Only one API runs at a time. The separately labelled free-heap experiment adds one runtime flag.
- Shared isolated PostgreSQL 18.6 database: 500 items, 20 assemblies, 5 warehouses. Fixtures created through MCP (locations through REST); every item has a 264-character description.
- Production profile, synthetic RSA-signed OIDC JWTs with a local discovery/JWKS service, development authentication disabled. Telemetry export disabled; rate limit raised to avoid throttling the benchmark.
- Two fresh-container runs per backend, reversed order: JVM/native/micro then micro/native/JVM. Per run: CRUD/media/auth smoke checks, 10 s idle, 30 s warm-up, 60 s measured load, 10 s idle.
- 16 concurrent closed-loop HTTP workers; equally weighted catalog pages/search, assemblies, inventory summary, availability reports, item details, PNG download and MCP item details. Four additional authenticated SSE connections remain open during load.
- Memory sampled about once per second from cgroup v2 and `/proc/1/status`. Working set = `memory.current - inactive_file`, matching Docker's cache-adjusted convention. RSS is the API process, not reserved virtual memory. Peaks in the comparison are sampled peaks; raw cgroup lifetime peaks are also retained.

## Results

Ranges below cover the two runs. Memory values are MiB; idle is measured after smoke checks, before warm-up. Load medians and sampled peaks cover the measured 60-second phase.

| Backend | Idle working set | Loaded median working set | Loaded peak working set | Requests/s | p95 latency (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| JVM | 527–532 | 857–921 | 926–965 | 185–207 | 164–178 |
| Native, default GC settings | 155–160 | 766–924 | 973–1,107 | 199–204 | 169 |
| Native-micro, identical executable | 109–155 | 778–796 | 1,021–1,056 | 202–203 | 164–166 |
| Native with `-XX:MaxHeapFree=64m` | 108–109 | 442–455 | 794–804 | 149–156 | 202–207 |

The default runs completed **71,872 measured requests, zero workload errors**, and SSE heartbeats were received in every run. Native lowers the idle footprint, but its default settings do **not** establish a consistent peak-memory saving under this sustained workload. Throughput/latency are broadly similar; the JVM's repeat throughput varied by about 11%, so small differences should not be treated as proven gains or regressions.

Process RSS supports the peak-memory finding: the JVM peaked at 939–970 MiB, native at 1,085–1,216 MiB and micro at 1,133–1,166 MiB. Container working-set accounting excludes inactive file cache and can charge shared file-backed pages differently between image/container lifetimes; the raw RSS and cgroup samples are retained together.

The free-heap setting reduced native's average loaded median working set by about **47%** and its average sampled peak by about **23%**, while reducing throughput by **24.5%** versus default native. Its p99 latency increased from 191–192 ms to 257–276 ms. Maximum heap growth remained unchanged. For a runtime-performance priority, this setting is not enabled in either Dockerfile or the Compose override.

Original recommendation (retain default heap/GC ergonomics) is superseded by the re-run above: run native with `-Xmx512m -Xmn256m` and a 768m container limit, now the default in both native Dockerfiles and `docker-compose.native.yml`. Micro packaging provides no intrinsic additional runtime saving.

The two native Dockerfiles produce the same kind of runtime image and use the exact same binary in this comparison (SHA-256 `599a50dfa270f952f9dd067ed3884c683205abb4ec04b565311ff89a1159cb7a`). Image sizes are about 601 MiB JVM versus 249 MiB native/micro. Smaller disk images do not establish lower loaded RAM.

The frontend Nginx container used **25.1 MiB idle** and **30.4 MiB peak working set** during 19,265 static HTTP requests over 30 seconds, with zero errors. Its memory is shared infrastructure for either backend choice; this does not include RAM in the user's browser.

Native Docker readiness took about 0.7–0.9 s versus 4.3–4.7 s for JVM, including container creation and polling. Native compilation itself used **9.84 GB peak RSS**; build RAM is separate from runtime RAM.

Per-run numbers: [summary CSV](../backend/target/native-memory-benchmark/summary.csv). Full samples, image identities, Docker environment and build/test/runtime logs are retained in the same artifact directory. Temporary benchmark containers/network/database storage were removed after measurement; the four application images and test build images remain locally. These memory numbers describe the containers, not the entire Docker Desktop/WSL VM or host file cache.

## Validation and findings

- Frontend production build/typecheck passed; 99 existing Bun tests passed.
- JVM and native Docker builds passed. The micro image packages the same native executable rather than performing another compilation.
- 207 existing backend Maven tests passed in Docker against a separate disposable database.
- Native preflight passed production startup, JWT authentication and anonymous-request denial, MCP create/read/update/retire, long descriptions, catalog/assemblies/reports and a 787,252-byte PNG upload/download round trip. MCP discovery returned 27 tools; the benchmark does not exercise every tool.
- Fixed item descriptions failing above 255 characters by using `text` in the entity and baseline. The 500-item import reproduces and checks this case.
- Fixed the frontend Docker context including backend build artifacts by excluding `backend/`.
- One native rebuild failed in Quarkus Arc/LazyValue initialization with a ForkJoin worker reachable in the image heap; an unchanged retry passed. This remains a build-reliability issue, not a demonstrated runtime failure. Diagnostic: `native-build-intermittent-failure.log`; a similar upstream trace is tracked in [quarkus-cxf #1856](https://github.com/quarkiverse/quarkus-cxf/issues/1856).

## Reproduction

Use Python with `httpx` and `cryptography`, plus Docker. Build images from the repository root:

```bash
docker build -f backend/Dockerfile -t inventory-benchmark:jvm backend
docker build -f backend/Dockerfile.native -t inventory-benchmark:native backend
docker build -f Dockerfile -t inventory-benchmark:frontend .
python tests/tools/native_memory_benchmark.py --prepare
```

To package the identical executable through the micro Dockerfile, copy `/work/application` out of a stopped native container to `target/inventory-runner` in a new packaging context, alongside `Dockerfile.native-micro` and its `.dockerignore`, then build that context as `inventory-benchmark:native-micro`. The exact context used here is retained under `backend/target/native-memory-benchmark/micro-context/`.

Run `python tests/tools/native_memory_benchmark.py --run`. The harness refuses to overwrite its named benchmark network, uses only its own database, and writes raw results plus application logs to the artifact directory. `--cleanup` removes only its named containers/network and disposable database storage; built images and evidence remain.

The optional free-heap experiment uses the same native image, with `-XX:MaxHeapFree=64m` appended to the executable:

```bash
python tests/tools/native_memory_benchmark.py --run --variants native-free64m --results-file results-free64m.json
```

This changes the retained free heap chunks after collection, not the maximum live heap size.

Heap-sizing variants from the re-run (`jvm-x256`, `jvm-serial-x256`, `native-x256`, `native-x128`, `native-x256-mn128`, `native-x512-mn256`) apply their flags and a hard container limit automatically. Images built after this change default to `-Xmx512m -Xmn256m`, so the plain `native` variant then measures the tuned setting; the uncapped baseline needs an image built before it:

```bash
python tests/tools/native_memory_benchmark.py --run --variants native native-x512-mn256 --results-file results-young.json --cooldown 60
``` [GraalVM option documentation](https://www.graalvm.org/jdk25/reference-manual/native-image/optimizations-and-performance/MemoryManagement/)

## Limits

This is a short local synthetic comparison, not a production capacity guarantee. It covers authenticated reads and smoke mutations with local media. External Authentik, TLS, S3, telemetry export, distributed Redis, browsers, larger datasets, prolonged writes and multi-hour retention are not represented. Request throughput is also affected by the Windows HTTP client, Docker networking and shared database. Default native and JVM heap ergonomics differ; these results intentionally compare the shipped defaults without constraining RAM.
