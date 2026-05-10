// ESLint v9 flat config
// Uses the compatibility layer to wrap the legacy eslint-config-next format.
import { FlatCompat } from '@eslint/eslintrc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      // Allow empty catch blocks (used for analytics guard pattern)
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Ignore build artifacts and generated files
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
