# Agent Guidelines (Claude, GPT, and AI Assistants)

## Tech Stack Overview
- **Backend:** Quarkus (Java / Maven)
- **Frontend:** React + Vite, managed and bundled with **Bun** (`bun.lock`)

This project is in active **new development**. Follow these mandatory rules:

## 1. No Builds or Tests
- **Do not build the app:** Do not execute build or packaging commands for either stack:
  - Backend: No `mvn package`, `mvn compile`, `quarkus build`, or Docker builds.
  - Frontend: No `bun run build`, `bun build`, `vite build`, etc.
- **Do not test the app:** Do not run test suites (`mvn test`, `bun test`, etc.) or generate boilerplate test suites unless explicitly requested.

## 2. No Backwards Compatibility
- **Do not preserve backwards compatibility:** Do not introduce compatibility layers, deprecated shims, dual-read/write paths, or fallback adapters.
- Modify existing code, APIs, and frontend/backend interfaces directly in place with the cleanest modern design.

## 3. No Migration Steps / Schema Versioning
- **Do not add incremental migration steps:** Do not create new Flyway migration files (e.g., `V1.x.x__*.sql`) or versioned schema scripts.
- Schema changes, Quarkus Panache/Hibernate entities, and database structures should be edited directly in the baseline schema or entity definitions.

## 4. Disposable Data & Greenfield State
- **All data can simply be replaced:** Assume data is non-production, disposable, and can be dropped, recreated, or wiped at any time.
- Prefer clean, straightforward schema and code updates over data-preservation workarounds.

## 5. Adding Data
- If not needed for UI tests use the availabel MCP server of the application for crud operations


## 6. Bugfixes
- If a bugfix is requested. You are allowed to run build and tests to ensure nothing breaks
- Always create a review file with all points that need to be worked on. 
- Track the progress of the tasks in the same file
- Other problems that are found during the investigation of the other problems should also be fixed and documented as well
