# Access rights fixes

- [x] P1: Allow ASH item takeout and prepared-order pickup, keeping catalog edits and preparation with warehouse workers.
- [x] P2: Default new system members to read-only; assign tenant explicitly.
- [x] P2: Store multiple assigned roles and use the highest role for permissions.
- [x] P2: Refresh browser identity and discard stale permission-dependent views after role changes.
- [x] Fold V1.1/V1.2 schema into the baseline, delete upgrade/backfill files and migration instructions; update Authentik and related docs.
- [x] Restore PostgreSQL tests and remove an accidental diff header, as requested.
- [x] Verification: typecheck and focused lint pass; 54 frontend regressions and 8 Java role regressions pass; clean backend compilation passes; single baseline contains 60 tables and the required columns.
- [ ] PostgreSQL API/baseline tests: not run because `TEST_DB_URL` is unset and Docker is not running. API regressions for ASH checkout/pickup and removing ASH while retaining faction leadership are added.
