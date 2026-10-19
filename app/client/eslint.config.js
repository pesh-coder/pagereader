import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Keep create-bsv-app helpers verbatim; these contexts intentionally co-export hooks.
  {
    files: ['src/bsv/WalletContext.tsx', 'src/bsv/WalletConnectionContext.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  // The generated shared auth primitive accepts SDK request bodies as `any`.
  {
    files: ['src/bsv/auth.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
])
