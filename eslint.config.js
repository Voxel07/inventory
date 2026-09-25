import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import reactCompiler from 'eslint-plugin-react-compiler'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-compiler': reactCompiler,
    },
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'react-compiler/react-compiler': 'error',
      // Tracked suppression, not a silent one. Derived-state conversions are complete
      // everywhere except the sites listed below; they each need behavioural
      // verification before this rule can be turned back on (see
      // REQUIREMENTS_ARCHITECTURE.md, "Derived state conversion backlog").
      //   components/common/ImageAttachments.tsx:22
      //   components/forms/FactionOrderForm.tsx:158,162
      //   components/orders/detail/OrderPickupMapDialog.tsx:62
      //   components/procurement/ProcurementOrders.tsx:44
      //   pages/EventDetail.tsx:71
      //   pages/Events.tsx:92,97
      //   pages/FactionOrderDetail.tsx:78
      //   pages/FactionOrders.tsx:110
      //   pages/ItemDetail.tsx:134
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
