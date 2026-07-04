import {defineConfig} from 'vitest/config';

// Root vitest config. Each package's own vitest.config.ts is loaded as a
// project via `test.projects` below (Vitest 4 removed the standalone
// `vitest.workspace.ts` file — project definitions must live inline in the
// root config now). Loading them as projects is what makes their plugins
// (notably runtypes-devtools installed in ts-runtypes/vitest.config.ts)
// actually apply at test time.
//
// The Go binary at bin/ts-runtypes is built by the root `pretest`
// script (see package.json) — it MUST be in place before vitest boots,
// because runtypes-devtools spawns it from its `configResolved`
// hook, which fires during project initialization (before
// any vitest globalSetup would run). Don't add a globalSetup-based
// rebuild here; it would be too late for the already-spawned child.
export default defineConfig({
  test: {
    projects: [
      'packages/ts-runtypes/vitest.config.ts',
      'packages/runtypes-devtools/vitest.config.ts',
      'packages/runtypes-playground/vitest.config.ts',
    ],
    // Coverage is a root-level (cross-project) concern. Vitest 4 removed
    // `coverage.all`; the report now defaults to covered files only, so the
    // explicit `include` below is what keeps whole-source coverage.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**'],
    },
  },
});
