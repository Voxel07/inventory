# Item stock summary and history

- [x] P1: Persist total and available stock with inventory commands; row triggers collect all affected items and rollback preserves consistency.
- [x] P1: Observe time-based availability every minute; enable `stock-history` in the cluster worker configuration.
- [x] P2: Replace the maintenance warning with a maintenance / inspection count; count each affected on-hand unit once.
- [x] P2: Plot separate total-owned and available-stock step lines, with legend, quantity formatting and loading/error states.
- [x] Review: frontend type check (no output), targeted ESLint, translation validation and whitespace checks passed. No builds or test suites run.

Recording begins with new observations; historical availability is not inferred from old transactions. Schema changes are in the existing baseline.
