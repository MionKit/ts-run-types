import {defineConfig} from 'vitest/config';

// Root vitest config is intentionally minimal — each package's own
// vitest.config.ts is loaded as a workspace project via
// vitest.workspace.ts so their plugins (vite-plugin-runtypes installed
// in ts-go-run-types/vitest.config.ts) actually apply at test time.
export default defineConfig({
  test: {
    globalSetup: ['./scripts/vitest-global-setup.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**'],
    },
  },
});
