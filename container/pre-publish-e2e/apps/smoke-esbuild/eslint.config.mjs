// ESLint v9+ flat config wiring the RunTypes lint transport (the SAME module that
// serves oxlint, here as an ESLint plugin). The transport, not the diagnostic
// catalog, is under test: linting the caveat must surface an RT diagnostic.
//
// No `files` restriction so the config applies to whatever file eslint is told to
// lint (the lint-transport test targets src/caveat.ts explicitly). settings.runtypes.cwd
// points the resolver at this app's tsconfig; in-container the binary resolves via
// the published @ts-runtypes/bin launcher, RT_E2E_BINARY overrides for host runs.
import runtypes from '@ts-runtypes/devtools/eslint';
import tsParser from '@typescript-eslint/parser';

const appDir = new URL('.', import.meta.url).pathname;

export default [
  {
    // `**/*.ts` both opts ESLint into linting TypeScript and matches the target
    // regardless of the cwd the linter runs from. A TS parser is the standard
    // ESLint-on-TypeScript requirement (espree can't parse `interface`).
    files: ['**/*.ts'],
    languageOptions: {parser: tsParser},
    plugins: {runtypes},
    settings: {
      runtypes: {
        cwd: appDir,
        ...(process.env.RT_E2E_BINARY ? {binary: process.env.RT_E2E_BINARY} : {}),
      },
    },
    rules: {
      'runtypes/error': 'error',
      'runtypes/warn': 'warn',
      'runtypes/info': 'off',
    },
  },
];
