# Test review — 5 October 2026

Scope: every file in `backend/src/test/` and `tests/`, current requirements in
`ARCHITECTURE.md`, and the actual REST/MCP implementations. Target designs are
excluded from current-behavior assertions.

## Findings, by priority

- [x] **P1:** PostgreSQL profiles failed after the baseline profile installed
  `pg_trgm` in its isolated schema. Pin the extension and index operator classes
  to `public`; verify all profiles together.
- [x] **P1:** Assembly updates recreated managed composite IDs; deletion left
  managed components referencing a removed assembly. Reuse/remove managed rows.
- [x] **P1:** Asset edits/relocation/condition and loan creation returned stale
  versions. Flush before mapping the response; test immediate follow-up commands.
- [x] **P1:** Vendor-document attachment flushed a row with unset required
  metadata. Inspect the staged object before persistence; test PDF attachment.
- [x] **P1:** Add missing REST workflows, MCP reads/resources/prompts and frontend
  behavior checks. Audit actual dispatches by resource, method **and HTTP verb**;
  overloaded maintenance handlers now have independent GET/POST evidence.
- [x] **P2:** Remove `refactoring.browser.html/.jsx` (superseded by the broader UI
  preview); fix stale role, 512 px, stock, query-budget, JWT and image fixtures.
- [x] **P2:** Finish the retained sample smoke's count approval/posting and new-lot
  receipt; load reference data from the API.
- [x] **P2:** Inventory every test/support/preview file, map all current architecture
  requirement IDs, document execution and preserve external acceptance limits.

## Verification

Initial frontend: 39 passed. Initial backend: 148 discovered, 3 startup errors,
116 skipped because later profiles could not resolve `gin_trgm_ops`.

Final: **163 backend tests**, no failures/errors/skips; **52 frontend tests**;
**157/157 REST handlers** (156 ordinary dispatches + verified HTTP SSE);
all **21 MCP tools**, three resources and two prompts exercised. Backend packaging,
frontend production build/typecheck and lint passed. The browser media fixture
passed all 21 assertions; all five retained preview entry points rendered, with
assembly crop/upload/save and item image removal/save checked interactively.

The live sample smoke passed on a separate disposable PostgreSQL database:
340 item rows, 50 assembly rows, idempotent bulk/lot receipts, transfer and resumed
count approval/posting. Build emitted the existing large-bundle warning.

Full file dispositions, requirement mapping, commands and remaining environment
acceptance: [tests/README.md](../tests/README.md). Reproducible endpoint details:
`python tests/tools/endpoint_coverage.py --markdown backend/target/endpoint-coverage.md`
after a fresh instrumented suite. No line/branch coverage percentage is claimed.
