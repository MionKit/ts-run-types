import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
// Sibling workspace package imported by relative path rather than name.
// pnpm's workspace-dep declaration would trigger a lockfile-refresh that
// the minimumReleaseAge policy on transitives blocks; a path import
// works equivalently without touching the lockfile.
import runtypesPlugin from '../vite-plugin-runtypes/src/index.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_ROOT = resolve(HERE);
const REPO_ROOT = resolve(HERE, '../..');

// Mirrors mion's run-types/vitest.config.ts shape: install the runtype
// transformer as a Vite plugin so test source files (which import
// `createIsType` and friends from `@mionjs/ts-go-run-types`) get
// rewritten with the resolved runtype id at compile time, AND the
// `virtual:runtypes-isType` / `virtual:runtypes-cache` modules become
// importable.
//
// `resolve.conditions: ['source']` makes the `@mionjs/ts-go-run-types`
// self-import in tests resolve to `src/index.ts` (via the `"source"`
// condition in package.json `exports`) instead of the unbuilt `dist/`.
// Same trick as mion uses for its own self-imports in tests.
//
// `cwd` is the package dir + `tsconfig.test.json` extends the build
// config to also include `test/**`, so the Go resolver's Program
// covers every file vitest loads. The build tsconfig stays strict
// (src-only) so `pnpm build` doesn't compile test files into dist.
export default defineConfig({
  resolve: {
    conditions: ['source'],
    // Resolve the package's self-import to the in-tree source so tests
    // don't depend on a node_modules symlink. Mirrors mion's setup for
    // its own self-tests (run-types package importing from
    // `@mionjs/run-types`).
    alias: {
      '@mionjs/ts-go-run-types': resolve(PACKAGE_ROOT, 'src/index.ts'),
    },
  },
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    runtypesPlugin({
      binary: resolve(REPO_ROOT, 'bin/ts-go-run-types'),
      cwd: PACKAGE_ROOT,
      tsconfig: 'tsconfig.test.json',
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
