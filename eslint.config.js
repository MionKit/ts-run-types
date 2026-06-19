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
      'packages/ts-runtypes/src/caches/**',
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
    // Test files + test-support helpers under any test/ dir are not part of a
    // build tsconfig (each package's build config is src-only), so the
    // type-aware projectService can't place them. The rules configured here
    // are non-type-checked anyway, so opt these files out of the project
    // service — otherwise linting one (e.g. when lint-staged stages a renamed
    // test helper) fails with "not found by the project service". Also relax
    // unused-vars for test scaffolding.
    files: ['**/*.spec.ts', '**/*.test.ts', '**/test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {args: 'none'}],
      'no-unused-vars': ['warn', {args: 'none'}],
    },
  }
);
