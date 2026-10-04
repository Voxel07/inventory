# Backend P1 fixes

- [x] P1: Reuse the managed actor within a transaction; reload by ID across transactions and recover after rollback.
- [x] P1: Select denied roots in batches and scope response/edit provenance to referenced IDs; reuse classification facts for filtering and the private-response header.
- [x] P1: Add ten missing ledger, asset, damage, maintenance, image, order-line, procurement and planning indexes directly to the baseline.
- [x] Related privacy bug: normalize uppercase UUID object keys so they cannot bypass filtering.
- [x] Validation: 39 tests passed on Java 25 and temporary PostgreSQL 17.6, including privacy/transaction API tests, Flyway baseline validation and SQL statement budgets.

Scope: the three P1 findings in `BACKEND_STORAGE_REVIEW.md`. Preserve current permission semantics and command locks. No cache dependency replacement.

Measured: 100 repeated actor reads cause zero extra statements within a transaction; a new transaction reloads once by ID. Classifying 32 private items uses three statements and hydrates no entities. Global denied-reference selection also uses three statements; empty reference sets use none. Grant and group membership revocation are checked afresh.

Validation command: `mvn -o -Dtest=StorageQueryRegressionTest,PrivacyProjectionServiceTest,BaselineSchemaTest,PrivateInventoryApiTest,PriorityRefactorApiTest,MaintenancePolicyTest,InventoryModelInvariantTest,InMemoryRateLimiterTest,ActorServiceRoleTest,MediaServiceTest test` with `TEST_DB_URL`, `TEST_DB_USER`, and `TEST_DB_PASSWORD` pointing to the disposable test database. Query-statistics tests disable background polling to isolate their measurements. This verifies correctness and statement counts, not production latency.
