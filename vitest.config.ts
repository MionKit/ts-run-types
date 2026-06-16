import {defineConfig} from 'vitest/config';

// Root vitest config is intentionally minimal — each package's own
// vitest.config.ts is loaded as a workspace project via
// vitest.workspace.ts so their plugins (vite-plugin-runtypes installed
// in ts-runtypes/vitest.config.ts) actually apply at test time.
//
// The Go binary at bin/ts-runtypes is built by the root `pretest`
// script (see package.json) — it MUST be in place before vitest boots,
// because vite-plugin-runtypes spawns it from its `configResolved`
// hook, which fires during workspace-project initialization (before
// any vitest globalSetup would run). Don't add a globalSetup-based
// rebuild here; it would be too late for the already-spawned child.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**'],
    },
  },
});
