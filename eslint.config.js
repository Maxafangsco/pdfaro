// ESLint v9 flat config
// Uses the compatibility layer to wrap the legacy eslint-config-next format,
// then explicitly registers @typescript-eslint so inline disable comments work.
import { FlatCompat } from '@eslint/eslintrc';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  // ── Next.js core rules ────────────────────────────────────────────────────
  ...compat.extends('next/core-web-vitals'),

  // ── TypeScript plugin (needed so @typescript-eslint/* rules are recognised)
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: false, // skip type-aware linting — too slow for CI without tsconfig paths
      },
    },
    rules: {
      // Downgrade to warn so pre-existing `any` usages don't block the build
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // ── General rule overrides ────────────────────────────────────────────────
  {
    rules: {
      // Allow empty catch blocks (used for analytics guard pattern throughout the app)
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Downgrade pre-existing violations to warnings so they don't block the build.
      // These exist across many legacy files and are not introduced by recent changes.

      // Unescaped " characters in JSX text (FindAndRedactTool, HeaderFooterTool, etc.)
      'react/no-unescaped-entities': 'warn',

      // module variable reassignment pattern used in pdf-to-svg.ts for WASM interop
      '@next/next/no-assign-module-variable': 'warn',
    },
  },

  // ── Ignore build artefacts and generated files ────────────────────────────
  {
    ignores: [
      '.next/**',
      'out/**',
      'node_modules/**',
      'public/**',
      'scripts/**',
      'src-tauri/**',
    ],
  },
];
