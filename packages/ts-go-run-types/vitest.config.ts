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
// `virtual:runtypes-isType` / `virtual:runtypes-cache` modules become
// importable.
//
// `resolve.alias` redirects the package self-import to the in-tree
// source. tsgo (Go-side checker) resolves `@mionjs/ts-go-run-types` to
// the local workspace package by package-name match before walking up
// to node_modules — but its handling of our particular dist+src layout
// breaks for self-imports. The runtime alias here keeps Vite's
// resolution clean; tsgo's resolution is handled separately by the
// test/runtypes.d.ts ambient overlay (auto-included via
// tsconfig.test.json's include glob).
//
// `cwd` is the package dir + `tsconfig.test.json` extends the build
// config to also include `test/**`, so the Go resolver's Program
// covers every file vitest loads. The build tsconfig stays strict
// (src-only) so `pnpm build` doesn't compile test files into dist.
export default defineConfig({
  resolve: {
    alias: {
      '@mionjs/ts-go-run-types': resolve(PACKAGE_ROOT, 'src/index.ts'),
    },
  },
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
