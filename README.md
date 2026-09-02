# ASH Inventory

Responsive inventory and custody management for event logistics. The repository contains the React PWA and its transactional Quarkus/PostgreSQL backend.

## Development

Frontend (Bun):

```bash
bun install
bun run dev
bun run build
```

Backend (Java 25):

```bash
cd backend
mvn quarkus:dev
```

Development mode uses an in-memory H2 database and does not require Docker,
PostgreSQL, Grafana, or an OpenTelemetry collector. Production uses PostgreSQL
and Flyway as configured in `docker-compose.yml`.

Run the complete local stack with `docker compose up --build`. The frontend reads `window.__ENV__.API_URL` or `VITE_API_URL`. Production authentication uses Authentik bearer tokens validated by Quarkus OIDC; set `DEV_AUTH_ENABLED=false` in every deployed environment.

## PostgreSQL schema and API

Flyway owns schema changes in `backend/src/main/resources/db/migration`. OpenAPI, Swagger UI, and health endpoints are available at `/q/openapi`, `/q/swagger-ui`, and `/q/health`.

The legacy `pb_schema.json` remains only as a migration reference and is not used at runtime.

Roles are enforced by the backend: `admin`, `inventory_manager`, `warehouse_packer`, and `faction_leader`. Faction leaders can only access assigned factions; inventory lifecycle actions remain crew-only.

## Offline field operation

The production build installs as a PWA. Reads are cached by the service worker and operational writes use an IndexedDB append-only queue with UUID idempotency keys. The queue replays through `/api/sync` after connectivity returns and its status is shown in the header.

## Faction order workflow

Open **Events → Faction lists** to create a dated list for a faction. Individual items and assemblies can be selected; both are filtered by their event tags. A draft can copy the previous list and display changes. Its lifecycle is:

```text
draft → submitted → preparing → ready → picked up → partially returned/returned → closed
```

Prepared quantities reserve available stock from other open lists. Assembly quantities are normalized into component lines. Pickup and return run atomically under row locks, incomplete components retain customer custody, and the append-only order ledger records server time, actor, status, and line deltas.

## Vite template notes

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
