import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import runtypesPlugin from 'vite-plugin-runtypes';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_ROOT = resolve(HERE);
const REPO_ROOT = resolve(HERE, '../..');

// Same wiring as `packages/ts-go-run-types/vitest.config.ts`: the Vite
// plugin spawns the Go binary, rewrites call-sites with their resolved
// runtype id, and overlays the cache modules. We also pull in the
// `source` resolve condition so this package's self-import of
// `@mionjs/ts-go-run-types` (and any user code under test importing
// `@mionjs/ts-go-type-formats`) lands on the in-tree `src/` instead
// of an un-built `dist/`.
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
      emitCacheFunctions: true,
      cacheDir: false,
    }),
  ],
  test: {
    name: 'type-formats',
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
