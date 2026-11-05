# User input security review

Status: fixed and verified. Priorities: P1 high, P2 medium.

- [x] **P1 — Webhook SSRF:** pin connections to validated public IPs; retain hostname/TLS verification; reject redirects and special address ranges.
- [x] **P1 — Numeric overflow:** prevent wrapped return/assembly/stock totals, truncated CSV quantities and extreme decimal exponents; check money against integer-cent storage.
- [x] **P1 — Asset creation abuse:** limit serialized creation to 1000 per item/batch/receipt; reject overflowing generated number ranges and excessive expanded order lines.
- [x] **P2 — Server validation gaps:** bound command text, collections, query/path values and coordinates; reject NULs, required null bodies and null nested entries. Shared contracts cover REST, MCP, offline sync and CSV commands.
- [x] **P2 — JSON parsing/envelopes:** bound nesting/token lengths, reject duplicate keys, fractional integers and numeric enums; check raw sync/import JSON before JSONB persistence.
- [x] **P2 — Spreadsheet formula injection:** escape procurement/report CSV cells, including formulas hidden behind whitespace.
- [x] **P2 — File handling:** normalize and shorten filenames; reject control characters, traversal and platform-specific key syntax before media lookups.
- [x] **P2 — Browser CSV abuse:** cap file/field/row/column sizes, reject malformed/duplicate headers and NULs, use objects without inherited properties, and display parse failures in the dialog.
- [x] **P2 — Architecture checker slowdown:** replace annotation regex backtracking with balanced scanning; retain dependency checks.

Reviewed safeguards: SQL/HQL values use bound parameters, LIKE searches escape wildcards, sorts use an allowlist, and no user-driven shell execution or raw HTML rendering was found. QR destinations use fixed internal routes. Production authentication, resource authorization, rate limits, upload type/size checks and media access checks remain enforced. Identity fields are now bounded before persistence.

Verification: 35 backend tests and 27 frontend tests passed; TypeScript, DE/EN translations, changed-file ESLint, architecture gate (6 modules / 68 owned tables), five architecture-parser regression checks and git whitespace checks passed. Backend checks used Java 25; no production database was modified.

Limits: source review and focused regressions; no live penetration test, full database-backed API suite, deployment review or dependency audit. This does not prove immunity to every attack. New limits intentionally reject oversized requests rather than silently changing their contents.

References: [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [Vert.x connection address options](https://vertx.io/docs/4.5.36/apidocs/io/vertx/core/http/RequestOptions.html), [Jackson parsing limits](https://github.com/FasterXML/jackson-core).
