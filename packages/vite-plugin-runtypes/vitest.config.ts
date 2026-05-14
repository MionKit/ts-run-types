import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    name: 'vite-plugin-runtypes',
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['../../scripts/vitest-global-setup.mjs'],
    // setupFiles runs once per test file (in the worker) — this is where
    // we register the cross-file reset hook for the shared ts-go-run-types
    // process. See test/setup.ts and test/helpers/inline.ts.
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
