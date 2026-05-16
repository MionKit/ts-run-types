import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.dist/**',
      '**/coverage/**',
      '**/.coverage/**',
      '**/.nx/**',
      'third_party/**',
      'bin/**',
      'scripts/**',
      '**/vite.config.ts',
      '**/vitest.config.ts',
      'eslint.config.js',
      // Hand-authored cache skeletons. The `factory` / `rt` helpers are
      // consumed by the generated region the Go binary splices in at
      // build time, so eslint flags them as unused. `@ts-nocheck` keeps
      // the strict-mode TS compiler quiet about implicit-any parameters
      // for the same reason. Both are intentional — keep the skeletons
      // out of lint's scope.
      'packages/ts-go-run-types/src/caches/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-empty-function': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {args: 'none'}],
      'no-unused-vars': ['warn', {args: 'none'}],
    },
  }
);
