import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
    ],
  },

  eslint.configs.recommended,

  ...tseslint.configs.recommended,

  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts'],

    languageOptions: {
      globals: {
        ...globals.node,
      },
    },

    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  {
    files: ['**/*.spec.ts', '**/*.test.ts'],

    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },

  eslintConfigPrettier,
);
