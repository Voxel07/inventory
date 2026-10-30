# Quarkus dev startup findings

- [x] P1 — Stale `StockDtos$LotCreateInput.class` and `StockDtos$LotUpdateInput.class` remained in `backend/target/classes` after removal from the source, causing Hibernate Validator's `InnerClasses` failure. Removed generated `backend/target` and recompiled successfully.
- [x] P2 — The documented dev command reused stale build output. Changed it to `mvn clean quarkus:dev`; stop the existing dev process before restarting.
- [x] Verification — `mvn -o compile -DskipTests` passed after cleanup; obsolete DTO classes are absent; `Class.getCanonicalName()` passes for every remaining `StockDtos` class; `python3 scripts/check-architecture.py` passed.

Environment: Maven's clean plugin is not cached, and the sandbox Maven cache is read-only, so generated output was removed directly before offline compilation. Full dev-server startup was not exercised.
