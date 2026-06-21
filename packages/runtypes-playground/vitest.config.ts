import {defineConfig} from 'vitest/config';

// The engine imports `ts-runtypes` for its runtime factories; resolve it to the
// marker package's source (its `source` export condition) so tests run against
// in-tree code rather than a built dist. Node environment: the engine test drives
// the resolver WASM through a Node loader (no DOM).
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  test: {
    include: ['test/**/*.{test,spec}.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
