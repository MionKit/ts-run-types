import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import runtypesPlugin from 'vite-plugin-runtypes';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_ROOT = resolve(HERE);
const REPO_ROOT = resolve(HERE, '../..');

// Mirrors mion's run-types/vitest.config.ts shape: install the runtype
// transformer as a Vite plugin so test source files (which import
// `createIsType` and friends from `@mionjs/ts-go-run-types`) get
// rewritten with the resolved runtype id at compile time, AND the
// three cache modules under `caches/*.ts` get their bodies overlaid by
// the plugin's `transform()` hook with the Go binary's rendered output.
//
// `resolve.conditions: ['source']` picks up the `"source"` exports
// entry on `@mionjs/ts-go-run-types`'s package.json (pointing at
// `src/index.ts`) — same condition `tsconfig.test.json` declares for
// tsgo via `customConditions`. The two resolvers (vite at runtime,
// tsgo for type-checking the marker scan) now both land on the same
// in-tree source, with no alias plumbing required. SSR's resolver
// honors the same conditions list.
//
// `cwd` is the package dir + `tsconfig.test.json` extends the build
// config to also include `test/**`, so the Go resolver's Program
// covers every file vitest loads. The build tsconfig stays strict
// (src-only) so `pnpm build` doesn't compile test files into dist.
export default defineConfig({
  resolve: {
    conditions: ['source'],
  },
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    runtypesPlugin({
      binary: resolve(REPO_ROOT, 'bin/ts-go-run-types'),
      cwd: PACKAGE_ROOT,
      tsconfig: 'tsconfig.test.json',
      // Force the inline-factory emit on for the test run so suites cover
      // BOTH materialisation paths on every case:
      //   - createIsType<T>() / createXxx<T>() → reads entry.createRTFn
      //     (the inline closure baked in by the Go renderer)
      //   - deserializeIsType<T>() / deserializeXxx<T>() → ignores the
      //     inline closure and rebuilds the factory from entry.code via
      //     `new Function('utl', code)`.
      // The production default leaves this off so emitted modules are
      // smaller and runtimes without `new Function` opt back in by
      // setting `emitCreateRTFn: true` on the plugin themselves.
      emitCreateRTFn: true,
    }),
  ],
  test: {
    name: 'runtypes',
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
