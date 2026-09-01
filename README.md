# ASH Inventory

Responsive inventory management for items, assemblies, damage reports, event planning, and faction order lists.

## Development

This project uses Bun (not npm):

```bash
bun install
bun run dev
bun run build
```

The PocketBase URL is read from `window.__ENV__.POCKETBASE_URL` or `VITE_POCKETBASE_URL`.

## PocketBase schema

Import `pb_schema.json` into PocketBase before using the application. The faction-order feature requires the new `inventory_faction_orders` collection and the optional `factionOrderId` relation on `inventory_stock_transactions`.

Re-import the schema after updating this version. It adds PocketBase-backed item images and hints, storage-location map data/overlay files, sequential faction-order codes, pickup locations, and the existing `users` auth collection definition. The provided users definition preserves OAuth and password authentication while expanding the existing `role` and multi-select `faction` fields. New order codes use `event-faction-year-0001` and increment within that event/faction/year combination.

Authorization comes directly from the normal PocketBase `users` collection—there is no separate access collection. OAuth may map the application role into `role`; `admin`, `Admin`, the existing `Admin ` value, `manager`, and `inventory_manager` receive full inventory access. Other authenticated roles (including the existing `User`, `banker`, and `player` values) are treated as faction leaders. Use **User management** to assign one or more values in the existing `faction` multi-select. Faction leaders only see those faction lists and can create, edit, submit, or cancel orders they created; inventory lifecycle actions remain manager-only.

The users API rules allow managers to list and update all users. Users may still edit their own normal profile fields, but cannot change their own `role` or `faction`, which prevents self-promotion. Changes to either field are delivered through PocketBase realtime and take effect in active sessions without a page refresh.

Item and order QR codes are generated on demand. QR image data is no longer stored in PocketBase.

## Faction order workflow

Open **Events → Faction lists** to create a dated list for a faction. Individual items and assemblies can be selected; both are filtered by their event tags. A draft can copy the previous list and display changes. Its lifecycle is:

```text
draft → preparing → ready → picked up → returned
```

Prepared quantities reserve available stock from other open lists. Assembly quantities are expanded to their component requirements for availability, reservation, pickup, and return. Pickup and return create batched component stock transactions, while the list history records the acting users and timestamps. The downloadable list QR always opens the current state and its next valid action.

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
